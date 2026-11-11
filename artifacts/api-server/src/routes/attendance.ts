import { createHash } from "node:crypto";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetMonthlyReportQueryParams,
  GetMonthlyReportResponse,
  ListAttendanceQueryParams,
  ListAttendanceResponse,
  TapNfcAttendanceBody,
  TapNfcAttendanceResponse,
} from "@workspace/api-zod";
import { attendanceRecordsTable, db, employeesTable } from "@workspace/db";
import { getClerkUserId, requireAuth } from "../middlewares/require-auth";
import { findCompanyForUser } from "../lib/tenant";
import {
  dateInTimeZone,
  minutesFromClock,
  minutesInTimeZone,
} from "../lib/tenant";

const router: IRouter = Router();

type AttendanceRow = {
  record: typeof attendanceRecordsTable.$inferSelect;
  employeeName: string;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function effectiveWorkMinutes(
  record: typeof attendanceRecordsTable.$inferSelect,
  now = new Date(),
): number {
  if (record.checkOutAt || !record.checkInAt) return record.workMinutes;
  return Math.max(
    0,
    Math.floor((now.getTime() - record.checkInAt.getTime()) / 60_000),
  );
}

function attendanceDto({ record, employeeName }: AttendanceRow) {
  return {
    ...record,
    employeeName,
    workMinutes: effectiveWorkMinutes(record),
    status: !record.checkOutAt
      ? "in-progress"
      : record.lateMinutes > 0
        ? "late"
        : "present",
  };
}

async function loadAttendance(
  companyId: number,
  from: string,
  to: string,
  employeeId?: number,
): Promise<AttendanceRow[]> {
  const filters = [
    eq(attendanceRecordsTable.companyId, companyId),
    gte(attendanceRecordsTable.attendanceDate, from),
    lte(attendanceRecordsTable.attendanceDate, to),
  ];
  if (employeeId !== undefined) {
    filters.push(eq(attendanceRecordsTable.employeeId, employeeId));
  }

  const rows = await db
    .select({
      record: attendanceRecordsTable,
      employeeName: employeesTable.fullName,
    })
    .from(attendanceRecordsTable)
    .innerJoin(employeesTable, eq(attendanceRecordsTable.employeeId, employeesTable.id))
    .where(and(...filters))
    .orderBy(desc(attendanceRecordsTable.attendanceDate), desc(attendanceRecordsTable.checkInAt));
  return rows;
}

router.post("/attendance/tap", requireAuth, async (req, res): Promise<void> => {
  const parsed = TapNfcAttendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const company = await findCompanyForUser(getClerkUserId(res));
  if (!company) {
    res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
    return;
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const [employee] = await db
    .select()
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.companyId, company.id),
        eq(employeesTable.nfcTokenHash, tokenHash),
        eq(employeesTable.isActive, true),
      ),
    )
    .limit(1);

  if (!employee) {
    res.status(404).json({ error: "البطاقة غير مرتبطة بعامل نشط في هذه الشركة" });
    return;
  }

  const now = new Date();
  const attendanceDate = dateInTimeZone(now, company.timeZone);
  const localNowMinutes = minutesInTimeZone(now, company.timeZone);
  const shiftStartMinutes = minutesFromClock(employee.shiftStartTime);
  const lateMinutes = Math.max(
    0,
    localNowMinutes - shiftStartMinutes - employee.gracePeriodMinutes,
  );

  const result = await db.transaction(async (tx) => {
    const lookup = () =>
      tx
        .select()
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.companyId, company.id),
            eq(attendanceRecordsTable.employeeId, employee.id),
            eq(attendanceRecordsTable.attendanceDate, attendanceDate),
          ),
        )
        .for("update");

    let [record] = await lookup();
    if (!record) {
      const [created] = await tx
        .insert(attendanceRecordsTable)
        .values({
          companyId: company.id,
          employeeId: employee.id,
          attendanceDate,
          checkInAt: now,
          lateMinutes,
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        return {
          action: "check-in" as const,
          timestamp: now,
          workMinutes: null,
          lateMinutes,
        };
      }
      [record] = await lookup();
    }

    if (!record || !record.checkInAt) {
      throw new Error("Attendance record could not be created");
    }
    if (record.checkOutAt) {
      return { action: "complete" as const };
    }

    const workMinutes = Math.max(
      0,
      Math.floor((now.getTime() - record.checkInAt.getTime()) / 60_000),
    );
    await tx
      .update(attendanceRecordsTable)
      .set({ checkOutAt: now, workMinutes })
      .where(eq(attendanceRecordsTable.id, record.id));
    return {
      action: "check-out" as const,
      timestamp: now,
      workMinutes,
      lateMinutes: record.lateMinutes,
    };
  });

  if (result.action === "complete") {
    res.status(409).json({ error: "تم تسجيل الانصراف لهذا العامل اليوم" });
    return;
  }

  res.json(
    TapNfcAttendanceResponse.parse({
      employeeName: employee.fullName,
      ...result,
    }),
  );
});

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const params = ListAttendanceQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!validDate(params.data.from) || !validDate(params.data.to)) {
    res.status(400).json({ error: "نطاق التاريخ غير صالح" });
    return;
  }
  if (params.data.from > params.data.to) {
    res.status(400).json({ error: "تاريخ البداية يجب أن يسبق تاريخ النهاية" });
    return;
  }

  const company = await findCompanyForUser(getClerkUserId(res));
  if (!company) {
    res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
    return;
  }
  const rows = await loadAttendance(
    company.id,
    params.data.from,
    params.data.to,
    params.data.employeeId,
  );
  res.json(ListAttendanceResponse.parse(rows.map(attendanceDto)));
});

router.get("/reports/monthly", requireAuth, async (req, res): Promise<void> => {
  const params = GetMonthlyReportQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [yearText, monthText] = params.data.month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (monthNumber < 1 || monthNumber > 12) {
    res.status(400).json({ error: "الشهر غير صالح" });
    return;
  }
  const from = `${params.data.month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const to = `${params.data.month}-${String(lastDay).padStart(2, "0")}`;

  const company = await findCompanyForUser(getClerkUserId(res));
  if (!company) {
    res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
    return;
  }
  const rows = await loadAttendance(company.id, from, to);
  const records = rows.map(attendanceDto);
  const byEmployee = new Map<
    number,
    {
      employeeId: number;
      employeeName: string;
      presentDays: number;
      lateDays: number;
      workMinutes: number;
      lateMinutes: number;
    }
  >();

  for (const { record, employeeName } of rows) {
    const summary = byEmployee.get(record.employeeId) ?? {
      employeeId: record.employeeId,
      employeeName,
      presentDays: 0,
      lateDays: 0,
      workMinutes: 0,
      lateMinutes: 0,
    };
    summary.presentDays += 1;
    summary.lateDays += record.lateMinutes > 0 ? 1 : 0;
    summary.workMinutes += effectiveWorkMinutes(record);
    summary.lateMinutes += record.lateMinutes;
    byEmployee.set(record.employeeId, summary);
  }

  res.json(
    GetMonthlyReportResponse.parse({
      month: params.data.month,
      totalWorkMinutes: rows.reduce(
        (sum, row) => sum + effectiveWorkMinutes(row.record),
        0,
      ),
      totalLateMinutes: rows.reduce((sum, row) => sum + row.record.lateMinutes, 0),
      presentDays: rows.length,
      lateDays: rows.filter(({ record }) => record.lateMinutes > 0).length,
      records,
      employees: [...byEmployee.values()].sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName, "ar"),
      ),
    }),
  );
});

export default router;

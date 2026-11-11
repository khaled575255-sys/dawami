import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { attendanceRecordsTable, db, employeesTable } from "@workspace/db";
import { getClerkUserId, requireAuth } from "../middlewares/require-auth";
import { dateInTimeZone, findCompanyForUser } from "../lib/tenant";

const router: IRouter = Router();

router.get(
  "/dashboard/summary",
  requireAuth,
  async (_req, res): Promise<void> => {
    const company = await findCompanyForUser(getClerkUserId(res));
    if (!company) {
      res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
      return;
    }

    const today = dateInTimeZone(new Date(), company.timeZone);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [employees, rows] = await Promise.all([
      db
        .select({ id: employeesTable.id })
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.companyId, company.id),
            eq(employeesTable.isActive, true),
          ),
        ),
      db
        .select({
          record: attendanceRecordsTable,
          employeeName: employeesTable.fullName,
        })
        .from(attendanceRecordsTable)
        .innerJoin(
          employeesTable,
          eq(attendanceRecordsTable.employeeId, employeesTable.id),
        )
        .where(
          and(
            eq(attendanceRecordsTable.companyId, company.id),
            gte(attendanceRecordsTable.attendanceDate, monthStart),
            lte(attendanceRecordsTable.attendanceDate, today),
          ),
        )
        .orderBy(desc(attendanceRecordsTable.checkInAt)),
    ]);

    const todayRows = rows.filter(
      ({ record }) =>
        record.attendanceDate === today &&
        employees.some((employee) => employee.id === record.employeeId),
    );
    const presentToday = todayRows.length;
    const totalWorkMinutes = rows.reduce(
      (sum, { record }) =>
        sum +
        (record.checkOutAt || !record.checkInAt
          ? record.workMinutes
          : Math.max(
              0,
              Math.floor((Date.now() - record.checkInAt.getTime()) / 60_000),
            )),
      0,
    );
    const recentAttendance = rows.slice(0, 8).map(({ record, employeeName }) => ({
      ...record,
      employeeName,
      workMinutes:
        record.checkOutAt || !record.checkInAt
          ? record.workMinutes
          : Math.max(
              0,
              Math.floor((Date.now() - record.checkInAt.getTime()) / 60_000),
            ),
      status: !record.checkOutAt
        ? "in-progress"
        : record.lateMinutes > 0
          ? "late"
          : "present",
    }));

    res.json(
      GetDashboardSummaryResponse.parse({
        companyName: company.name,
        today,
        totalEmployees: employees.length,
        presentToday,
        lateToday: todayRows.filter(({ record }) => record.lateMinutes > 0).length,
        absentToday: Math.max(0, employees.length - presentToday),
        hoursThisMonth: Math.round(totalWorkMinutes / 6) / 10,
        lateMinutesThisMonth: rows.reduce(
          (sum, { record }) => sum + record.lateMinutes,
          0,
        ),
        recentAttendance,
      }),
    );
  },
);

export default router;

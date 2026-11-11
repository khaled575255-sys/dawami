import { createHash, randomBytes } from "node:crypto";
import { and, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateEmployeeBody,
  CreateEmployeeNfcTokenParams,
  CreateEmployeeNfcTokenResponse,
  CreateEmployeeResponse,
  DeleteEmployeeParams,
  ListEmployeesQueryParams,
  ListEmployeesResponse,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
  UpdateEmployeeResponse,
} from "@workspace/api-zod";
import { db, employeesTable } from "@workspace/db";
import { getClerkUserId, requireAuth } from "../middlewares/require-auth";
import { findCompanyForUser } from "../lib/tenant";

const router: IRouter = Router();

function validClock(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

async function companyIdForUser(userId: string): Promise<number | null> {
  const company = await findCompanyForUser(userId);
  return company?.id ?? null;
}

router.get("/employees", requireAuth, async (req, res): Promise<void> => {
  const params = ListEmployeesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const companyId = await companyIdForUser(getClerkUserId(res));
  if (companyId === null) {
    res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
    return;
  }

  const search = params.data.search?.trim();
  const conditions = [eq(employeesTable.companyId, companyId)];
  if (search) {
    conditions.push(
      or(
        ilike(employeesTable.fullName, `%${search}%`),
        ilike(employeesTable.phone, `%${search}%`),
        ilike(employeesTable.position, `%${search}%`),
      )!,
    );
  }

  const employees = await db
    .select()
    .from(employeesTable)
    .where(and(...conditions))
    .orderBy(employeesTable.fullName);
  res.json(ListEmployeesResponse.parse(employees));
});

router.post("/employees", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!validClock(parsed.data.shiftStartTime)) {
    res.status(400).json({ error: "وقت بداية الدوام غير صالح" });
    return;
  }

  const companyId = await companyIdForUser(getClerkUserId(res));
  if (companyId === null) {
    res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
    return;
  }

  const [employee] = await db
    .insert(employeesTable)
    .values({
      ...parsed.data,
      companyId,
      phone: parsed.data.phone ?? null,
      position: parsed.data.position ?? null,
    })
    .returning();
  res.status(201).json(CreateEmployeeResponse.parse(employee));
});

router.patch(
  "/employees/:employeeId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateEmployeeParams.safeParse(req.params);
    const parsed = UpdateEmployeeBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (
      parsed.data.shiftStartTime !== undefined &&
      !validClock(parsed.data.shiftStartTime)
    ) {
      res.status(400).json({ error: "وقت بداية الدوام غير صالح" });
      return;
    }

    const companyId = await companyIdForUser(getClerkUserId(res));
    if (companyId === null) {
      res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
      return;
    }

    const updates = { ...parsed.data };
    if (updates.phone === undefined) delete updates.phone;
    if (updates.position === undefined) delete updates.position;
    const [employee] = await db
      .update(employeesTable)
      .set(updates)
      .where(
        and(
          eq(employeesTable.id, params.data.employeeId),
          eq(employeesTable.companyId, companyId),
        ),
      )
      .returning();

    if (!employee) {
      res.status(404).json({ error: "العامل غير موجود" });
      return;
    }
    res.json(UpdateEmployeeResponse.parse(employee));
  },
);

router.delete(
  "/employees/:employeeId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteEmployeeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const companyId = await companyIdForUser(getClerkUserId(res));
    if (companyId === null) {
      res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
      return;
    }

    const [employee] = await db
      .update(employeesTable)
      .set({ isActive: false, nfcTokenHash: null })
      .where(
        and(
          eq(employeesTable.id, params.data.employeeId),
          eq(employeesTable.companyId, companyId),
        ),
      )
      .returning({ id: employeesTable.id });
    if (!employee) {
      res.status(404).json({ error: "العامل غير موجود" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/employees/:employeeId/nfc-token",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = CreateEmployeeNfcTokenParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const companyId = await companyIdForUser(getClerkUserId(res));
    if (companyId === null) {
      res.status(404).json({ error: "أنشئ مساحة الشركة أولاً" });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [employee] = await db
      .update(employeesTable)
      .set({ nfcTokenHash: tokenHash })
      .where(
        and(
          eq(employeesTable.id, params.data.employeeId),
          eq(employeesTable.companyId, companyId),
          eq(employeesTable.isActive, true),
        ),
      )
      .returning({ id: employeesTable.id });

    if (!employee) {
      res.status(404).json({ error: "العامل غير موجود أو غير نشط" });
      return;
    }

    res.status(201).json(
      CreateEmployeeNfcTokenResponse.parse({
        token,
        message: "اكتب هذا الرمز على بطاقة NFC الآن؛ لن يظهر مرة أخرى.",
      }),
    );
  },
);

export default router;

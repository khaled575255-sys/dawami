import { Router, type IRouter } from "express";
import { db, companiesTable } from "@workspace/db";
import {
  CreateCompanyBody,
  CreateCompanyResponse,
  GetCompanyResponse,
} from "@workspace/api-zod";
import { getClerkUserId, requireAuth } from "../middlewares/require-auth";
import { findCompanyForUser } from "../lib/tenant";

const router: IRouter = Router();

router.get("/company", requireAuth, async (_req, res): Promise<void> => {
  const company = await findCompanyForUser(getClerkUserId(res));
  if (!company) {
    res.status(404).json({ error: "لم يتم إنشاء مساحة الشركة بعد" });
    return;
  }
  res.json(GetCompanyResponse.parse(company));
});

router.post("/company", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timeZone });
  } catch {
    res.status(400).json({ error: "المنطقة الزمنية غير صالحة" });
    return;
  }

  const ownerUserId = getClerkUserId(res);
  const existing = await findCompanyForUser(ownerUserId);
  if (existing) {
    res.status(409).json({ error: "لديك مساحة شركة بالفعل" });
    return;
  }

  try {
    const [company] = await db
      .insert(companiesTable)
      .values({ ...parsed.data, ownerUserId })
      .returning();
    res.status(201).json(CreateCompanyResponse.parse(company));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "لديك مساحة شركة بالفعل" });
      return;
    }
    throw error;
  }
});

export default router;

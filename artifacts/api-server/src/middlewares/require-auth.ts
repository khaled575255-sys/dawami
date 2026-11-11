import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return;
  }

  res.locals.clerkUserId = userId;
  next();
};

export function getClerkUserId(res: { locals: Record<string, unknown> }): string {
  const userId = res.locals.clerkUserId;
  if (typeof userId !== "string") {
    throw new Error("Authenticated Clerk user ID is missing");
  }
  return userId;
}

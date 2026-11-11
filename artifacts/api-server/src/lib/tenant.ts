import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";

export async function findCompanyForUser(ownerUserId: string) {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.ownerUserId, ownerUserId))
    .limit(1);
  return company ?? null;
}

export function dateInTimeZone(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function minutesInTimeZone(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((entry) => entry.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((entry) => entry.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function minutesFromClock(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

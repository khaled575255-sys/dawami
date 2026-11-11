import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  timeZone: varchar("time_zone", { length: 80 }).notNull().default("Asia/Riyadh"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employeesTable = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    position: varchar("position", { length: 100 }),
    shiftStartTime: varchar("shift_start_time", { length: 5 }).notNull().default("08:00"),
    gracePeriodMinutes: integer("grace_period_minutes").notNull().default(10),
    isActive: boolean("is_active").notNull().default(true),
    nfcTokenHash: text("nfc_token_hash").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("employees_company_active_idx").on(table.companyId, table.isActive)],
);

export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id, { onDelete: "restrict" }),
    attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    workMinutes: integer("work_minutes").notNull().default(0),
    lateMinutes: integer("late_minutes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_employee_date_unique").on(table.employeeId, table.attendanceDate),
    index("attendance_company_date_idx").on(table.companyId, table.attendanceDate),
  ],
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
});
export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  nfcTokenHash: true,
});
export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecordsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;

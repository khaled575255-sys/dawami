import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import express, { type RequestHandler } from "express";
import React, { createElement, useState } from "react";
import { JSDOM } from "jsdom";
import { and, eq } from "drizzle-orm";
import {
  attendanceRecordsTable,
  companiesTable,
  db,
  employeesTable,
  pool,
} from "@workspace/db";
import { createEmployeesRouter } from "./employees";
import { EmployeeDialog } from "../../../../artifacts/dawami-attendance/src/components/employee-dialog";

const dom = new JSDOM("<!doctype html><html dir=\"rtl\"><body></body></html>", {
  url: "http://localhost",
});
Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLElement", {
  value: dom.window.HTMLElement,
  configurable: true,
});
Object.defineProperty(globalThis, "MutationObserver", {
  value: dom.window.MutationObserver,
  configurable: true,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
});

const { cleanup, fireEvent, render, screen, waitFor } = await import(
  "@testing-library/react"
);

type TestDialogProps = {
  onSave: (data: unknown) => Promise<void>;
  onClose: () => void;
};

function TestEmployeeDialog({ onSave, onClose }: TestDialogProps) {
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");
  const close = () => {
    onClose();
    setOpen(false);
  };
  const save = (data: unknown) => {
    void onSave(data)
      .then(() => setOpen(false))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "تعذر الحفظ"),
      );
  };

  return open
    ? createElement(EmployeeDialog, {
        employee: null,
        busy: false,
        error,
        close,
        save,
      })
    : createElement("p", { "data-testid": "dialog-closed" }, "تم الإغلاق");
}

async function loadEmployeeDialogStyles() {
  const css = await readFile(
    new URL(
      "../../../../artifacts/dawami-attendance/src/index.css",
      import.meta.url,
    ),
    "utf8",
  );
  const rules = css.match(
    /\.button\s*\{[^}]*\}|\.button-primary\s*\{[^}]*\}|\.button-secondary\s*\{[^}]*\}|\.dialog-actions \.button-primary\s*\{[^}]*\}|\.dialog-actions \.button-secondary\s*\{[^}]*\}/g,
  );
  assert.ok(rules?.length, "Employee dialog color rules should exist.");
  const style = document.createElement("style");
  style.textContent = rules.join("\n");
  document.head.append(style);
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Employee database integration tests cannot run in production.");
}

const enabled = process.env.DAWAMI_RUN_REAL_DB_TESTS === "true";

test(
  "employee API creates, reads, updates, and deactivates records in PostgreSQL",
  { skip: !enabled && "Set DAWAMI_RUN_REAL_DB_TESTS=true to run against the development database." },
  async () => {
    const ownerUserId = `test:employee-crud:${randomUUID()}`;
    const companyName = `اختبار عمال مؤقت ${randomUUID()}`;
    let companyId: number | undefined;
    let server: Server | undefined;

    const app = express();
    app.use(express.json());
    const testOnlyAuth: RequestHandler = (_req, res, next) => {
      res.locals.clerkUserId = ownerUserId;
      next();
    };
    app.use("/api", createEmployeesRouter(testOnlyAuth));

    try {
      const [company] = await db
        .insert(companiesTable)
        .values({ ownerUserId, name: companyName, timeZone: "Asia/Riyadh" })
        .returning({ id: companiesTable.id });
      const testCompanyId = company.id;
      companyId = testCompanyId;

      server = createServer(app);
      await new Promise<void>((resolve, reject) => {
        server!.once("error", reject);
        server!.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const baseUrl = `http://127.0.0.1:${address.port}/api`;

      await loadEmployeeDialogStyles();
      assert.equal(document.documentElement.dir, "rtl");

      const cancelledName = `عامل ملغى ${randomUUID()}`;
      let cancelledSaveRequests = 0;
      let cancelCloseCount = 0;
      const cancelledDialog = render(
        createElement(TestEmployeeDialog, {
          onSave: async () => {
            cancelledSaveRequests += 1;
          },
          onClose: () => {
            cancelCloseCount += 1;
          },
        }),
      );
      const saveButton = screen.getByRole("button", { name: "حفظ العامل" });
      const cancelButton = screen.getByRole("button", { name: "إلغاء" });
      assert.equal(saveButton.textContent?.trim(), "حفظ العامل");
      assert.equal(cancelButton.textContent?.trim(), "إلغاء");
      assert.equal(
        dom.window.getComputedStyle(saveButton).color,
        "rgb(255, 253, 248)",
      );
      assert.equal(
        dom.window.getComputedStyle(saveButton).backgroundColor,
        "rgb(41, 75, 64)",
      );
      assert.equal(
        dom.window.getComputedStyle(cancelButton).color,
        "rgb(38, 59, 52)",
      );
      assert.equal(
        dom.window.getComputedStyle(cancelButton).backgroundColor,
        "rgb(255, 253, 248)",
      );
      fireEvent.change(screen.getByTestId("input-employee-name"), {
        target: { value: cancelledName },
      });
      fireEvent.click(cancelButton);
      assert.equal(cancelledSaveRequests, 0);
      assert.equal(cancelCloseCount, 1);
      assert.ok(screen.getByTestId("dialog-closed"));
      const cancelledEmployees = await db
        .select({ id: employeesTable.id })
        .from(employeesTable)
        .where(eq(employeesTable.fullName, cancelledName));
      assert.equal(cancelledEmployees.length, 0);
      cancelledDialog.unmount();

      const createdName = `عامل محفوظ ${randomUUID()}`;
      let created: {
        id: number;
        fullName: string;
        phone: string | null;
        isActive: boolean;
        hasNfcCard: boolean;
      } | undefined;
      const savedDialog = render(
        createElement(TestEmployeeDialog, {
          onSave: async (data) => {
            const createResponse = await fetch(`${baseUrl}/employees`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(data),
            });
            assert.equal(createResponse.status, 201);
            created = (await createResponse.json()) as typeof created;
          },
          onClose: () => {},
        }),
      );
      fireEvent.change(screen.getByTestId("input-employee-name"), {
        target: { value: createdName },
      });
      fireEvent.change(screen.getByTestId("input-employee-phone"), {
        target: { value: "0500000000" },
      });
      fireEvent.change(screen.getByTestId("input-employee-position"), {
        target: { value: "محاسب" },
      });
      fireEvent.change(screen.getByTestId("input-shift-start"), {
        target: { value: "08:30" },
      });
      fireEvent.change(screen.getByTestId("input-grace-minutes"), {
        target: { value: "12" },
      });
      fireEvent.click(screen.getByRole("button", { name: "حفظ العامل" }));
      await waitFor(() => assert.ok(created));
      assert.ok(screen.getByTestId("dialog-closed"));
      savedDialog.unmount();
      cleanup();
      assert.ok(created);
      assert.equal(created.fullName, createdName);
      assert.equal(created.phone, "0500000000");
      assert.equal(created.isActive, true);
      assert.equal(created.hasNfcCard, false);

      const [storedAfterCreate] = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, created.id),
            eq(employeesTable.companyId, testCompanyId),
          ),
        );
      assert.ok(storedAfterCreate, "The create request must persist to PostgreSQL.");

      const listResponse = await fetch(
        `${baseUrl}/employees?search=${encodeURIComponent(createdName)}`,
      );
      assert.equal(listResponse.status, 200);
      const listed = (await listResponse.json()) as Array<{ id: number }>;
      assert.ok(listed.some((employee) => employee.id === created.id));

      const updatedName = `${createdName} معدّل`;
      const updateResponse = await fetch(`${baseUrl}/employees/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: updatedName,
          phone: "0500000001",
          position: "مشرف",
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updated = (await updateResponse.json()) as {
        fullName: string;
        phone: string | null;
        hasNfcCard: boolean;
      };
      assert.equal(updated.fullName, updatedName);
      assert.equal(updated.phone, "0500000001");
      assert.equal(updated.hasNfcCard, false);

      const [storedAfterUpdate] = await db
        .select()
        .from(employeesTable)
        .where(
          and(
            eq(employeesTable.id, created.id),
            eq(employeesTable.companyId, testCompanyId),
          ),
        );
      assert.equal(storedAfterUpdate?.fullName, updatedName);
      assert.equal(storedAfterUpdate?.phone, "0500000001");

      const attendanceDate = new Date().toISOString().slice(0, 10);
      await db.insert(attendanceRecordsTable).values({
        employeeId: created.id,
        attendanceDate,
        checkInAt: new Date(),
        companyId: testCompanyId,
      });

      const deactivateResponse = await fetch(
        `${baseUrl}/employees/${created.id}`,
        { method: "DELETE" },
      );
      assert.equal(deactivateResponse.status, 204);

      const [storedAfterDeactivate] = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, created.id));
      assert.equal(storedAfterDeactivate?.isActive, false);
      assert.equal(storedAfterDeactivate?.nfcTokenHash, null);

      const history = await db
        .select({ id: attendanceRecordsTable.id })
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.companyId, testCompanyId),
            eq(attendanceRecordsTable.employeeId, created.id),
          ),
        );
      assert.equal(history.length, 1, "Deactivation must preserve attendance history.");
    } finally {
      cleanup();
      dom.window.close();
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server!.close((error) => (error ? reject(error) : resolve()));
        });
      }
      if (companyId !== undefined) {
        await db
          .delete(attendanceRecordsTable)
          .where(eq(attendanceRecordsTable.companyId, companyId));
        await db.delete(employeesTable).where(eq(employeesTable.companyId, companyId));
        await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
      }
      await pool.end();
    }
  },
);

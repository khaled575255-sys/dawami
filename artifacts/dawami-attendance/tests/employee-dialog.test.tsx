import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createElement, useState } from "react";
import type { EmployeeInput, EmployeeUpdate } from "@workspace/api-client-react";
import { EmployeeDialog } from "../src/components/employee-dialog";

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

type DialogSave = (data: EmployeeInput | EmployeeUpdate) => void;

function DialogHarness({
  save,
  onClose,
}: {
  save: DialogSave;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const close = () => {
    onClose();
    setOpen(false);
  };

  return open
    ? createElement(EmployeeDialog, {
        employee: null,
        busy: false,
        error: "",
        close,
        save: (data) => {
          save(data);
          setOpen(false);
        },
      })
    : createElement("p", { "data-testid": "dialog-closed" }, "تم الإغلاق");
}

async function loadDialogStyles() {
  const source = await readFile(
    new URL("../src/index.css", import.meta.url),
    "utf8",
  );
  const rules = source.match(
    /\.button\s*\{[^}]*\}|\.button-primary\s*\{[^}]*\}|\.button-secondary\s*\{[^}]*\}|\.dialog-actions \.button-primary\s*\{[^}]*\}|\.dialog-actions \.button-secondary\s*\{[^}]*\}/g,
  );
  assert.ok(rules?.length, "Dialog button color rules should exist.");
  const style = document.createElement("style");
  style.textContent = rules.join("\n");
  document.head.append(style);
}

test("employee dialog buttons are visible, readable, and perform their actions", async () => {
  await loadDialogStyles();
  const saves: Array<EmployeeInput | EmployeeUpdate> = [];
  let closeCount = 0;
  const view = render(
    createElement(DialogHarness, {
      save: (data) => saves.push(data),
      onClose: () => {
        closeCount += 1;
      },
    }),
  );

  const saveButton = screen.getByRole("button", { name: "حفظ العامل" });
  const cancelButton = screen.getByRole("button", { name: "إلغاء" });
  assert.ok(saveButton);
  assert.ok(cancelButton);
  assert.equal(saveButton.textContent?.trim(), "حفظ العامل");
  assert.equal(cancelButton.textContent?.trim(), "إلغاء");
  assert.equal(dom.window.getComputedStyle(saveButton).color, "rgb(255, 253, 248)");
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
  assert.equal(document.documentElement.dir, "rtl");

  fireEvent.change(screen.getByTestId("input-employee-name"), {
    target: { value: "عامل ملغى للاختبار" },
  });
  fireEvent.click(cancelButton);
  assert.equal(saves.length, 0, "Cancel must not invoke the save callback.");
  assert.equal(closeCount, 1);
  assert.ok(screen.getByTestId("dialog-closed"));
  view.unmount();

  let submitted: EmployeeInput | EmployeeUpdate | undefined;
  const savedView = render(
    createElement(DialogHarness, {
      save: (data) => {
        submitted = data;
      },
      onClose: () => {},
    }),
  );
  fireEvent.change(screen.getByTestId("input-employee-name"), {
    target: { value: "عامل محفوظ للاختبار" },
  });
  fireEvent.change(screen.getByTestId("input-employee-phone"), {
    target: { value: "0501234567" },
  });
  fireEvent.change(screen.getByTestId("input-employee-position"), {
    target: { value: "مشرف اختبار" },
  });
  fireEvent.change(screen.getByTestId("input-shift-start"), {
    target: { value: "08:30" },
  });
  fireEvent.change(screen.getByTestId("input-grace-minutes"), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ العامل" }));

  await waitFor(() => assert.ok(submitted));
  assert.deepEqual(submitted, {
    fullName: "عامل محفوظ للاختبار",
    phone: "0501234567",
    position: "مشرف اختبار",
    shiftStartTime: "08:30",
    gracePeriodMinutes: 12,
  });
  assert.ok(screen.getByTestId("dialog-closed"));
  savedView.unmount();
  cleanup();
});

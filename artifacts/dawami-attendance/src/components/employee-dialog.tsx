import React, { useState, type FormEvent } from "react";
import type {
  Employee,
  EmployeeInput,
  EmployeeUpdate,
} from "@workspace/api-client-react";
import { Button } from "./button";
import { Modal } from "./modal";

export type EmployeeDialogProps = {
  employee: Employee | null;
  busy: boolean;
  error: string;
  close: () => void;
  save: (data: EmployeeInput | EmployeeUpdate) => void;
};

export function EmployeeDialog({
  employee,
  busy,
  error,
  close,
  save,
}: EmployeeDialogProps) {
  const [fullName, setFullName] = useState(employee?.fullName || "");
  const [phone, setPhone] = useState(employee?.phone || "");
  const [position, setPosition] = useState(employee?.position || "");
  const [shiftStartTime, setShiftStartTime] = useState(
    employee?.shiftStartTime || "09:00",
  );
  const [gracePeriodMinutes, setGracePeriodMinutes] = useState(
    employee?.gracePeriodMinutes ?? 10,
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save({
      fullName: fullName.trim(),
      phone: phone.trim() || null,
      position: position.trim() || null,
      shiftStartTime,
      gracePeriodMinutes,
    });
  };

  return (
    <Modal
      title={employee ? "تعديل بيانات العامل" : "إضافة عامل جديد"}
      close={close}
      testId="dialog-employee"
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <label>
          الاسم الكامل
          <input
            required
            minLength={2}
            maxLength={160}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="اسم العامل"
            data-testid="input-employee-name"
          />
        </label>
        <div className="form-two">
          <label>
            رقم الجوال <small>اختياري</small>
            <input
              maxLength={40}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="05xxxxxxxx"
              data-testid="input-employee-phone"
            />
          </label>
          <label>
            المسمى الوظيفي <small>اختياري</small>
            <input
              maxLength={100}
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              placeholder="مثل: كاشير"
              data-testid="input-employee-position"
            />
          </label>
        </div>
        <div className="form-two">
          <label>
            بداية الوردية
            <input
              type="time"
              value={shiftStartTime}
              onChange={(event) => setShiftStartTime(event.target.value)}
              data-testid="input-shift-start"
            />
          </label>
          <label>
            فترة السماح بالدقائق
            <input
              type="number"
              min={0}
              max={120}
              value={gracePeriodMinutes}
              onChange={(event) =>
                setGracePeriodMinutes(Number(event.target.value))
              }
              data-testid="input-grace-minutes"
            />
          </label>
        </div>
        {error && (
          <p className="form-error" data-testid="status-employee-form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            onClick={close}
            className="button-secondary"
            data-testid="button-cancel-employee"
          >
            إلغاء
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="button-primary"
            data-testid="button-save-employee"
          >
            {busy
              ? "جارٍ الحفظ…"
              : employee
                ? "حفظ التعديلات"
                : "حفظ العامل"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

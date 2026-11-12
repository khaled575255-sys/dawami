import React, { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  title,
  close,
  children,
  testId,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  testId: string;
}) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [close]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      data-testid={testId}
    >
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog-heading">
          <div>
            <span className="section-kicker">دوامي / فريق العمل</span>
            <h2>{title}</h2>
          </div>
          <button
            onClick={close}
            aria-label="إغلاق"
            data-testid="button-close-dialog"
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

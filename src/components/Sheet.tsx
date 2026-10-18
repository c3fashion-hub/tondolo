"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// A bottom sheet built on the native <dialog>: it traps focus, closes on Escape,
// and hides the page behind it from screen readers.
export function Sheet({ open, title, onClose, closeLabel = "Close", children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="tn-dialog"
      aria-labelledby={headingId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="tn-sheet tn-sheet-float">
        <div className="tn-sheet-grab" aria-hidden="true" />
        <header className="tn-sheet-head">
          <h2 id={headingId}>{title}</h2>
          <button type="button" className="tn-btn tn-btn-link tn-btn-md" onClick={onClose}>{closeLabel}</button>
        </header>
        <div className="tn-sheet-body">{open ? children : null}</div>
      </div>
    </dialog>
  );
}

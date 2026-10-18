import { useId, type ReactNode } from "react";

type Props = {
  title: string;
  onClose?: () => void;
  closeLabel?: string;
  floating?: boolean;
  children: ReactNode;
};

export function BottomSheet({ title, onClose, closeLabel = "Close", floating = true, children }: Props) {
  const headingId = useId();
  return (
    <div className={`tn-sheet${floating ? " tn-sheet-float" : ""}`} role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div className="tn-sheet-grab" aria-hidden="true" />
      <header className="tn-sheet-head">
        <h2 id={headingId}>{title}</h2>
        {onClose ? <button type="button" className="tn-btn tn-btn-link tn-btn-sm" onClick={onClose}>{closeLabel}</button> : null}
      </header>
      <div className="tn-sheet-body">{children}</div>
    </div>
  );
}

import type { ReactNode } from "react";
import { StatusChip, type Tone } from "./StatusChip";

type Props = {
  title: ReactNode;
  detail?: ReactNode;
  amount: ReactNode;
  converted?: ReactNode;
  status?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
};

export function PaymentRow({ title, detail, amount, converted, status, tone = "neutral", children }: Props) {
  return (
    <div className="tn-row">
      <div className="tn-row-main">
        {status ? <div className="tn-row-chips"><StatusChip tone={tone}>{status}</StatusChip></div> : null}
        <div className="tn-row-title">{title}</div>
        {detail ? <div className="tn-row-detail">{detail}</div> : null}
      </div>
      <div className="tn-row-amount">
        {amount}
        {converted ? <small>{converted}</small> : null}
      </div>
      {children ? <div className="tn-row-actions">{children}</div> : null}
    </div>
  );
}

import type { ReactNode } from "react";

type Props = {
  days?: number | null;
  daysLabel?: string;
  place?: ReactNode;
  committed?: ReactNode;
  paid?: ReactNode;
  toPay?: ReactNode;
};

export function OverviewBand({ days, daysLabel = "days to go", place, committed, paid, toPay }: Props) {
  const totals = ([["committed", committed], ["paid", paid], ["still to pay", toPay]] as const).filter(([, v]) => v != null);
  return (
    <section className="tn-band">
      <div className="tn-band-inner">
        <div>
          <div className="tn-band-days">
            {days ?? "—"}
            <small>{daysLabel}</small>
          </div>
          {place ? <div className="tn-band-place">{place}</div> : null}
        </div>
        {totals.length ? (
          <div className="tn-band-totals">
            {totals.map(([label, value]) => (
              <div key={label}><b>{value}</b><span>{label}</span></div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

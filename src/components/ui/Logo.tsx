// The mark: a tondolo cut open. Raspberry skin, paper flesh, five aubergine seeds.
// Draft artwork from the design system, to be refined by a designer.
const SEEDS = [
  [48.0, 31.0, 0], [64.2, 42.7, 72], [58.0, 61.8, 144], [38.0, 61.8, 216], [31.8, 42.7, 288],
] as const;

export function Mark({ size = 48, title }: { size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx="48" cy="48" r="46" fill="#C2255C" />
      <circle cx="48" cy="48" r="34" fill="#FFF8F5" />
      {SEEDS.map(([cx, cy, r]) => (
        <ellipse key={r} cx={cx} cy={cy} rx="4.5" ry="7.5" fill="#3B1631" transform={`rotate(${r} ${cx} ${cy})`} />
      ))}
    </svg>
  );
}

export function Wordmark({ as: Tag = "span" }: { as?: "span" | "h1" | "p" }) {
  return <Tag className="tn-wordmark" style={{ margin: 0 }}>tondolo</Tag>;
}

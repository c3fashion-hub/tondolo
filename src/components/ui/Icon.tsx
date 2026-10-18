// Line icons from the design system: 2px stroke, round caps, drawn in currentColor.
const ICONS = {
  mic: ["M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  overview: ["M4 11l8-7 8 7", "M6 10v10h12V10"],
  payments: ["M3 7h18v10H3z", "M3 11h18", "M7 15h3"],
  budget: ["M12 3v9h9", "M21 12a9 9 0 1 1-9-9"],
  notes: ["M6 3h9l3 3v15H6z", "M9 10h6", "M9 14h6", "M9 18h4"],
  settings: ["M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M12 2v3", "M12 19v3", "M4.9 4.9l2.1 2.1", "M17 17l2.1 2.1", "M2 12h3", "M19 12h3", "M4.9 19.1L7 17", "M17 7l2.1-2.1"],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

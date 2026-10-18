import styles from "./calendar.module.css";

// "Add to calendar": Apple Calendar and Outlook take the .ics file; Google opens its own page.
export function CalendarLinks({ ics, google, label = "Add to your calendar" }: { ics: string; google: string | string[]; label?: string }) {
  const googles = Array.isArray(google) ? google : [google];
  return (
    <div className={styles.links} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <a href={ics} className={styles.link} download>Apple or Outlook</a>
      {googles.map((g, i) => (
        <a key={g} href={g} className={styles.link} target="_blank" rel="noopener noreferrer">
          Google{googles.length > 1 ? (i === 0 ? " (weekly)" : " (final weeks)") : ""}
        </a>
      ))}
    </div>
  );
}

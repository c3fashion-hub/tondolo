import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export type TabId = "overview" | "payments" | "budget" | "notes" | "settings";

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "payments", label: "Payments", icon: "payments" },
  { id: "budget", label: "Budget", icon: "budget" },
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function TabBar({ active, hrefFor }: { active: TabId; hrefFor: (id: TabId) => string }) {
  return (
    <nav className="tn-tabs" aria-label="Main">
      {TABS.map((t) => (
        <Link key={t.id} href={hrefFor(t.id)} className="tn-tab" aria-current={t.id === active ? "page" : undefined}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

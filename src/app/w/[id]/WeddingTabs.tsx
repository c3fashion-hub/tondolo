"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui";

type Tab = { id: string; label: string; icon: IconName; path: string };

export function WeddingTabs({ weddingId, showBudget, showNotes }: { weddingId: string; showBudget: boolean; showNotes: boolean }) {
  const pathname = usePathname();
  const base = `/w/${weddingId}`;
  const tabs: Tab[] = [
    { id: "overview", label: "Overview", icon: "overview", path: base },
    { id: "payments", label: "Payments", icon: "payments", path: `${base}/payments` },
    ...(showBudget ? [{ id: "budget", label: "Budget", icon: "budget" as const, path: `${base}/budget` }] : []),
    ...(showNotes ? [{ id: "notes", label: "Notes", icon: "notes" as const, path: `${base}/notes` }] : []),
    { id: "settings", label: "Settings", icon: "settings", path: `${base}/settings` },
  ];
  const active = tabs.slice().reverse().find((t) => pathname === t.path || pathname.startsWith(`${t.path}/`))?.id ?? "overview";
  return (
    <nav className="tn-tabs" aria-label="Main">
      {tabs.map((t) => (
        <Link key={t.id} href={t.path} className="tn-tab" aria-current={t.id === active ? "page" : undefined}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

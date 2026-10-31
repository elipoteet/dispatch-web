"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// One link per tab, each its own URL so a tab can be shared directly (phase
// nine, decision 2). Only built tabs are listed: a tab that isn't there yet is
// not a link that goes nowhere.
export function ResearchTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname()?.replace(/\/$/, "") ?? "";
  return (
    <nav className="rf-tabs" aria-label="Research sections">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={`rf-tab${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

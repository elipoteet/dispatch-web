"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { addRecent, tabFromPath, type RecentTab } from "@/lib/recent";

// Notes this company, and the tab open, in the visitor's recently viewed list
// (lib/recent.ts). Rendered by the company layout only after its 404 checks,
// and given the tabs that layout lists, so a tab that 404s inside the layout
// (Financials for a fund, say) is never recorded.
export function RecordVisit({ symbol, name, tabs }: { symbol: string; name: string; tabs: RecentTab[] }) {
  const pathname = usePathname();
  const allowed = tabs.join(",");
  useEffect(() => {
    const tab = tabFromPath(pathname);
    if (!tab || !allowed.split(",").includes(tab)) return;
    addRecent({ symbol, name, tab });
  }, [pathname, symbol, name, allowed]);
  return null;
}

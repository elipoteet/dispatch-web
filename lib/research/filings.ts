// The Filings tab's list (phase nine, stage 7). Pure.
//
// Every filing the research file reads, newest first, in plain words: "Annual
// report", "Quarterly report", and for an 8-K what the company was reporting,
// from the item numbers it filed under ("Results of operations", "Director or
// officer change"). Each links to the filing on EDGAR.

import type { Submissions } from "@/lib/sec/client";

// The 8-K items a reader meets most, in plain words. Item 9.01 ("financial
// statements and exhibits") rides along with nearly every 8-K and says
// nothing on its own, so it's named only when it's the only item.
const ITEMS_8K: Record<string, string> = {
  "1.01": "New material agreement",
  "1.02": "Material agreement ended",
  "1.03": "Bankruptcy or receivership",
  "1.05": "Cybersecurity incident",
  "2.01": "Acquisition or sale completed",
  "2.02": "Results of operations",
  "2.03": "New debt or obligation",
  "2.04": "Debt obligation accelerated",
  "2.05": "Exit or restructuring costs",
  "2.06": "Material impairment",
  "3.01": "Stock exchange listing notice",
  "3.02": "Unregistered sale of shares",
  "3.03": "Change to shareholders' rights",
  "4.01": "Change of auditor",
  "4.02": "Earlier financial statements no longer to be relied on",
  "5.01": "Change in control",
  "5.02": "Director or officer change",
  "5.03": "Articles, bylaws or fiscal year changed",
  "5.07": "Shareholder vote results",
  "5.08": "Shareholder nominations",
  "7.01": "Regulation FD disclosure",
  "8.01": "Other events",
  "9.01": "Exhibits",
};

const FORMS: Record<string, string> = {
  "10-K": "Annual report",
  "10-K/A": "Annual report (amended)",
  "10-KT": "Transition-period report",
  "10-Q": "Quarterly report",
  "10-Q/A": "Quarterly report (amended)",
  "20-F": "Annual report (foreign filer)",
  "20-F/A": "Annual report (foreign filer, amended)",
  "40-F": "Annual report (Canadian filer)",
  "4": "Insider trade report",
  "4/A": "Insider trade report (amended)",
  "DEF 14A": "Proxy statement",
};

export type FilingCategory = "reports" | "events" | "insiders" | "proxy";

export const CATEGORY_LABELS: Record<FilingCategory, string> = {
  reports: "Annual and quarterly reports",
  events: "Current reports (8-K)",
  insiders: "Insider trades (Form 4)",
  proxy: "Proxy statements",
};

export type FilingEntry = {
  accession: string;
  form: string;
  filed: string;
  reportDate: string | null;
  primaryDocument: string;
  category: FilingCategory;
  description: string;
};

function categoryOf(form: string): FilingCategory {
  if (form.startsWith("8-K")) return "events";
  if (form === "4" || form === "4/A") return "insiders";
  if (form === "DEF 14A") return "proxy";
  return "reports";
}

export function describe8K(items: string): string {
  const codes = items
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const named = codes.filter((c) => c !== "9.01").map((c) => ITEMS_8K[c] ?? `Item ${c}`);
  if (named.length === 0) return codes.length ? "Exhibits" : "Current report";
  return named.join("; ");
}

export function filingEntries(submissions: Submissions): FilingEntry[] {
  const r = submissions.filings?.recent;
  if (!r?.form?.length) return [];
  const out: FilingEntry[] = [];
  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    const category = categoryOf(form);
    out.push({
      accession: r.accessionNumber[i],
      form,
      filed: r.filingDate[i],
      reportDate: r.reportDate?.[i] || null,
      primaryDocument: r.primaryDocument?.[i] ?? "",
      category,
      description: category === "events" ? describe8K(r.items?.[i] ?? "") : (FORMS[form] ?? form),
    });
  }
  return out.sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0));
}

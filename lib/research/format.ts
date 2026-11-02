// Formatting for the research pages. Dependency-free, so client components
// can import it without pulling in the data layer.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "0131" (the SEC's MMDD) -> "January".
export function fiscalYearEndMonth(mmdd: string | null | undefined): string | null {
  if (!mmdd || !/^\d{4}$/.test(mmdd)) return null;
  return MONTHS[Number(mmdd.slice(0, 2)) - 1] ?? null;
}

// The fiscal year end the company's own figures run to, as MMDD, from its
// latest full year. Preferred to the SEC's submissions field, which can give a
// newly chosen year end before any year has ended on it: Culp's says December
// (1231), while every report so far, its July 2026 10-K included, runs to early
// May. Labelling those quarters as calendar quarters put "Q1 2025" on a
// quarter that ended in August 2024.
export function fiscalYearEndFromRows(rows: { lineItem: string; fiscalPeriod: string; periodEnd: string }[]): string | null {
  let latest = "";
  for (const r of rows) {
    if (r.fiscalPeriod !== "FY" || (r.lineItem !== "revenue" && r.lineItem !== "net_income")) continue;
    if (r.periodEnd > latest) latest = r.periodEnd;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(latest) ? latest.slice(5, 7) + latest.slice(8, 10) : null;
}

// A December year-end company's fiscal 2025 IS 2025, so it reads as a plain
// year. Anyone else's reads as "fiscal 2026", because NVIDIA's fiscal 2026
// mostly happened in calendar 2025 and a bare "2026" would mislead.
//
// Within a week of New Year counts: a 52/53-week year ending on the last
// Saturday of December (AMD's "1227") or the first days of January is the
// calendar year in all but name, and AMD calls it "2025", not "fiscal 2025".
export function isCalendarYear(fiscalYearEnd: string | null | undefined): boolean {
  if (!fiscalYearEnd || !/^\d{4}$/.test(fiscalYearEnd)) return false;
  const month = fiscalYearEnd.slice(0, 2);
  const day = Number(fiscalYearEnd.slice(2));
  return (month === "12" && day >= 24) || (month === "01" && day <= 7);
}

export function yearPhrase(fiscalYear: number, fiscalYearEnd: string | null | undefined): string {
  return isCalendarYear(fiscalYearEnd) ? String(fiscalYear) : `fiscal ${fiscalYear}`;
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

// A small count in words for a heading ("Three facts", "eight figures");
// digits past twelve.
export function countWord(n: number, capitalized = false): string {
  const word = COUNT_WORDS[n] ?? String(n);
  return capitalized ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

// Column and chip labels: "FY26".
export function fyShort(fiscalYear: number): string {
  return `FY${String(fiscalYear).slice(-2)}`;
}

// "$215.9B", "$5.77T", "$412.3M", "-$1.2B".
export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (v >= 1e12) return `${sign}$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sign}$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${sign}$${(v / 1e6).toFixed(1)}M`;
  return `${sign}$${Math.round(v).toLocaleString("en-US")}`;
}

// "$239.24".
export function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// "107.9M", "2.4B", "870K".
export function formatCount(value: number): string {
  const v = Math.abs(value);
  if (v >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(Math.round(value));
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

// "+65%", "-3.2%". Never shows "-0%".
export function formatSignedPct(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(digits)}%`;
}

// "+0.24", "-9.02".
export function formatSignedNumber(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(digits)}`;
}

// The SEC's company names are upper case ("NVIDIA CORP"). Title case reads
// better in a list; legal suffixes keep their usual form.
const KEEP_UPPER = new Set(["LLC", "LP", "PLC", "NV", "SA", "AG", "ETF", "REIT", "USA", "US", "II", "III", "IV"]);

export function titleCaseName(rawName: string): string {
  // The SEC appends filing suffixes to some names: a state of incorporation
  // ("/DE/", or "\DE\" as US Bancorp has it) or a re-registration marker
  // ("/NEW"). Not part of the name.
  const name = rawName.replace(/\s*[/\\][A-Za-z]{2,4}[/\\]?\s*$/, "").trim();
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((part) => {
      const upper = part.toUpperCase();
      if (KEEP_UPPER.has(upper.replace(/\./g, ""))) return upper;
      // Abbreviations stay in capitals: anything with an ampersand (S&P,
      // AT&T) and short words with no vowel (SPDR, CBS).
      if (/[a-z]/.test(part) && (part.includes("&") || (part.length <= 5 && !/[aeiouy]/.test(part)))) return upper;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

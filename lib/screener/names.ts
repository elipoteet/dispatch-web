// A company's name on the screener: chosen and written by the nightly job, so
// the page shows it as stored. Pure.
//
// "Use the name as the company writes it" (Eli, 7 November 2026). The SEC
// holds two versions: the name on the company's filings (the frames, which is
// the 10-K cover page) and its current registered name (the submissions
// profile). Either can be in capitals, an old name, or a co-filer's:
// 1. Which name: the profile's, unless the filings' name is the same name
//    written differently; then whichever is in mixed case, since capitals
//    are how the SEC indexes a name, not how a company writes it
//    ("ServiceNow, Inc." over "SERVICENOW, INC.").
// 2. A short list of names the SEC only ever holds in capitals but the
//    company writes otherwise (PulteGroup, NVIDIA), checked one by one.
// 3. Capitals read as a person would: words in title case, short acronyms
//    kept ("UFP Industries", "EQT"), the place tag and legal form dropped.

import { shortName } from "@/lib/research/format";

// —— 1. Which of the SEC's names ——
// Same name, written differently: the same letters once case, punctuation,
// word order, "&"/"and", a place tag ("/DE/") and the legal form are set
// aside. Bank of America's filings arrive as "BofA Finance LLC" (a co-filer)
// and Rantizo's as "SKK Holdings Limited" (its old name); neither matches, so
// the profile's current name wins.
const LEGAL_WORDS = /\b(the|corporation|corp|incorporated|inc|company|co|limited|ltd|llc|plc|public)\b/g;
const PLACE_TAG = /\s*[/\\(][^/\\()]*[/\\)]?\s*$/;

function nameLetters(name: string): string {
  return name
    .toLowerCase()
    .replace(PLACE_TAG, "")
    .replace(/&/g, " and ")
    .replace(/[’'.]/g, "")
    .replace(LEGAL_WORDS, " ")
    .replace(/[^a-z0-9]/g, "")
    .split("")
    .sort()
    .join("");
}

// Written in mixed case by someone, beyond the legal form: "EQT Corp" and
// "ELI LILLY & Co" are capitals with an SEC suffix, "ServiceNow, Inc." isn't.
const hasLower = (s: string) => /[a-z]/.test(s.replace(/\b(corporation|corp|incorporated|inc|company|co|limited|ltd|llc|plc|holdings?)\b/gi, ""));

export function preferredSecName(framesName: string, profileName: string | null | undefined): string {
  const profile = profileName?.trim();
  if (!profile) return framesName;
  if (nameLetters(framesName) !== nameLetters(profile)) return profile;
  if (!hasLower(framesName) && hasLower(profile)) return profile;
  return framesName;
}

// —— 2. Names the SEC holds only in capitals ——
// By CIK. Each is how the company writes its own name, where the SEC holds
// only capitals in both records (checked 7 November 2026 for the 300 largest
// of the 1,269 such companies) and the rules below can't know it: a brand's
// inner capital (PulteGroup, CarMax), initials that look like a word (CBRE,
// AGCO), or the SEC's index order ("SCHWAB CHARLES CORP"). News Corp keeps its
// "Corp": without it the name is a word.
export const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  "0001045810": "NVIDIA",
  "0000019617": "JPMorgan Chase",
  "0000822416": "PulteGroup",
  "0001564708": "News Corp",
  "0000021344": "Coca-Cola", // SEC: COCA COLA CO
  "0000316709": "Charles Schwab", // SEC: SCHWAB CHARLES CORP
  "0001113169": "T. Rowe Price Group", // SEC: PRICE T ROWE GROUP INC
  "0000707549": "Lam Research",
  "0000350698": "AutoNation",
  "0001170010": "CarMax",
  "0000753308": "NextEra Energy",
  "0000866787": "AutoZone",
  "0001478242": "IQVIA",
  "0000868857": "AECOM",
  "0001031296": "FirstEnergy",
  "0000908255": "BorgWarner",
  "0000927066": "DaVita",
  "0000913144": "RenaissanceRe",
  "0000880266": "AGCO",
  "0000103379": "VF", // SEC: V F CORP
  "0001158463": "JetBlue Airways",
  "0001097864": "ON Semiconductor",
  "0001138118": "CBRE Group",
  // Initials that read as a word, found in a check of every company with
  // $500M+ of revenue (7 November 2026).
  "0001408198": "MSCI",
  "0000016058": "CACI International",
  "0000040211": "GATX",
  "0000046619": "HEICO",
  "0000105634": "EMCOR Group",
  "0000712034": "ACCO Brands",
  "0000003197": "CECO Environmental",
};

// —— 3. Capitals read as a person would ——
// Short words in capitals are usually initials (UFP, EQT, AES), unless
// they're one of these ordinary words.
const ORDINARY_SHORT = new Set(
  (
    "A AN AND AT BY FOR IN OF ON OR THE TO " +
    // And a few first names (Eli Lilly, Cal-Maine, Bel Fuse).
    "ACE AGE AID AIM AIR ALL ARC ARK ARM ART BAR BAY BED BEL BIG BIO BIT BOX BUS BUY CAL CAN CAP CAR CO COW CUP CUT DAY DOG DOT DRY ELI " +
    "EAT END EYE FAN FAR FIT FLY FOX FUN GAP GAS GEM GO HOT HUB ICE INC INK ION JET JOY KEY KID LAB LAS LAW LOG LTD MAN MAP MED " +
    "MIX NET NEW NOW NUT OAK OIL OLD ONE OUR OUT OWN PAN PAY PET PRO RAY RED RIO ROW RUN SEA SET SKY SUN TAX TEA TEN " +
    "TOP TOY TWO VAN WAY WEB WIN ZOO"
  ).split(" "),
);
const KEEP_UPPER = new Set(["LLC", "LP", "PLC", "NV", "SA", "AG", "ETF", "REIT", "USA", "US", "II", "III", "IV", "VI", "VII"]);
const SMALL_WORDS = new Set(["and", "of", "the", "for", "in", "on", "at", "by", "to", "or", "a", "an"]);

function titleWord(word: string, first: boolean): string {
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (!letters) return word;
  const upper = letters.toUpperCase();
  if (/\d/.test(word) || word.includes("&") || KEEP_UPPER.has(upper)) return word.toUpperCase();
  if (!first && SMALL_WORDS.has(letters.toLowerCase())) return word.toLowerCase();
  if (letters.length <= 3 && !ORDINARY_SHORT.has(upper)) return word.toUpperCase();
  if (letters.length <= 5 && !/[AEIOUY]/i.test(letters)) return word.toUpperCase();
  if (/^MC[A-Z]{3,}/i.test(word)) return `Mc${word.charAt(2).toUpperCase()}${word.slice(3).toLowerCase()}`;
  if (/^O['’][A-Z]/i.test(word)) return `O${word.charAt(1)}${word.charAt(2).toUpperCase()}${word.slice(3).toLowerCase()}`;
  const lower = word.toLowerCase();
  const at = lower.search(/[a-z]/);
  return lower.slice(0, at) + lower.charAt(at).toUpperCase() + lower.slice(at + 1);
}

// A word written in capitals, in a name that otherwise isn't: kept unless
// it's long enough to be an ordinary word ("BALL Corp" is Ball; "CVS" stays).
function quieter(word: string): string {
  if (/^Mc[A-Z]{3,}/.test(word)) return `Mc${word.charAt(2)}${word.slice(3).toLowerCase()}`;
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase() || !/[AEIOUY]/.test(letters)) return word;
  return word.charAt(0) + word.slice(1).toLowerCase();
}

export function companyName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").replace(PLACE_TAG, "").replace(/[/\\]+$/, "").trim() || raw.trim();
  const words = cleaned.split(" ").filter((w) => /[A-Za-z]{2}/.test(w));
  const shouting = words.filter((w) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    return letters === letters.toUpperCase();
  }).length;
  let name: string;
  if (shouting * 2 > words.length) {
    // Mostly capitals is read as all capitals ("PACIFIC GAS & ELECTRIC Co").
    name = cleaned
      .split(/(\s+|-|\/)/)
      .map((part, i) => (/^(\s+|-|\/)$/.test(part) ? part : titleWord(part, i === 0)))
      .join("");
  } else {
    name = cleaned.split(" ").map(quieter).join(" ");
  }
  return shortName(name);
}

// The name the screener shows.
export function displayName(cik: string, framesName: string, profileName: string | null | undefined): string {
  return NAME_OVERRIDES[cik] ?? companyName(preferredSecName(framesName, profileName));
}

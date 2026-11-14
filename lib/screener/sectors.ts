// SIC code -> one of eleven plain sectors, for the screener's sector filter.
// Pure.
//
// SIC is the SEC's industry code, four digits, from 1937 and showing it: it
// files Alphabet and Meta under "computer programming and data processing"
// (7370), so here they are Technology, where a modern classification would say
// Communication. The grouping follows the familiar eleven-sector layout as
// closely as SIC allows. Ranges are checked in order and the first match wins,
// so narrow exceptions sit above the broad range they carve out of.
//
// This decides only which box a company is filed in. Whether gross margin and
// free cash flow apply is a separate rule (filerKindFromSic in concepts.ts),
// which is why UnitedHealth (6324, a health insurer) is filed under Health
// care here but still treated as an insurer there, exactly as its research
// file treats it.

export const SECTORS = [
  "Technology",
  "Health care",
  "Financials",
  "Real estate",
  "Energy",
  "Materials",
  "Industrials",
  "Consumer staples",
  "Consumer discretionary",
  "Communication",
  "Utilities",
] as const;

export type Sector = (typeof SECTORS)[number] | "Other";

// [first SIC, last SIC, sector]
const RANGES: [number, number, Sector][] = [
  // —— Narrow exceptions first ——
  [6770, 6770, "Other"], // blank checks (SPACs): no business yet
  [6798, 6798, "Real estate"], // REITs
  [6324, 6324, "Health care"], // hospital and medical service plans (UnitedHealth)
  [2833, 2836, "Health care"], // medicinal chemicals, pharmaceuticals, diagnostics, biologicals
  [2840, 2844, "Consumer staples"], // soap, detergents, cosmetics
  [3410, 3412, "Materials"], // metal cans
  [3826, 3826, "Health care"], // laboratory analytical instruments (life-science tools)
  [3812, 3812, "Industrials"], // search, detection and navigation systems (defense)
  [3711, 3711, "Consumer discretionary"], // motor vehicles
  [3714, 3714, "Consumer discretionary"], // motor vehicle parts
  [3716, 3716, "Consumer discretionary"], // motor homes
  [3751, 3751, "Consumer discretionary"], // motorcycles and bicycles
  [3630, 3639, "Consumer discretionary"], // household appliances
  [3651, 3652, "Consumer discretionary"], // household audio and video
  [3661, 3679, "Technology"], // communications equipment, semiconductors, components
  [3695, 3695, "Technology"], // magnetic and optical media
  [3861, 3861, "Technology"], // photographic equipment
  [4922, 4923, "Energy"], // natural gas transmission (pipelines)
  [4950, 4959, "Industrials"], // sanitary and refuse services
  [5047, 5047, "Health care"], // medical equipment wholesale
  [5122, 5122, "Health care"], // drug wholesale
  [5065, 5065, "Technology"], // electronic parts wholesale
  [5140, 5149, "Consumer staples"], // grocery wholesale
  [5180, 5182, "Consumer staples"], // beer and wine wholesale
  [5171, 5172, "Energy"], // petroleum wholesale
  [5311, 5311, "Consumer discretionary"], // department stores
  [5300, 5399, "Consumer staples"], // variety stores and warehouse clubs (Walmart, Costco)
  [5400, 5499, "Consumer staples"], // food stores
  [5912, 5912, "Consumer staples"], // drug stores
  [7370, 7379, "Technology"], // software, data processing, computer services
  [7810, 7829, "Communication"], // motion pictures
  [8731, 8731, "Health care"], // commercial biological research (most biotechs)
  [1520, 1531, "Consumer discretionary"], // homebuilders
  [4610, 4619, "Energy"], // crude and refined pipelines

  // —— Broad ranges ——
  [100, 299, "Consumer staples"], // agricultural production
  [700, 799, "Consumer staples"], // agricultural services
  [800, 899, "Materials"], // forestry
  [900, 999, "Consumer staples"], // fishing
  [1000, 1099, "Materials"], // metal mining
  [1200, 1399, "Energy"], // coal, oil and gas
  [1400, 1499, "Materials"], // nonmetallic minerals
  [1500, 1799, "Industrials"], // construction
  [2000, 2199, "Consumer staples"], // food, beverages, tobacco
  [2200, 2399, "Consumer discretionary"], // textiles and apparel
  [2400, 2499, "Materials"], // lumber and wood
  [2500, 2599, "Consumer discretionary"], // furniture
  [2600, 2699, "Materials"], // paper
  [2700, 2799, "Communication"], // publishing and printing
  [2800, 2899, "Materials"], // chemicals
  [2900, 2999, "Energy"], // petroleum refining
  [3000, 3099, "Materials"], // rubber and plastics
  [3100, 3199, "Consumer discretionary"], // leather and footwear
  [3200, 3399, "Materials"], // stone, clay, glass, primary metals
  [3400, 3569, "Industrials"], // fabricated metal, industrial machinery
  [3570, 3579, "Technology"], // computers and office equipment
  [3580, 3629, "Industrials"], // machinery, electrical equipment
  [3640, 3699, "Industrials"], // lighting, other electrical equipment
  [3700, 3799, "Industrials"], // aircraft, ships, rail, defense
  [3800, 3839, "Technology"], // instruments
  [3840, 3851, "Health care"], // medical, dental and ophthalmic equipment
  [3850, 3899, "Technology"], // other instruments
  [3900, 3999, "Consumer discretionary"], // jewelry, toys, sporting goods
  [4000, 4799, "Industrials"], // transportation
  [4800, 4899, "Communication"], // telephone, broadcasting, cable
  [4900, 4999, "Utilities"], // electric, gas, water
  [5000, 5199, "Industrials"], // wholesale
  [5200, 5999, "Consumer discretionary"], // retail
  [6000, 6499, "Financials"], // banks, credit, brokers, insurance
  [6500, 6599, "Real estate"], // real estate
  [6700, 6799, "Financials"], // holding and investment offices
  [7000, 7299, "Consumer discretionary"], // hotels, personal services
  [7300, 7399, "Industrials"], // business services
  [7500, 7599, "Industrials"], // automotive services and rental
  [7600, 7699, "Industrials"], // miscellaneous repair services
  [7800, 7999, "Consumer discretionary"], // entertainment and recreation
  [8000, 8099, "Health care"], // health services
  [8100, 8199, "Industrials"], // legal services
  [8200, 8299, "Consumer discretionary"], // education
  [8300, 8699, "Industrials"], // social services, membership organisations
  [8700, 8799, "Industrials"], // engineering, accounting, management
];

export function sectorFromSic(sic: string | number | null | undefined): Sector | null {
  const n = typeof sic === "string" ? parseInt(sic, 10) : sic;
  if (n == null || Number.isNaN(n)) return null;
  for (const [lo, hi, sector] of RANGES) if (n >= lo && n <= hi) return sector;
  return "Other";
}

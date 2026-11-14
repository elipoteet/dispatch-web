// Sectors checked by hand, for companies the SIC code files in the wrong
// box. Pure.
//
// sectors.ts maps each company's SIC code (the SEC's industry code, from 1937)
// to one of eleven sectors. SIC puts Visa and Mastercard in "business
// services" (Industrials), Lam Research among "special industry machinery"
// (Industrials), InterDigital among "patent owners and lessors" (Financials),
// and Alphabet and Meta in "computer programming" (Technology). This list
// corrects them to the sector the standard eleven-sector classification
// (GICS, as revised in March 2023) gives each company.
//
// Every company with revenue over $5 billion in the screener on 9 November
// 2026 (704 of them) was checked by hand against that classification, and
// these are the ones SIC gets wrong. InterDigital and Wise, under $5 billion,
// are here because Eli named them (Wise on 9 November 2026: it holds its
// customers' money and is treated like a bank, customerMoney.ts). A company whose classification was unclear stays where
// SIC puts it: the government IT contractors (Leidos, CACI, SAIC, Parsons),
// Roper, Teledyne, Veralto, Toast, Boise Cascade, Gold.com, Arko and Murphy
// USA.
//
// Keyed by CIK, which never changes; the ticker is there to read the list
// by. A company that changes business or is reclassified is corrected here,
// in this one file. A sector that moves into or out of Technology moves the
// company into or out of the Rule of 40 screen, which filters on Technology.

import { sectorFromSic, type Sector } from "@/lib/screener/sectors";

export type SectorCorrection = { ticker: string; sector: Sector };

export const SECTOR_CORRECTIONS: ReadonlyMap<string, SectorCorrection> = new Map<string, SectorCorrection>([
  // —— Technology ——
  ["0001467373", { ticker: "ACN", sector: "Technology" }], // Accenture; SIC 7389 gave Industrials
  ["0001177394", { ticker: "SNX", sector: "Technology" }], // TD Synnex; SIC 5045 gave Industrials
  ["0001897762", { ticker: "INGM", sector: "Technology" }], // Ingram Micro Holding; SIC 5045 gave Industrials
  ["0000707549", { ticker: "LRCX", sector: "Technology" }], // Lam Research; SIC 3559 gave Industrials
  ["0001402057", { ticker: "CDW", sector: "Technology" }], // CDW; SIC 5961 gave Consumer discretionary
  ["0000024741", { ticker: "GLW", sector: "Technology" }], // Corning; SIC 3357 gave Materials
  ["0000932696", { ticker: "NSIT", sector: "Technology" }], // Insight Enterprises; SIC 5961 gave Consumer discretionary
  ["0000749251", { ticker: "IT", sector: "Technology" }], // Gartner; SIC 8741 gave Industrials
  ["0000877212", { ticker: "ZBRA", sector: "Technology" }], // Zebra Technologies; SIC 3560 gave Industrials
  ["0001405495", { ticker: "IDCC", sector: "Technology" }], // InterDigital; SIC 6794 gave Financials
  // —— Health care ——
  ["0000064803", { ticker: "CVS", sector: "Health care" }], // CVS Health; SIC 5912 gave Consumer staples
  ["0000097745", { ticker: "TMO", sector: "Health care" }], // Thermo Fisher Scientific; SIC 3829 gave Technology
  ["0000313616", { ticker: "DHR", sector: "Health care" }], // Danaher; SIC 3823 gave Technology
  // —— Financials ——
  ["0002099039", { ticker: "WSE", sector: "Financials" }], // Wise Group; SIC 7389 gave Industrials
  ["0001403161", { ticker: "V", sector: "Financials" }], // Visa; SIC 7389 gave Industrials
  ["0001633917", { ticker: "PYPL", sector: "Financials" }], // PayPal; SIC 7389 gave Industrials
  ["0001141391", { ticker: "MA", sector: "Financials" }], // Mastercard; SIC 7389 gave Industrials
  ["0001512673", { ticker: "XYZ", sector: "Financials" }], // Block; SIC 7372 gave Technology
  ["0000798354", { ticker: "FISV", sector: "Financials" }], // Fiserv; SIC 7389 gave Industrials
  ["0000064040", { ticker: "SPGI", sector: "Financials" }], // S&P Global; SIC 7320 gave Industrials
  ["0001136893", { ticker: "FIS", sector: "Financials" }], // Fidelity National Information Services; SIC 7389 gave Industrials
  ["0001059556", { ticker: "MCO", sector: "Financials" }], // Moody’s; SIC 7320 gave Industrials
  ["0001123360", { ticker: "GPN", sector: "Financials" }], // Global Payments; SIC 7389 gave Industrials
  // —— Energy ——
  ["0001701605", { ticker: "BKR", sector: "Energy" }], // Baker Hughes; SIC 3533 gave Industrials
  ["0000003570", { ticker: "LNG", sector: "Energy" }], // Cheniere Energy; SIC 4924 gave Utilities
  ["0002007855", { ticker: "VG", sector: "Energy" }], // Venture Global; SIC 4924 gave Utilities
  ["0001383650", { ticker: "CQP", sector: "Energy" }], // Cheniere Energy Partners; SIC 4924 gave Utilities
  ["0001681459", { ticker: "FTI", sector: "Energy" }], // TechnipFMC; SIC 3533 gave Industrials
  ["0001021860", { ticker: "NOV", sector: "Energy" }], // NOV; SIC 3533 gave Industrials
  // —— Materials ——
  ["0000089800", { ticker: "SHW", sector: "Materials" }], // Sherwin-Williams; SIC 5200 gave Consumer discretionary
  ["0001748790", { ticker: "AMCR", sector: "Materials" }], // Amcor; SIC 3990 gave Consumer discretionary
  ["0001755672", { ticker: "CTVA", sector: "Materials" }], // Corteva; SIC 0100 gave Consumer staples
  ["0000031462", { ticker: "ECL", sector: "Materials" }], // Ecolab; SIC 2840 gave Consumer staples
  ["0000861884", { ticker: "RS", sector: "Materials" }], // Reliance; SIC 5051 gave Industrials
  // —— Industrials ——
  ["0000075362", { ticker: "PCAR", sector: "Industrials" }], // Paccar; SIC 3711 gave Consumer discretionary
  ["0000066740", { ticker: "MMM", sector: "Industrials" }], // 3M; SIC 3841 gave Health care
  ["0000008670", { ticker: "ADP", sector: "Industrials" }], // Automatic Data Processing; SIC 7374 gave Technology
  ["0001466258", { ticker: "TT", sector: "Industrials" }], // Trane Technologies; SIC 3822 gave Technology
  ["0001316835", { ticker: "BLDR", sector: "Industrials" }], // Builders FirstSource; SIC 5211 gave Consumer discretionary
  ["0000723254", { ticker: "CTAS", sector: "Industrials" }], // Cintas; SIC 2320 gave Consumer discretionary
  ["0000775158", { ticker: "OSK", sector: "Industrials" }], // Oshkosh; SIC 3711 gave Consumer discretionary
  ["0001674101", { ticker: "VRT", sector: "Industrials" }], // Vertiv; SIC 3679 gave Technology
  ["0001370946", { ticker: "OC", sector: "Industrials" }], // Owens Corning; SIC 3290 gave Materials
  ["0000813762", { ticker: "IEP", sector: "Industrials" }], // Icahn Enterprises; SIC 2911 gave Energy
  ["0001024478", { ticker: "ROK", sector: "Industrials" }], // Rockwell Automation; SIC 3829 gave Technology
  ["0000004281", { ticker: "HWM", sector: "Industrials" }], // Howmet Aerospace; SIC 3350 gave Materials
  ["0000815556", { ticker: "FAST", sector: "Industrials" }], // Fastenal; SIC 5200 gave Consumer discretionary
  ["0001012019", { ticker: "RUSHA", sector: "Industrials" }], // Rush Enterprises; SIC 5500 gave Consumer discretionary
  ["0001037868", { ticker: "AME", sector: "Industrials" }], // Ametek; SIC 3823 gave Technology
  ["0000912767", { ticker: "UFPI", sector: "Industrials" }], // UFP Industries; SIC 2421 gave Materials
  ["0000048898", { ticker: "HUBB", sector: "Industrials" }], // Hubbell; SIC 3670 gave Technology
  ["0000790051", { ticker: "CSL", sector: "Industrials" }], // Carlisle Companies; SIC 3060 gave Materials
  // —— Consumer staples ——
  ["0000823277", { ticker: "CHSCP", sector: "Consumer staples" }], // CHS; SIC 5150 gave Industrials
  ["0000726958", { ticker: "CASY", sector: "Consumer staples" }], // Casey’s General Stores; SIC 5500 gave Consumer discretionary
  ["0000055785", { ticker: "KMB", sector: "Consumer staples" }], // Kimberly-Clark; SIC 2670 gave Materials
  ["0000821026", { ticker: "ANDE", sector: "Consumer staples" }], // Andersons; SIC 5150 gave Industrials
  ["0000088121", { ticker: "SEB", sector: "Consumer staples" }], // Seaboard; SIC 5150 gave Industrials
  ["0001180262", { ticker: "HLF", sector: "Consumer staples" }], // Herbalife; SIC 5122 gave Health care
  // —— Consumer discretionary ——
  ["0001577552", { ticker: "BABA", sector: "Consumer discretionary" }], // Alibaba Group Holding; SIC 7389 gave Industrials
  ["0001737806", { ticker: "PDD", sector: "Consumer discretionary" }], // PDD; SIC 7389 gave Industrials
  ["0000320187", { ticker: "NKE", sector: "Consumer discretionary" }], // Nike; SIC 3021 gave Materials
  ["0001075531", { ticker: "BKNG", sector: "Consumer discretionary" }], // Booking; SIC 4700 gave Industrials
  ["0000815097", { ticker: "CCL", sector: "Consumer discretionary" }], // Carnival; SIC 4400 gave Industrials
  ["0000040987", { ticker: "GPC", sector: "Consumer discretionary" }], // Genuine Parts; SIC 5013 gave Industrials
  ["0001099590", { ticker: "MELI", sector: "Consumer discretionary" }], // MercadoLibre; SIC 7389 gave Industrials
  ["0001703399", { ticker: "SE", sector: "Consumer discretionary" }], // Sea; SIC 7380 gave Industrials
  ["0000042582", { ticker: "GT", sector: "Consumer discretionary" }], // Goodyear Tire & Rubber; SIC 3011 gave Materials
  ["0000884887", { ticker: "RCL", sector: "Consumer discretionary" }], // Royal Caribbean Cruises; SIC 4400 gave Industrials
  ["0001635327", { ticker: "FLUT", sector: "Consumer discretionary" }], // Flutter Entertainment; SIC 7370 gave Technology
  ["0001324424", { ticker: "EXPE", sector: "Consumer discretionary" }], // Expedia Group; SIC 4700 gave Industrials
  ["0001792789", { ticker: "DASH", sector: "Consumer discretionary" }], // DoorDash; SIC 7389 gave Industrials
  ["0001065696", { ticker: "LKQ", sector: "Consumer discretionary" }], // LKQ; SIC 5010 gave Industrials
  ["0001559720", { ticker: "ABNB", sector: "Consumer discretionary" }], // Airbnb; SIC 7340 gave Industrials
  ["0001065088", { ticker: "EBAY", sector: "Consumer discretionary" }], // eBay; SIC 7389 gave Industrials
  ["0001513761", { ticker: "NCLH", sector: "Consumer discretionary" }], // Norwegian Cruise Line; SIC 4400 gave Industrials
  ["0001269238", { ticker: "TCOM", sector: "Consumer discretionary" }], // Trip.com Group; SIC 7389 gave Industrials
  ["0001121788", { ticker: "GRMN", sector: "Consumer discretionary" }], // Garmin; SIC 3812 gave Industrials
  ["0000814453", { ticker: "NWL", sector: "Consumer discretionary" }], // Newell Brands; SIC 3089 gave Materials
  ["0000931015", { ticker: "PII", sector: "Consumer discretionary" }], // Polaris; SIC 3790 gave Industrials
  ["0000910521", { ticker: "DECK", sector: "Consumer discretionary" }], // Deckers Outdoor; SIC 3021 gave Materials
  ["0000014930", { ticker: "BC", sector: "Consumer discretionary" }], // Brunswick; SIC 3510 gave Industrials
  ["0000945841", { ticker: "POOL", sector: "Consumer discretionary" }], // Pool; SIC 5090 gave Industrials
  ["0001703056", { ticker: "ADT", sector: "Consumer discretionary" }], // ADT; SIC 7381 gave Industrials
  ["0001524358", { ticker: "VAC", sector: "Consumer discretionary" }], // Marriott Vacations Worldwide; SIC 6531 gave Real estate
  // —— Communication ——
  ["0001652044", { ticker: "GOOGL", sector: "Communication" }], // Alphabet; SIC 7370 gave Technology
  ["0001326801", { ticker: "META", sector: "Communication" }], // Meta Platforms; SIC 7370 gave Technology
  ["0001744489", { ticker: "DIS", sector: "Communication" }], // Walt Disney; SIC 7990 gave Consumer discretionary
  ["0001065280", { ticker: "NFLX", sector: "Communication" }], // Netflix; SIC 7841 gave Consumer discretionary
  ["0001335258", { ticker: "LYV", sector: "Communication" }], // Live Nation Entertainment; SIC 7900 gave Consumer discretionary
  ["0001329099", { ticker: "BIDU", sector: "Communication" }], // Baidu; SIC 7370 gave Technology
  ["0000029989", { ticker: "OMC", sector: "Communication" }], // Omnicom Group; SIC 7311 gave Industrials
  ["0001110646", { ticker: "NTES", sector: "Communication" }], // NetEase; SIC 7372 gave Technology
  ["0001319161", { ticker: "WMG", sector: "Communication" }], // Warner Music Group; SIC 7900 gave Consumer discretionary
  ["0000946581", { ticker: "TTWO", sector: "Communication" }], // Take-Two Interactive Software; SIC 7372 gave Technology
  ["0001564408", { ticker: "SNAP", sector: "Communication" }], // Snap; SIC 7370 gave Technology
]);

// The sector the screener shows: the hand-checked one where there is one,
// otherwise SIC's.
export function sectorFor(cik: string, sic: string | null): Sector | null {
  return SECTOR_CORRECTIONS.get(cik)?.sector ?? sectorFromSic(sic);
}

import { describe, expect, it } from "vitest";
import { OUTSIDE_US, filerProfileFrom, locationFrom, type RawSubmissions } from "@/lib/sec/client";

// The fields the screener reads from a submissions file, as the SEC serves
// them (NVIDIA, 5 November 2026), with the filing lists left empty.
const NVDA = {
  cik: "1045810",
  name: "NVIDIA CORP",
  sic: "3674",
  sicDescription: "Semiconductors & Related Devices",
  fiscalYearEnd: "0131",
  entityType: "operating",
  tickers: ["NVDA"],
  exchanges: ["Nasdaq"],
  addresses: {
    mailing: { stateOrCountry: "CA", stateOrCountryDescription: "CA", isForeignLocation: null },
    business: { stateOrCountry: "CA", stateOrCountryDescription: "CA", isForeignLocation: null },
  },
  filings: { recent: { accessionNumber: [], filingDate: [], reportDate: [], form: [], primaryDocument: [] } },
} as unknown as RawSubmissions;

describe("filerProfileFrom", () => {
  it("keeps SIC, the business address's state and the share listings", () => {
    expect(filerProfileFrom(NVDA)).toEqual({
      cik: "0001045810",
      name: "NVIDIA CORP",
      sic: "3674",
      sicDescription: "Semiconductors & Related Devices",
      state: "CA",
      fiscalYearEnd: "0131",
      entityType: "operating",
      tickers: ["NVDA"],
      exchanges: ["Nasdaq"],
    });
  });

  it("never falls back to the mailing address", () => {
    const raw = { ...NVDA, addresses: { mailing: { stateOrCountry: "DE" }, business: {} } } as RawSubmissions;
    expect(filerProfileFrom(raw).state).toBeNull();
  });

  it("leaves SIC empty rather than guessing", () => {
    expect(filerProfileFrom({ ...NVDA, sic: "" } as RawSubmissions).sic).toBeNull();
  });
});

describe("locationFrom", () => {
  it("returns U.S. states, DC and territories as their codes", () => {
    expect(locationFrom({ stateOrCountry: "MA" })).toBe("MA");
    expect(locationFrom({ stateOrCountry: "dc" })).toBe("DC");
    expect(locationFrom({ stateOrCountry: "PR" })).toBe("PR");
  });

  it("puts every foreign code outside the U.S.", () => {
    // K3 is the SEC's code for Hong Kong, A6 for Ontario.
    expect(locationFrom({ stateOrCountry: "K3" })).toBe(OUTSIDE_US);
    expect(locationFrom({ stateOrCountry: "A6" })).toBe(OUTSIDE_US);
    expect(locationFrom({ stateOrCountry: "CA", isForeignLocation: 1 })).toBe(OUTSIDE_US);
  });

  it("reads a foreign address that has a country and no state code (Teva, 5 November 2026)", () => {
    expect(locationFrom({ stateOrCountry: null, isForeignLocation: 1, country: "Israel" })).toBe(OUTSIDE_US);
    expect(locationFrom({ stateOrCountry: null, country: "Bermuda" })).toBe(OUTSIDE_US);
  });

  it("is blank, not guessed, when there is no address", () => {
    expect(locationFrom(undefined)).toBeNull();
    expect(locationFrom({ stateOrCountry: "  " })).toBeNull();
  });
});

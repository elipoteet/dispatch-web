import { describe, expect, it } from "vitest";
import { NAME_OVERRIDES, companyName, displayName, preferredSecName } from "@/lib/screener/names";

describe("which of the SEC's names", () => {
  it("keeps the filings' name when it is the registrant's name written differently", () => {
    expect(preferredSecName("A. O. Smith Corporation", "SMITH A O CORP")).toBe("A. O. Smith Corporation");
    expect(preferredSecName("W. R. BERKLEY CORP", "BERKLEY W R CORP")).toBe("W. R. BERKLEY CORP");
    expect(preferredSecName("McDONALD’S CORPORATION", "MCDONALDS CORP")).toBe("McDONALD’S CORPORATION");
    expect(preferredSecName("COLGATE-PALMOLIVE COMPANY", "COLGATE PALMOLIVE CO")).toBe("COLGATE-PALMOLIVE COMPANY");
    expect(preferredSecName("ELI LILLY AND COMPANY", "ELI LILLY & Co")).toBe("ELI LILLY AND COMPANY");
    expect(preferredSecName("Vantage Corp", "Vantage Corp (Singapore)")).toBe("Vantage Corp");
  });

  it("prefers the one in mixed case when both are the same name", () => {
    expect(preferredSecName("SERVICENOW, INC.", "ServiceNow, Inc.")).toBe("ServiceNow, Inc.");
    expect(preferredSecName("SHARKNINJA, INC.", "SharkNinja, Inc.")).toBe("SharkNinja, Inc.");
    expect(preferredSecName("T-MOBILE US, INC.", "T-Mobile US, Inc.")).toBe("T-Mobile US, Inc.");
    // A lower-case legal form alone isn't mixed case.
    expect(preferredSecName("EQT CORPORATION", "EQT Corp")).toBe("EQT CORPORATION");
  });

  it("takes the registrant's current name over a co-filer's or an old one", () => {
    expect(preferredSecName("BofA Finance LLC", "BANK OF AMERICA CORP /DE/")).toBe("BANK OF AMERICA CORP /DE/");
    expect(preferredSecName("SKK Holdings Limited", "Rantizo")).toBe("Rantizo");
    expect(preferredSecName("FRANKLIN RESOURCES, INC.", "FRANKLIN TEMPLETON INC")).toBe("FRANKLIN TEMPLETON INC");
    expect(preferredSecName("NVIDIA CORP", null)).toBe("NVIDIA CORP");
    expect(preferredSecName("NVIDIA CORP", "  ")).toBe("NVIDIA CORP");
  });
});

describe("names written as a person would", () => {
  it("fixes the ones Eli listed", () => {
    expect(displayName("0000912767", "UFP INDUSTRIES, INC.", "UFP INDUSTRIES INC")).toBe("UFP Industries");
    expect(displayName("0000033213", "EQT CORPORATION", "EQT Corp")).toBe("EQT");
    expect(displayName("0001373715", "SERVICENOW, INC.", "ServiceNow, Inc.")).toBe("ServiceNow");
    expect(displayName("0000822416", "PULTEGROUP, INC.", "PULTEGROUP INC/MI/")).toBe("PulteGroup");
    expect(displayName("0001957132", "SHARKNINJA, INC.", "SharkNinja, Inc.")).toBe("SharkNinja");
    expect(displayName("0001564708", "NEWS CORPORATION", "NEWS CORP")).toBe("News Corp");
  });

  it("reads capitals: title case, short initials kept, small words lowered", () => {
    expect(companyName("AIR PRODUCTS AND CHEMICALS, INC.")).toBe("Air Products and Chemicals");
    expect(companyName("BANK OF AMERICA CORP /DE/")).toBe("Bank of America");
    expect(companyName("AT&T INC.")).toBe("AT&T");
    expect(companyName("AES CORP")).toBe("AES");
    expect(companyName("BEST BUY CO., INC.")).toBe("Best Buy");
    expect(companyName("GAP, INC")).toBe("Gap");
    expect(companyName("O'REILLY AUTOMOTIVE INC")).toBe("O'Reilly Automotive");
    expect(companyName("US BANCORP \\DE\\")).toBe("US Bancorp");
    expect(companyName("3M CO")).toBe("3M");
    expect(companyName("HP INC")).toBe("HP");
    expect(companyName("STURM,     RUGER & COMPANY, INC.")).toBe("Sturm, Ruger");
    expect(companyName("AMAZON.COM, INC.")).toBe("Amazon.com");
  });

  it("leaves mixed case alone apart from a capitalised word", () => {
    expect(companyName("Alphabet Inc.")).toBe("Alphabet");
    expect(companyName("The Trade Desk, Inc.")).toBe("Trade Desk");
    expect(companyName("Bank Of The Ozarks")).toBe("Bank Of The Ozarks");
    expect(companyName("PACIFIC GAS & ELECTRIC Co")).toBe("Pacific Gas & Electric");
    expect(companyName("CVS HEALTH Corp")).toBe("CVS Health");
    expect(companyName("McKESSON CORP")).toBe("McKesson");
    expect(companyName("McDONALD’S CORPORATION")).toBe("McDonald’s");
    expect(companyName("RxSIGHT, INC.")).toBe("RxSIGHT");
    expect(companyName("BALL Corp")).toBe("Ball");
  });

  it("drops place tags and stray slashes", () => {
    expect(companyName("Walt Disney Co/")).toBe("Walt Disney");
    expect(companyName("Troops, Inc. /Cayman Islands/")).toBe("Troops");
    expect(companyName("Azora Therapeutics, Inc. (DE)")).toBe("Azora Therapeutics");
    expect(companyName("HUTCHMED (China) Ltd")).toBe("Hutchmed (China)");
  });

  it("checks every name on the short list is written out", () => {
    for (const [cik, name] of Object.entries(NAME_OVERRIDES)) {
      expect(cik).toMatch(/^\d{10}$/);
      expect(name.trim()).toBe(name);
    }
  });
});

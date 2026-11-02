// What changed in the risk factors. The fixture is NVIDIA's real Item 1A from
// its fiscal 2025 and 2026 10-Ks, split into paragraphs; the rest reproduces
// the shapes found in real filings (November 2026).

import { describe, expect, it } from "vitest";
import { htmlToText } from "./tenK";
import { compareRiskFactors, extractRiskFactors, firstSentence, normalize, riskParagraphs, textFragment } from "./riskFactors";
import nvda from "./__fixtures__/nvda-risk-factors.json";

const BODY = "Our business depends on the continued demand for our products, which can fall sharply. ".repeat(40);

describe("extractRiskFactors", () => {
  const filing = (between: string) =>
    htmlToText(`<html><body>
<table><tr><td>Item 1A.</td><td>Risk Factors</td><td>12</td></tr><tr><td>Item 1B.</td><td>Unresolved Staff Comments</td><td>30</td></tr></table>
<p>Item 1A. Risk Factors</p><p>${BODY}</p>
<p>${between}</p><p>Nothing to report.</p>
<p>Item 2. Properties</p><p>We lease offices.</p>
</body></html>`);

  it("finds the section, not the table of contents line, ending at Item 1B", () => {
    const s = extractRiskFactors(filing("Item 1B. Unresolved Staff Comments"))!;
    expect(s.startsWith("Item 1A. Risk Factors")).toBe(true);
    expect(s).toContain("continued demand");
    expect(s).not.toContain("Unresolved");
  });

  it("ends at Item 1C (cybersecurity) where that comes first", () => {
    expect(extractRiskFactors(filing("Item 1C. Cybersecurity"))).not.toContain("Cybersecurity");
  });

  it("returns nothing for a cross-reference too short to be the section", () => {
    expect(extractRiskFactors("Item 1A. Risk Factors\nSee our annual report.\nItem 1B. Unresolved Staff Comments")).toBeNull();
  });
});

describe("riskParagraphs", () => {
  it("drops a leading bullet, which in the filing sits apart from the text", () => {
    const section = ["Item 1A. Risk Factors", "•Commercial arrangements expose us to counterparty risks, which may negatively impact our business."].join("\n");
    expect(riskParagraphs(section)).toEqual(["Commercial arrangements expose us to counterparty risks, which may negatively impact our business."]);
  });

  it("keeps bulleted list items apart, even one in lower case after '; and'", () => {
    const section = [
      "Item 1A. Risk Factors",
      "•the availability of sufficient supply of components and manufacturing capacity; and",
      "•our customers’ and partners’ ability to secure capital and energy and to build complex datacenter infrastructure timely.",
    ].join("\n");
    expect(riskParagraphs(section)).toHaveLength(2);
  });

  it("drops headings and page furniture, and rejoins a sentence a page break cut", () => {
    const section = [
      "Item 1A. Risk Factors",
      "Risks Related to Our Industry",
      "Competition could adversely impact our market share and financial results, because rivals may",
      "31",
      "Parts I and II",
      "introduce products with better performance or lower prices.",
      "We depend on third parties to manufacture, assemble, package and test our products.",
    ].join("\n");
    expect(riskParagraphs(section)).toEqual([
      "Competition could adversely impact our market share and financial results, because rivals may introduce products with better performance or lower prices.",
      "We depend on third parties to manufacture, assemble, package and test our products.",
    ]);
  });
});

describe("compareRiskFactors", () => {
  const p = {
    supply: "We depend on third parties to manufacture, assemble, package and test our products. A disruption at any of them would delay shipments.",
    export: "In fiscal year 2025 the government imposed licensing requirements on exports of our products to China. These requirements reduced our revenue.",
    tariffs: "New tariffs on imported components could raise our costs. We may not be able to pass these costs on to customers.",
    talent: "We must attract and retain highly skilled engineers. Competition for such people is intense.",
  };

  it("treats a paragraph whose only change is a year or a number as unchanged", () => {
    const r = compareRiskFactors([p.export], [p.export.replace("2025", "2026")]);
    expect(r.counts).toMatchObject({ unchanged: 1, changed: 0, reworded: 0, added: 0, removed: 0 });
  });

  it("sorts paragraphs into added and removed when nothing in the old one matches", () => {
    const r = compareRiskFactors([p.supply, p.export], [p.supply, p.tariffs]);
    expect(r.added).toEqual([p.tariffs]);
    expect(r.removed).toEqual([p.export]);
    expect(r.counts.unchanged).toBe(1);
  });

  it("calls a paragraph with a new sentence changed, and shows only that sentence", () => {
    const grown = `${p.supply} We have also entered into prepaid capacity agreements.`;
    const r = compareRiskFactors([p.supply], [grown]);
    expect(r.counts.changed).toBe(1);
    expect(r.changes[0]).toEqual({ kind: "changed", pairs: [{ old: null, new: "We have also entered into prepaid capacity agreements." }] });
  });

  it("calls a paragraph with the same sentences in different words reworded, old beside new", () => {
    const edited = p.supply.replace("A disruption at any of them would delay shipments.", "A disruption at any of them could delay our shipments.");
    const r = compareRiskFactors([p.supply], [edited]);
    expect(r.changes).toEqual([
      {
        kind: "reworded",
        pairs: [{ old: "A disruption at any of them would delay shipments.", new: "A disruption at any of them could delay our shipments." }],
      },
    ]);
  });

  it("doesn't pair two different risks just because both say 'the Company' over and over", () => {
    // Apple's App Store paragraph was once matched to its new summary
    // paragraph this way, before terms were weighted by rarity.
    // Like Apple's, every paragraph here ends with the same stock sentence.
    const filler = "The Company's business, reputation, results of operations and financial condition could be affected.";
    const a = `The Company distributes third-party applications through the App Store and retains a commission. ${filler}`;
    const b = `The following summarizes factors that could have a material adverse effect on the Company. ${filler}`;
    const others = [p.supply, p.export, p.tariffs, p.talent].map((x) => `${x} ${filler}`);
    const r = compareRiskFactors([...others, a], [...others, b]);
    expect(r.counts).toMatchObject({ added: 1, removed: 1, changed: 0, reworded: 0 });
  });
});

describe("NVIDIA, fiscal 2025 to fiscal 2026", () => {
  const r = compareRiskFactors(nvda.fy2025.paragraphs, nvda.fy2026.paragraphs);

  it("finds the new risks in the newer 10-K", () => {
    expect(r.added.some((s) => /license arrangement with Groq/.test(s))).toBe(true);
    expect(r.added.some((s) => /secure capital and energy/.test(s))).toBe(true);
  });

  it("finds the ones dropped from it", () => {
    expect(r.removed.some((s) => /“AI Diffusion” IFR/.test(s))).toBe(true);
  });

  it("leaves most paragraphs unchanged, as a year-on-year update does", () => {
    expect(r.counts.unchanged).toBeGreaterThan(r.counts.newParagraphs / 2);
    expect(r.counts.added + r.counts.changed + r.counts.reworded + r.counts.unchanged).toBe(r.counts.newParagraphs);
  });
});

describe("helpers", () => {
  it("sets numbers aside when comparing", () => {
    expect(normalize("In fiscal 2026, revenue rose 12% to $215.9 billion.")).toBe(normalize("In fiscal 2025, revenue rose 9% to $130.5 billion."));
  });

  it("takes a paragraph's first sentence", () => {
    expect(firstSentence("We sell chips. Demand varies.")).toBe("We sell chips.");
  });

  it("links to a sentence by its first and last words, escaping what the syntax reserves", () => {
    expect(textFragment("Short one-line risk.")).toBe("#:~:text=Short%20one%2Dline%20risk.");
    expect(
      textFragment("We have entered into an intellectual property license arrangement with Groq, Inc., or Groq, that required significant, nonrefundable payments."),
    ).toBe("#:~:text=We%20have%20entered%20into%20an%20intellectual,Groq%2C%20that%20required%20significant%2C%20nonrefundable%20payments.");
  });
});

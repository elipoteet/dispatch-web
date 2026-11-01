// Item 1 extraction. The three shapes below are the ones found in real 10-Ks
// (October 2026): NVIDIA's table of contents splits "Item 1." and "Business"
// into separate cells; Costco writes "Item 1—Business"; JPMorgan writes
// "Item 1. Business." with a trailing period. All three were checked against
// the full filings, where the extractor returned the real section each time
// (NVIDIA 48K characters, JPMorgan 39K, Costco 20K) and skipped the table of
// contents. The full filings (2–13MB) are too large to keep as fixtures, so
// these reproduce their structure.

import { describe, expect, it } from "vitest";
import { extractBusinessSection, htmlToText, ownWordsExcerpt } from "@/lib/sec/tenK";

const BODY = "The company designs and sells widgets to manufacturers around the world. ".repeat(12);

function filing(item1Heading: string, tocItem1: string): string {
  return `<html><head><title>10-K</title><style>.x{}</style></head><body>
<div style="display:none"><ix:header><ix:hidden>Item 1. Business hidden fact</ix:hidden></ix:header></div>
<table>
  <tr><td>${tocItem1}</td><td>4</td></tr>
  <tr><td>Item 1A.</td><td>Risk Factors</td><td>12</td></tr>
</table>
<p>PART I</p>
<p>${item1Heading}</p>
<p>Our Company</p>
<p>${BODY}</p>
<p>Item 1A. Risk Factors</p>
<p>Risks follow.</p>
</body></html>`;
}

describe("extractBusinessSection", () => {
  it("finds the real section, not the table of contents (NVIDIA's split cells)", () => {
    const section = extractBusinessSection(htmlToText(filing("Item 1. Business", "Item 1.</td><td>Business")))!;
    expect(section.startsWith("Item 1. Business\nOur Company")).toBe(true);
    expect(section).toContain("designs and sells widgets");
    expect(section).not.toContain("Risk Factors");
  });

  it("handles a dash between the number and the word (Costco)", () => {
    const section = extractBusinessSection(htmlToText(filing("Item 1&#8212;Business", "Item 1. Business")))!;
    expect(section.startsWith("Item 1—Business")).toBe(true);
  });

  it("handles a trailing period and a non-breaking space (JPMorgan)", () => {
    const section = extractBusinessSection(htmlToText(filing("Item&#160;1. Business.", "Item 1. Business.")))!;
    expect(section.startsWith("Item 1. Business.")).toBe(true);
  });

  it("returns null when there is no Item 1A to end the section", () => {
    expect(extractBusinessSection(htmlToText(`<p>Item 1. Business</p><p>${BODY}</p>`))).toBeNull();
  });

  it("returns null when all it finds is a stub too short to be the section", () => {
    expect(extractBusinessSection(htmlToText("<p>Item 1. Business</p><p>See page 40.</p><p>Item 1A. Risk Factors</p>"))).toBeNull();
  });
});

// The openings below are copied from the companies' real 10-Ks (October 2026),
// each chosen for the trap it sets.
describe("ownWordsExcerpt", () => {
  it("quotes the opening description (NVIDIA)", () => {
    const section = [
      "Item 1. Business",
      "Our Company",
      "NVIDIA pioneered accelerated computing to help solve the most challenging computational problems. NVIDIA is now a data center scale AI infrastructure company reshaping all industries.",
      "Our technology stack includes the foundational NVIDIA CUDA development platform that runs on all NVIDIA GPUs.",
    ].join("\n");
    expect(ownWordsExcerpt(section)).toBe(
      "NVIDIA pioneered accelerated computing to help solve the most challenging computational problems. NVIDIA is now a data center scale AI infrastructure company reshaping all industries.",
    );
  });

  it("skips a forward-looking-statements paragraph (Amazon)", () => {
    const section = [
      "Item 1. Business",
      "This Annual Report on Form 10-K and the documents incorporated herein by reference contain forward-looking statements based on expectations, estimates, and projections as of the date of this filing.",
      "General",
      "We seek to be Earth’s most customer-centric company. We are guided by four principles: customer obsession rather than competitor focus, passion for invention, commitment to operational excellence, and long-term thinking.",
    ].join("\n");
    expect(ownWordsExcerpt(section)).toMatch(/^We seek to be Earth’s most customer-centric company\. We are guided/);
  });

  it("skips the paragraph defining “we” and “the Company” (UnitedHealth, Coca-Cola)", () => {
    const unh = [
      "ITEM 1. BUSINESS",
      "OUR BUSINESSES",
      "Overview",
      "The terms “we,” “our,” “us,” “its,” “UnitedHealth Group,” or the “Company” used in this report refer to UnitedHealth Group Incorporated and its subsidiaries.",
      "UnitedHealth Group Incorporated is a health care and well-being company with a mission to help people live healthier lives and help make the health system work better for everyone.",
    ].join("\n");
    expect(ownWordsExcerpt(unh)).toMatch(/^UnitedHealth Group Incorporated is a health care/);
    const ko = [
      "ITEM 1. BUSINESS",
      "In this report, the terms “The Coca-Cola Company,” “Company,” “we,” “us” and “our” mean The Coca-Cola Company and all entities included in our consolidated financial statements.",
      "General",
      "The Coca-Cola Company is a total beverage company, and beverage products bearing our trademarks, sold in the United States since 1886, are now sold in more than 200 countries and territories.",
    ].join("\n");
    expect(ownWordsExcerpt(ko)).toMatch(/^The Coca-Cola Company is a total beverage company/);
  });

  it("rejoins a sentence a page break cut in two, dropping the footer (Pfizer)", () => {
    const section = [
      "ITEM 1. BUSINESS",
      "ABOUT PFIZER",
      "Pfizer Inc. is a research-based, global biopharmaceutical company. We apply science and our global resources to bring therapies to people that extend and significantly improve their lives through the discovery, development, manufacture, marketing, sale and distribution of",
      "Pfizer Inc. 2025 Form 10-K",
      "3",
      "biopharmaceutical products worldwide. We work across developed and emerging markets to advance wellness.",
    ].join("\n");
    expect(ownWordsExcerpt(section)).toBe(
      "Pfizer Inc. is a research-based, global biopharmaceutical company. We apply science and our global resources to bring therapies to people that extend and significantly improve their lives through the discovery, development, manufacture, marketing, sale and distribution of biopharmaceutical products worldwide.",
    );
  });

  it("drops defined-term asides and keeps ordinary ones (JPMorgan, Costco)", () => {
    const jpm = [
      "Item 1. Business.",
      "Overview",
      "JPMorgan Chase & Co. (“JPMorganChase” or the “Firm”, NYSE: JPM), a financial holding company incorporated under Delaware law in 1968, is a leading financial services firm based in the United States of America (“U.S.”), with operations worldwide. JPMorganChase had $4.4 trillion in assets.",
    ].join("\n");
    expect(ownWordsExcerpt(jpm)).toBe(
      "JPMorgan Chase & Co., a financial holding company incorporated under Delaware law in 1968, is a leading financial services firm based in the United States of America, with operations worldwide.",
    );
    const cost = [
      "Item 1—Business",
      "Costco Wholesale Corporation and its subsidiaries (Costco or the Company) began operations in 1983, in Seattle, Washington. We are principally engaged in the operation of membership warehouses in the United States (U.S.) and Puerto Rico.",
    ].join("\n");
    expect(ownWordsExcerpt(cost)).toBe(
      "Costco Wholesale Corporation and its subsidiaries began operations in 1983, in Seattle, Washington. We are principally engaged in the operation of membership warehouses in the United States (U.S.) and Puerto Rico.",
    );
  });

  it("removes a footnote marker glued to a name (Chevron)", () => {
    const section = [
      "Item 1. Business",
      "General Development of Business",
      "Summary Description of Chevron",
      "Chevron Corporation1, a Delaware corporation, manages its investments in subsidiaries and affiliates and provides administrative, financial, management and technology support to U.S. and international subsidiaries that engage in integrated energy and chemicals operations.",
    ].join("\n");
    expect(ownWordsExcerpt(section)).toMatch(/^Chevron Corporation, a Delaware corporation, manages/);
  });

  it("leaves out a second sentence that is only calendar housekeeping (Apple)", () => {
    const section = [
      "Item 1. Business",
      "Company Background",
      "The Company designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories, and sells a variety of related services. The Company’s fiscal year is the 52- or 53-week period that ends on the last Saturday of September.",
    ].join("\n");
    expect(ownWordsExcerpt(section)).toBe(
      "The Company designs, manufactures and markets smartphones, personal computers, tablets, wearables and accessories, and sells a variety of related services.",
    );
  });

  it("does not end a sentence at “Inc.” or “U.S.”", () => {
    const section = ["Item 1. Business", "The Home Depot, Inc. is the world’s largest home improvement retailer. It operates stores in the U.S. Virgin Islands and elsewhere across the country, every one of them large."].join("\n");
    expect(ownWordsExcerpt(section)).toBe(
      "The Home Depot, Inc. is the world’s largest home improvement retailer. It operates stores in the U.S. Virgin Islands and elsewhere across the country, every one of them large.",
    );
  });

  it("returns null when there is no description paragraph at all", () => {
    expect(ownWordsExcerpt("Item 1. Business\nOverview\nSee page 40.")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("drops the hidden XBRL header, scripts and styles, and decodes entities", () => {
    const text = htmlToText(`<style>p{}</style><ix:header>secret</ix:header><p>AT&amp;T&#8217;s &quot;network&quot;&nbsp;grew</p>`);
    expect(text).toBe("AT&T’s \"network\" grew");
  });
});

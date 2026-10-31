// Item 1 extraction. The three shapes below are the ones found in real 10-Ks
// (October 2026): NVIDIA's table of contents splits "Item 1." and "Business"
// into separate cells; Costco writes "Item 1—Business"; JPMorgan writes
// "Item 1. Business." with a trailing period. All three were checked against
// the full filings, where the extractor returned the real section each time
// (NVIDIA 48K characters, JPMorgan 39K, Costco 20K) and skipped the table of
// contents. The full filings (2–13MB) are too large to keep as fixtures, so
// these reproduce their structure.

import { describe, expect, it } from "vitest";
import { extractBusinessSection, htmlToText } from "@/lib/sec/tenK";

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

describe("htmlToText", () => {
  it("drops the hidden XBRL header, scripts and styles, and decodes entities", () => {
    const text = htmlToText(`<style>p{}</style><ix:header>secret</ix:header><p>AT&amp;T&#8217;s &quot;network&quot;&nbsp;grew</p>`);
    expect(text).toBe("AT&T’s \"network\" grew");
  });
});

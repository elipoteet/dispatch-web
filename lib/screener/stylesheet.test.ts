import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The screener's opening page and its filter panel share one stylesheet and
// one class prefix. On 16 November 2026 both defined .rf-scr-q (the group
// heading and the panel's "?" button), and every heading rendered as a 24px
// box. This holds each screener class to one top-level rule.
describe("the screener's stylesheet", () => {
  const css = readFileSync("app/research-file.css", "utf8");

  it("defines each screener class once outside media queries", () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    let depth = 0;
    let inMedia = false;
    css.split(/\r?\n/).forEach((line, i) => {
      if (depth === 0 && /^@media/.test(line)) inMedia = true;
      if (!inMedia) {
        // A rule that starts the line with one bare screener class.
        const m = line.match(/^\.(rf-scr-[\w-]+)\s*\{/);
        if (m) {
          if (seen.has(m[1])) dupes.push(`.${m[1]} at lines ${seen.get(m[1])} and ${i + 1}`);
          else seen.set(m[1], i + 1);
        }
      }
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (depth === 0) inMedia = false;
    });
    expect(dupes).toEqual([]);
    expect(seen.size).toBeGreaterThan(40);
  });

  it("keeps the panel's ? button and the opening page's group heading apart", () => {
    expect(css).toMatch(/^\.rf-scr-qbtn\s*\{/m);
    expect(css).toMatch(/^\.rf-scr-q\s*\{/m);
    const controls = readFileSync("components/screener/ScreenerControls.tsx", "utf8");
    const home = readFileSync("components/screener/ScreenerHome.tsx", "utf8");
    expect(controls).toContain("rf-scr-qbtn");
    expect(controls).not.toMatch(/"rf-scr-q["$ ]/);
    expect(home).toContain('className="rf-scr-q"');
  });
});

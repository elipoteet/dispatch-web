import { describe, expect, it } from "vitest";
import { classify, issueText } from "./site-status-check.mjs";

describe("reading the live site's answer", () => {
  it("knows Vercel's paused answer, by its header or its page", () => {
    expect(classify({ status: 503, vercelError: "DEPLOYMENT_PAUSED" })).toBe("paused");
    expect(classify({ status: 503, body: "<p>503: SERVICE_UNAVAILABLE</p><p>Code: DEPLOYMENT_PAUSED</p>" })).toBe("paused");
    expect(classify({ status: 402, vercelError: "DEPLOYMENT_PAUSED" })).toBe("paused");
  });

  it("calls a page ok and anything else down", () => {
    expect(classify({ status: 200, body: "<html>" })).toBe("ok");
    expect(classify({ status: 503, body: "Service unavailable" })).toBe("down");
    expect(classify({ status: 500 })).toBe("down");
    expect(classify({ status: 0 })).toBe("down");
  });

  it("writes an issue that says what happened and what to do", () => {
    const paused = issueText("paused", "HTTP 503 DEPLOYMENT_PAUSED", "2026-12-01 09:00 UTC");
    expect(paused.title).toBe("dispatchresearch.com is paused by Vercel");
    expect(paused.body).toContain("vercel.com/help");
    expect(paused.body).toContain("closes itself");
    expect(issueText("down", "no answer (TimeoutError)", "x").title).toBe("dispatchresearch.com isn't answering");
  });
});

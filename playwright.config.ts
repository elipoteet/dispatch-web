import { defineConfig, devices } from "@playwright/test";

// Smoke tests only — "is the site broken" rather than "is the site correct."
// They cover the signed-out, public surface, which is the part of the product
// that survives the research-network pivot (docs/product-spec-v3.md).
//
// Port 3100, not 3000, so running these never fights a dev server.
const PORT = 3100;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,

  // One worker, deliberately. Ticker pages hit Twelve Data, whose free tier
  // allows eight requests a minute, and parallel workers would race straight
  // into that ceiling and produce failures that look like bugs.
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // `npm run test:e2e` builds first, then this reuses that build. Never point
  // these at try.dispatchresearch.com — the assertions would run against live
  // data and real accounts.
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

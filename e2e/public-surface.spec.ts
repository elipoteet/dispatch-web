import { test, expect } from "@playwright/test";

// The signed-out, public surface. Playwright starts each test with a clean
// browser context and no cookies, so every test here runs as a stranger —
// which is also the state most of the site's value depends on (v2: "open to
// read, verified to post").
//
// Every assertion below was verified against a real `next start` build before
// it was written, not guessed from the source.

test.describe("the signed-out landing screen", () => {
  test("a stranger at the root gets the sign-in screen, not the feed", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Dispatch Social/);
    await expect(page.getByRole("heading", { level: 1, name: "Dispatch Social" })).toBeVisible();
    await expect(page.getByLabel("School email")).toBeVisible();
    // The disclaimer is a legal requirement, not decoration.
    await expect(page.getByText("Not investment advice")).toBeVisible();
  });

  test("the sign-in screen is the one page meant to be indexable", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    const robots = page.locator('meta[name="robots"]');
    if (await robots.count()) {
      await expect(robots).not.toHaveAttribute("content", /noindex/);
    }
  });
});

test.describe("research pages", () => {
  test("the research desk loads", async ({ page }) => {
    const response = await page.goto("/research");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Research/);
  });

  // Costs one provider call. Kept to a single known-good symbol on purpose.
  test("a real ticker page renders the company", async ({ page }) => {
    const response = await page.goto("/research/vst");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/VST/);
    await expect(page).toHaveTitle(/Vistra/);
  });

  test("an uppercase ticker URL redirects to the canonical lowercase one", async ({ page }) => {
    // Next 16 normalises the path itself — /research/VST 307s to
    // /research/vst. Worth pinning: internal links and any future canonical
    // URL depend on which spelling actually serves the page.
    await page.goto("/research/VST");
    expect(new URL(page.url()).pathname).toBe("/research/vst");
    await expect(page).toHaveTitle(/VST/);
  });

  test("a ticker that does not exist 404s rather than erroring", async ({ page }) => {
    const response = await page.goto("/research/zzzzqq");
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle(/Not Found/);
  });
});

test.describe("profiles", () => {
  // Depends on the Dispatch AI system account, created in migrations
  // 0016/0017. If this fails, check that account still exists before
  // suspecting the routing.
  test("a public profile is readable without an account", async ({ page }) => {
    const response = await page.goto("/u/dispatchai");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/@dispatchai/);
  });

  test("the /@handle URL serves the profile and stays in the address bar", async ({ page }) => {
    // This is the rewrite in next.config.ts. `@folder` is the parallel-routes
    // slot convention in the App Router, so /@handle can only work via that
    // rewrite — a documented trap, and this test is what would catch it
    // breaking.
    await page.goto("/@dispatchai");
    expect(new URL(page.url()).pathname).toBe("/@dispatchai");
    await expect(page).toHaveTitle(/@dispatchai/);
  });
});

test.describe("legal and auth pages", () => {
  test("the guidelines page renders", async ({ page }) => {
    await page.goto("/guidelines");
    await expect(page.getByRole("heading", { level: 1, name: "Community Guidelines" })).toBeVisible();
  });

  test("the disclaimer page renders", async ({ page }) => {
    await page.goto("/disclaimer");
    await expect(page.getByRole("heading", { level: 1, name: "Disclaimer" })).toBeVisible();
  });

  test("the login page offers the first step of signing in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in." })).toBeVisible();
  });
});

// This one tests a product rule rather than a page.
//
// The retired product's scoring engine is still in the tree, and the whole
// premise of the new product is that it produces no verdicts: "no rating, no
// score, no scorecard, no track record, and no buy/sell badge anywhere."
// Reintroducing that language is the single most likely accident in this
// repository, and it would not break a build or fail a type check.
test.describe("the no-scoring rule", () => {
  const PUBLIC_PAGES = ["/", "/research", "/research/vst", "/u/dispatchai"];
  const FORBIDDEN = [/buy\s*\/\s*sell/i, /overall rating/i, /scorecard/i, /score out of/i];

  for (const path of PUBLIC_PAGES) {
    test(`${path} shows no rating or score language`, async ({ page }) => {
      await page.goto(path);
      const body = (await page.locator("body").textContent()) ?? "";
      for (const pattern of FORBIDDEN) {
        expect(body, `"${pattern}" must not appear on ${path}`).not.toMatch(pattern);
      }
    });
  }
});

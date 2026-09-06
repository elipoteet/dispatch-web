import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Import boundaries. These encode the rules written in CLAUDE.md — the point
// is that a boundary nobody can see is a boundary that erodes. Every rule
// below was verified to already hold when it was added, so a failure means
// something new crossed a line, not that the rule was aspirational.
//
// If one of these is genuinely in your way, that is a conversation with Eli,
// not an eslint-disable comment.

const RETIRED_SURFACE_DIRS = ["portfolio", "research", "leaderboard", "competition", "home", "trade"];

// Both spellings have to be listed: this repo imports via the `@/` alias in
// most places but relative paths are legal and would otherwise slip past.
const patternsFor = (dirs) =>
  dirs.flatMap((dir) => [`@/components/${dir}/*`, `**/components/${dir}/*`, `../${dir}/*`]);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // 1. The new social product must not reach into the retired product's UI.
  {
    files: ["components/social/**/*.{ts,tsx}", "app/(social)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: patternsFor(RETIRED_SURFACE_DIRS),
              message:
                "The social product must not import the retired product's components. They share components/auth/ only — see CLAUDE.md, 'Import boundaries'.",
            },
          ],
        },
      ],
    },
  },

  // 2. ...and the retired product must not reach into the new one, so it can
  //    eventually be deleted in one piece.
  {
    files: [
      ...RETIRED_SURFACE_DIRS.map((dir) => `components/${dir}/**/*.{ts,tsx}`),
      "components/layout/**/*.{ts,tsx}",
      "app/(research)/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/social/*", "**/components/social/*"],
              message:
                "The retired product must not import the social product's components — it needs to stay deletable in one piece. See CLAUDE.md, 'Import boundaries'.",
            },
          ],
        },
      ],
    },
  },

  // 3. Logic does not depend on UI, and the service-role key never travels
  //    toward the browser.
  {
    files: ["lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*", "**/components/*"],
              message:
                "lib/ must not import from components/. Logic does not depend on UI — see CLAUDE.md, 'Import boundaries'.",
            },
          ],
        },
      ],
    },
  },

  // 4. lib/supabase/service.ts holds the service-role key, which bypasses
  //    every row-level-security rule. It belongs in route handlers and server
  //    components only. components/ is where "use client" lives, so nothing
  //    under it may import the key — this is the closest a path-based rule
  //    gets to "never ships to a browser."
  {
    files: ["components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/service", "**/lib/supabase/service"],
              message:
                "createServiceRoleClient bypasses row-level security and must never be reachable from a client component. Fetch server-side and pass the data down instead.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;

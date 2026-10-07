import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Next.js loads .env.local for the app, but Vitest does not — so without this a
// test that needs a key sees nothing and quietly skips, which looks like a pass.
// Only fills variables that are not already set, so CI and the shell still win.
// Values are never logged.
function loadEnvLocal() {
  const file = path.resolve(__dirname, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "").trim();
  }
}
loadEnvLocal();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Vitest owns the co-located unit tests next to the source they cover.
    // Playwright owns e2e/ and cannot run under this runner — without this
    // exclude, Vitest picks up e2e/*.spec.ts by its default glob and the
    // suite fails on an import it can never satisfy.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
});

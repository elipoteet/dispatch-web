import { defineConfig } from "vitest/config";
import path from "path";

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

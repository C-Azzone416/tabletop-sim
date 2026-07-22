import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // src/db/* are thin query wrappers (single SQL statement each) only exercised
      // against a real DB connection — not realistically unit-testable, and their 0%
      // permanently drags down the denominator. Excluded per PM decision (#test-coverage,
      // 2026-07-21) rather than left to skew the metric.
      exclude: ["src/index.ts", "src/db/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@tabletop/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});

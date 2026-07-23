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
      // Hard CI gate per PM directive (#test-coverage, 2026-07-22): coverage moves
      // from advisory to enforced. game-engine.ts carries the core game rules and
      // gets the higher bar; everything else uses the package-wide floor.
      thresholds: {
        lines: 80,
        "src/engine/game-engine.ts": { lines: 90 },
      },
    },
  },
  resolve: {
    alias: {
      "@tabletop/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});

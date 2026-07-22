import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
    css: false,
    exclude: ["**/node_modules/**", "**/test/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["app/**/*.{ts,tsx}"],
      // app/dev/* is dev-only seeding UI (gated behind NEXT_PUBLIC_ENABLE_DEV_TOOLS,
      // never shipped to production behavior) — not product code worth unit coverage.
      // Excluded per PM decision (#test-coverage, 2026-07-22), mirroring the server's
      // src/db/* exclusion (#108) rather than left to skew the metric.
      exclude: ["app/**/*.d.ts", "app/dev/**/*.{ts,tsx}"],
      // Hard CI gate per PM directive (#test-coverage, 2026-07-22): coverage moves
      // from advisory to enforced. Client coverage P1 (#116/#118/#119) is complete
      // — measured 86.34% lines on develop — so the gate is set to the final
      // target of 80% lines rather than an interim floor.
      thresholds: {
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@tabletop/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});

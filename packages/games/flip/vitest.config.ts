import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@tabletop/game-flip": path.resolve(__dirname, "./src"),
      "@tabletop/shared": path.resolve(__dirname, "../../shared/src"),
    },
  },
});

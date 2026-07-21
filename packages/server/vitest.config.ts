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
      exclude: ["src/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@tabletop/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});

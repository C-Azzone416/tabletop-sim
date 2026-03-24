import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "@tabletop/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});

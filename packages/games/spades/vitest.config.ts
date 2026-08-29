import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@tabletop/game-spades": path.resolve(__dirname, "./src"),
      "@tabletop/cards": path.resolve(__dirname, "../../cards/src"),
    },
  },
});

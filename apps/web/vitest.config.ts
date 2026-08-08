import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" -> "./src/*" path alias from tsconfig.json — vitest
// doesn't read tsconfig paths on its own.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

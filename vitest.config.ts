import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  test: {
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**", "playwright-report/**", "test-results/**"]
  }
});

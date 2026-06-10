import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Componentes usam o runtime JSX automatico (Next/React 19, sem import React).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  },
  test: {
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**", "playwright-report/**", "test-results/**"]
  }
});

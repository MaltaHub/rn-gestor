import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local lê o .env.local; no CI (GitHub Actions) as variáveis vêm do workflow.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const isCI = Boolean(process.env.CI);

const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3100";
const e2eBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // No CI a 1ª visita de cada rota compila no servidor de dev: mais folga.
  timeout: isCI ? 60_000 : 30_000,
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01
    }
  },
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["list"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: e2eBaseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: `npm run dev -- --port ${e2ePort}`,
    url: e2eBaseURL,
    reuseExistingServer: true,
    timeout: 240_000
  }
});

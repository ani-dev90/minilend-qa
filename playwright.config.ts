import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/** Path to the MiniLend app checkout. Defaults to a sibling folder named `minilend`. */
export const MINILEND_DIR = path.resolve(process.env.MINILEND_DIR ?? "../minilend");

export default defineConfig({
  testDir: "./tests",
  // Every test runs against one shared SQLite database, and "Simulate time +48h" touches all offers,
  // so the tests run one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/support/global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    cwd: MINILEND_DIR,
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

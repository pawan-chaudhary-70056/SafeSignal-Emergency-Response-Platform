import { defineConfig, devices } from "@playwright/test";

// Point the suite at another deployment (for example the docker compose stack
// on http://127.0.0.1:8080) by setting E2E_BASE_URL; no dev server is started.
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5174";
const usesExternalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: usesExternalServer
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});

import { defineConfig, devices } from "@playwright/test";

// Point at the deployed Worker by default; override for local:
//   BASE_URL=http://localhost:8787 npx playwright test
const baseURL = process.env.BASE_URL ?? "https://eugene-lms.workplacefiles.com";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // These specs share one app and one database — running them concurrently
  // makes them race each other, not the app.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

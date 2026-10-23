import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", fullyParallel: true, retries: 0, reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run start -- --port 3100", url: "http://127.0.0.1:3100/demo", reuseExistingServer: false, env: { FLETEOPS_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" } },
});

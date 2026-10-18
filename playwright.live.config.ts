import { defineConfig, devices } from "@playwright/test";

// Live tests: real Supabase project, temporary test people (see tests/e2e-live).
const PORT = 3102;
export default defineConfig({
  testDir: "tests/e2e-live",
  reporter: "list",
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"], locale: "en-GB", timezoneId: "Europe/London",
    // In sandboxes that reach the internet through a proxy, route the test browser through it too.
    launchOptions: process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } } : {},
  },
  webServer: { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: false, timeout: 60_000 },
});

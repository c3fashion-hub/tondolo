import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  timeout: 90_000, // accessibility scans can be slow on shared build machines
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"], locale: "en-GB", timezoneId: "Europe/London" },
  webServer: { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: false, timeout: 60_000 },
});

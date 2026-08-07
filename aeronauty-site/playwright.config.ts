import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3199);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    contextOptions: { reducedMotion: "reduce" },
    // API fixtures rely on page-level network routing. A controlling service
    // worker originates those requests outside page.route in WebKit, so the
    // general suite blocks it; PWA-specific tests can opt back in explicitly.
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-mobile",
      use: { ...devices["iPhone 15"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/apps/tile-tally`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: `${baseURL}/__e2e_supabase__/`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-test-public-key",
      NEXT_PUBLIC_TILETALLY_GOOGLE_CLIENT_ID: "e2e-google-client.apps.googleusercontent.com",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});

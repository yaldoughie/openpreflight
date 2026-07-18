import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['junit', { outputFile: 'artifacts/e2e-junit.xml' }]],
  webServer: {
    command: 'node apps/server/dist/server.js',
    url: 'http://127.0.0.1:4173/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: process.env.OPENPREFLIGHT_BROWSER_EXECUTABLE
      ? { executablePath: process.env.OPENPREFLIGHT_BROWSER_EXECUTABLE }
      : {},
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
  ],
});

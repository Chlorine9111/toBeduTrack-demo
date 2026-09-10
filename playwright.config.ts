import { defineConfig, devices } from '@playwright/test'

const useExternalBaseUrl = process.env.PLAYWRIGHT_USE_EXTERNAL_BASE_URL === '1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3011',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: useExternalBaseUrl
    ? undefined
    : {
        command: 'E2E_TEST=1 sh -c "pnpm exec next dev -p 3011 || npx next dev -p 3011"',
        url: 'http://localhost:3011',
        reuseExistingServer: false,
        timeout: 120_000,
      },
})

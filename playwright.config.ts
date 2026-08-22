import { defineConfig, devices } from '@playwright/test'
import { E2E_ORIGIN } from './e2e/constants'
import { e2eProcessEnv } from './e2e/env'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: E2E_ORIGIN,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec tsx e2e/serve.ts',
    url: `${E2E_ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: e2eProcessEnv(),
  },
})

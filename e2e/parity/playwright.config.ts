import { defineConfig } from '@playwright/test'
import { PARITY_ORIGIN, PARITY_ROOT, parityProcessEnv } from './env'

/**
 * `pnpm parity:capture`: screenshot every web design board's screen from the
 * parity server, at the board's size (web) and at phone width (web-mobile).
 * Reuses a running `pnpm parity:serve`; starts one when nothing is on :3600.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  outputDir: './.out/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: PARITY_ORIGIN,
    contextOptions: { reducedMotion: 'reduce' },
    colorScheme: 'dark',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    deviceScaleFactor: 1,
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'web',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'web-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm exec tsx e2e/parity/serve.ts',
    cwd: PARITY_ROOT,
    url: `${PARITY_ORIGIN}/api/health`,
    reuseExistingServer: true,
    timeout: 300_000,
    env: parityProcessEnv() as Record<string, string>,
  },
})

import { defineConfig } from 'vitest/config'
import path from 'node:path'

/** Opt-in, real-process exercise. Never part of the parallel unit-test suite. */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
  test: {
    include: ['scripts/verify-processing-load.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    testTimeout: 600_000,
    hookTimeout: 60_000,
  },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // Anchored to src/ — a bare '**/*.test.ts' sweeps copies of the repo
    // under .claude/worktrees/ (parallel agent checkouts) and their
    // node_modules, ballooning the run to thousands of foreign tests.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'extension/src/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    globals: true,
    // jsdom is opted into per-file via a `@vitest-environment jsdom` docblock
    // (component tests + feed-utils). environmentMatchGlobs was removed in Vitest 4.
    // Setup file for component tests (only applies DOM matchers in jsdom environment)
    setupFiles: ['./src/__tests__/setup-components.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

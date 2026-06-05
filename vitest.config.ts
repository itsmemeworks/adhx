import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
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

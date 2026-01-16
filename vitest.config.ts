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
    // Use jsdom for component tests (*.component.test.tsx)
    environmentMatchGlobs: [['**/*.component.test.tsx', 'jsdom']],
    // Setup file for component tests (only runs in jsdom environment)
    setupFiles: ['./src/__tests__/setup-components.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

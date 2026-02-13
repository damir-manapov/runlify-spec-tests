import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 120000,
  },
})

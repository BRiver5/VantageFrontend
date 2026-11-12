import { defineConfig } from 'vitest/config'

// Юнит-тесты чистой логики: без DOM, без сети
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

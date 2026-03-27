import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  timeout: 30000,
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // One persistent browser profile per test; keep it serial so the fixture servers stay calm.
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm --prefix fixtures/playground-app run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      // The playground again, with the companion's tinker-src plugin enabled.
      command: 'npm --prefix fixtures/playground-app run dev',
      env: { TINKER_SRC: '1' },
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
    },
    {
      // A production build of the playground (minified React, no debug info).
      command: 'npm --prefix fixtures/playground-app run preview',
      url: 'http://localhost:5176',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix fixtures/react18-app run dev',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

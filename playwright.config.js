// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:   './tests',
  testMatch: 'ui.spec.js',
  timeout:   30_000,
  retries:   1,
  reporter:  [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    headless:        true,
    screenshot:      'only-on-failure',
    video:           'off',
    actionTimeout:   8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

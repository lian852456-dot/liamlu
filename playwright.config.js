const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    ...devices['Desktop Chrome'],
    headless: process.env.PLAYWRIGHT_NEW_HEADLESS !== '1',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        ...(process.env.PLAYWRIGHT_NEW_HEADLESS === '1' ? ['--headless=new'] : []),
      ],
    },
  },
  reporter: 'list',
});

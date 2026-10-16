const { defineConfig, devices } = require('@playwright/test');

const chromiumLaunchOptions = {
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {})
};

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /department-fast-read-performance\.spec\.js/,
  timeout: 120000,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.PERF_PLAYWRIGHT_REPORTER || 'list',
  use: {
    headless: true,
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 }, launchOptions: chromiumLaunchOptions }
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, launchOptions: chromiumLaunchOptions }
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }
    }
  ]
});

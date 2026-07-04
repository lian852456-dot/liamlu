const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  reporter: 'list',
});

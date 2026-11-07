const { defineConfig, devices } = require('@playwright/test');

// Fixed local origins that specs hard-code (http://127.0.0.1:<port>/).
// Each one serves the repository root; Playwright starts them on demand and
// reuses one that is already running.
const STATIC_PORTS = [4173, 4176, 4198, 8763, 8765, 8766, 8767, 8772, 8774, 8875, 8881, 8891];

// Specs that read TEST_BASE_URL fall back to file:// or fail without it.
if (!process.env.TEST_BASE_URL) process.env.TEST_BASE_URL = 'http://127.0.0.1:8875/';

// Chromium names downloads from the a[download] attribute only when the
// process locale can encode it; under the POSIX "C" locale non-ASCII names
// (every Chinese export filename) degrade to "download". Force UTF-8.
const utf8Env = /utf-?8/i.test(process.env.LC_ALL || process.env.LANG || '')
  ? {}
  : { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };

module.exports = defineConfig({
  testDir: './tests',
  webServer: STATIC_PORTS.map(port => ({
    command: `node tests/support/static-server.cjs ${port}`,
    url: `http://127.0.0.1:${port}/home.html`,
    reuseExistingServer: true,
    timeout: 20_000,
  })),
  use: {
    ...devices['Desktop Chrome'],
    headless: process.env.PLAYWRIGHT_NEW_HEADLESS !== '1',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      env: { ...process.env, ...utf8Env },
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        ...(process.env.PLAYWRIGHT_NEW_HEADLESS === '1' ? ['--headless=new'] : []),
      ],
    },
  },
  reporter: 'list',
});

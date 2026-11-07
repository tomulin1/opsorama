import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the development server (`pnpm dev`) with software WebGL (SwiftShader).
 * On CI (`CI` is set by GitHub Actions) every route compiles on its first visit and the scenes render at a few frames per
 * second, so tests get 120 seconds, expectations and polls 15 seconds, and one retry. A test that passes only on the retry
 * is reported as flaky. Locally the Playwright defaults apply (30 seconds per test, 5 seconds per expectation, no retries).
 */
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: ci ? 120_000 : 30_000,
  expect: { timeout: ci ? 15_000 : 5_000 },
  retries: ci ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] } } }],
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:3100', reuseExistingServer: true, timeout: 120_000 },
});

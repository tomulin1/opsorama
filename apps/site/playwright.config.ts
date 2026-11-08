import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build of the website: `next start` on http://127.0.0.1:3101, serving the
 * build in `.next/`. `pnpm test:e2e` builds first; after changing the site, run `pnpm --filter @opsorama/site build` before
 * `playwright test <spec>`. Port 3101 is reserved for tests, so a development server on 3100 is never reused by mistake,
 * and Playwright fails with a clear message when 3101 is taken.
 *
 * Tests tagged `@measure` record measurements (WebGL resources, remount cycles) rather than check behavior. They are
 * excluded here and run with `pnpm test:e2e:measure` (playwright.measure.config.ts).
 *
 * WebGL is software-rendered (SwiftShader). On CI (`CI` is set by GitHub Actions) the scenes render at a few frames per
 * second, so tests get 120 seconds, expectations and polls 15 seconds, and one retry; a test that passes only on the
 * retry is reported as flaky. Locally the Playwright defaults apply (30 seconds per test, 5 seconds per expectation, no
 * retries).
 */
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  grepInvert: /@measure/,
  timeout: ci ? 120_000 : 30_000,
  expect: { timeout: ci ? 15_000 : 5_000 },
  retries: ci ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] } } }],
  webServer: { command: 'pnpm exec next start --hostname 127.0.0.1 --port 3101', url: 'http://127.0.0.1:3101', reuseExistingServer: false, timeout: 60_000 },
});

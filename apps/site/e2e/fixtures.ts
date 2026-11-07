import { test as base, expect } from '@playwright/test';

export { expect };
export type { Locator, Page } from '@playwright/test';

/**
 * Scales a per-test time budget in milliseconds for CI, where every route compiles on its first visit and WebGL is
 * software-rendered: 4× on CI (the same factor as the 120-second default in playwright.config.ts), unchanged locally.
 * Use it as `test.setTimeout(ciScaled(90_000))`.
 */
export const ciScaled = (milliseconds: number) => process.env.CI ? milliseconds * 4 : milliseconds;

/**
 * Playwright's `test` with one change: `page.goto()` resolves only after React has hydrated the new page, which the
 * site marks with `<html data-hydrated="true">` (`src/app/hydration-marker.tsx`). Next.js 16 hydrates after the
 * `load` event, so without this wait a test can fill or select a server-rendered control that React then resets.
 * Every spec imports `test` and `expect` from this file. Client-side navigations (`goBack`, link clicks) keep the
 * document and are not affected.
 */
export const test = base.extend({
  // The fixture callback is named `provide` rather than Playwright's usual `use`, which the React hooks lint rule mistakes for React.use.
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 30_000 });
      return response;
    };
    await provide(page);
  },
});

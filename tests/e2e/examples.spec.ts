import { expect, test } from '@playwright/test';

test('Examples navigation exposes the current recipes and toolkit demos', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/ecommerce');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('navigation', { name: 'Toolkit navigation' }).getByRole('link', { name: 'Examples', exact: true }).click();
  await expect(page).toHaveURL(/\/examples$/, { timeout: 15000 });
  await expect(page.getByRole('link', { name: 'Open e-commerce example', exact: true })).toHaveAttribute('href', '/examples/ecommerce');
  await expect(page.getByRole('link', { name: 'Open warehouse example', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open logistics objects', exact: true })).toHaveAttribute('href', '/examples/logistics');
  await expect(page.getByRole('link', { name: 'Open adapter examples', exact: true })).toHaveAttribute('href', '/examples/adapters');
  await page.screenshot({ path: 'artifacts/examples-catalog-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/examples-catalog-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

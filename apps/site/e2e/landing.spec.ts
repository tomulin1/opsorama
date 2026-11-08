import { expect, test } from './fixtures';

test('home shows the city and opens a district from its list', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  // The city (six examples in one scene) is built after hydration; with software WebGL that can take several seconds,
  // so the default 5-second expectation timeout is too short.
  await expect(page.locator('.landing-hero canvas')).toBeVisible({ timeout: 30_000 });
  // Header, city and footer fill exactly one screen.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.getByRole('navigation', { name: 'City districts' }).getByRole('button', { name: 'Farm' }).click();
  const card = page.locator('.landing-district');
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: 'Open the full example' })).toHaveAttribute('href', '/examples/farm');
  await card.getByRole('button', { name: 'Close district' }).click();
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('home intro panel rotates through the capabilities on request', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'About Opsorama' });
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  await expect(page.locator('#landing-capabilities')).toHaveCount(0);
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'A catalog of real objects' })).toBeVisible();
  await expect(carousel.getByRole('link', { name: 'Browse the catalog' })).toHaveAttribute('href', '/docs/objects');
  await carousel.getByRole('button', { name: 'Show slide 6: React, Vue and JavaScript' }).click();
  await expect(carousel.getByRole('link', { name: 'Compare the adapters' })).toHaveAttribute('href', '/examples/adapters');
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  await expect(page.locator('a[href="/examples/quantities"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

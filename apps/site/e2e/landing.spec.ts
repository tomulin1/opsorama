import { expect, test } from './fixtures';

test('home runs the shop scene behind the intro panel on one screen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  // The shop scene is built after hydration; with software WebGL that can take several seconds,
  // so the default 5-second expectation timeout is too short.
  await expect(page.locator('.landing-hero canvas')).toBeVisible({ timeout: 30_000 });
  // Header, scene and footer fill exactly one screen.
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  expect(errors).toEqual([]);
});

test('home intro panel moves through the toolkit uses on request', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'About Opsorama' });
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'Live operations boards' })).toBeVisible();
  await expect(carousel.getByRole('link', { name: 'Open the distribution centre' })).toHaveAttribute('href', '/examples/warehouse');
  await expect(page.locator('.landing-hero')).toHaveAttribute('style', /warehouse\.webp/);
  await carousel.getByRole('button', { name: 'Show slide 3: Facility overviews' }).click();
  // Each use brings its example's scene: the datacenter replaces the distribution centre behind the panel.
  await expect(page.locator('.landing-hero')).toHaveAttribute('style', /datacenter\.webp/);
  await expect(page.locator('.landing-hero canvas')).toHaveCount(1, { timeout: 30_000 });
  await carousel.getByRole('button', { name: 'Show slide 4: Management games' }).click();
  await expect(carousel.getByRole('link', { name: 'Play Cut-off' })).toHaveAttribute('href', '/examples/cutoff');
  await expect(page.locator('.landing-hero')).toHaveAttribute('style', /cutoff\.webp/);
  await carousel.getByRole('button', { name: 'Show slide 5: Built with AI coding agents' }).click();
  await expect(carousel.getByRole('link', { name: 'Read about validation' })).toHaveAttribute('href', '/docs/validation');
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  expect(errors).toEqual([]);
});

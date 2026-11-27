import { expect, test } from './fixtures';

test('home runs the shop scene behind the intro panel on one screen', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  // The shop scene is built after hydration; with software WebGL that can take several seconds,
  // so the default 5-second expectation timeout is too short.
  await expect(page.locator('.landing-hero canvas')).toBeVisible({ timeout: 30_000 });
  // The example's top panels sit over its scene and only show values, so a click never leaves the home page.
  const metrics = page.getByRole('region', { name: 'Operations metrics' });
  await expect(metrics).toBeVisible();
  await expect(metrics.locator('button, a')).toHaveCount(0);
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
  await expect(page.getByRole('region', { name: 'Facility metrics' })).toBeVisible();
  await carousel.getByRole('button', { name: 'Show slide 4: Management games' }).click();
  await expect(carousel.getByRole('link', { name: 'Play Cut-off' })).toHaveAttribute('href', '/examples/cutoff');
  await expect(page.locator('.landing-hero')).toHaveAttribute('style', /cutoff\.webp/);
  await carousel.getByRole('button', { name: 'Show slide 5: Built with AI coding agents' }).click();
  await expect(carousel.getByRole('link', { name: 'Read about validation' })).toHaveAttribute('href', '/docs/validation');
  // An agent builds the office behind the panel, and its log shows the prompt and the nodes it adds.
  const log = page.getByRole('region', { name: 'Coding agent log (illustration)' });
  await expect(log).toBeVisible({ timeout: 30_000 });
  await expect(log.getByText(/^\+ wall-segment/).first()).toBeVisible({ timeout: 30_000 });
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('home intro panel collapses to one line and moves by its grip', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'About Opsorama' });
  await carousel.getByRole('button', { name: 'Collapse panel' }).click();
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeHidden();
  const compact = carousel.locator('.landing-intro-compact-title');
  await expect(compact).toHaveText('1/5Introduction');
  // The collapsed panel keeps one sentence to read.
  await expect(carousel.getByText('Open-source 3D scenes for operations in web apps, built from your own data.')).toBeVisible();
  // The slide controls still work in the compact form.
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(compact).toHaveText('2/5Live operations boards');
  // Arrow keys on the grip move the panel and do not turn the slide.
  const before = await carousel.boundingBox();
  await carousel.getByRole('button', { name: 'Move panel' }).press('ArrowRight');
  await carousel.getByRole('button', { name: 'Move panel' }).press('ArrowUp');
  const after = await carousel.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  expect(after!.y).toBeLessThan(before!.y);
  await expect(compact).toHaveText('2/5Live operations boards');
  await carousel.getByRole('button', { name: 'Expand panel' }).click();
  await expect(carousel.getByRole('heading', { name: 'Live operations boards' })).toBeVisible();
  expect(errors).toEqual([]);
});

import { expect, test } from './fixtures';

test('home presents the toolkit uses in a carousel without a 3D scene', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const carousel = page.getByRole('region', { name: 'About Opsorama' });
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'Live operations boards' })).toBeVisible();
  await expect(carousel.getByRole('link', { name: 'Open the shop and warehouse' })).toHaveAttribute('href', '/examples/ecommerce');
  // A mosaic tile on the introduction opens its use case.
  await carousel.getByRole('button', { name: 'Show slide 1: Introduction' }).click();
  await carousel.locator('.landing-mosaic').getByRole('button', { name: 'Show slide 4: Management games' }).click();
  await expect(carousel.getByRole('link', { name: 'Play Cut-off' })).toHaveAttribute('href', '/examples/cutoff');
  await carousel.getByRole('button', { name: 'Show slide 7: Built with AI coding agents' }).click();
  await expect(carousel.getByText('npx opsorama check scene.json')).toBeVisible();
  await carousel.getByRole('button', { name: 'Next slide' }).click();
  await expect(carousel.getByRole('heading', { name: 'A clear view of your operations.' })).toBeVisible();
  // Below the carousel: every domain example and the building blocks.
  await expect(page.getByRole('region', { name: 'Places you can model' }).locator('.examples-card')).toHaveCount(8);
  await expect(page.getByRole('link', { name: /Browse the catalog/ })).toHaveAttribute('href', '/docs/objects');
  expect(errors).toEqual([]);
});

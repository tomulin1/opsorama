import { expect, test } from './fixtures';

test('tree collection has static previews and animation controls appear only for animated models', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects');
  await page.getByLabel('Search objects').fill('tree');
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(3);
  await expect(page.getByAltText('Palm tree model preview')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.object-motion-tag')).toHaveText(['Static model', 'Static model', 'Static model']);
  await page.screenshot({ path: 'artifacts/tree-collection.png' });
  for (const slug of ['tree', 'tree-pine', 'tree-palm', 'parcel']) {
    await page.goto(`/docs/objects/${slug}`);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByLabel('Object animation')).toHaveCount(0);
    await expect(page.getByText('Static model · no animation', { exact: true })).toBeVisible();
    if (slug !== 'tree' && slug !== 'parcel') {
      await page.getByLabel('Object color').fill('#447755');
      await expect(page.locator('.docs-code-block pre')).toContainText('#447755');
      await page.getByRole('button', { name: 'Move object', exact: true }).click();
    }
  }
  await page.goto('/docs/objects/conveyor');
  await expect(page.getByLabel('Object animation')).toBeVisible();
  await page.getByLabel('Object animation').uncheck();
  await page.goto('/docs/objects/tree-palm');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/palm-tree-detail-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('object catalog filters, previews and documents real definitions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs');
  await page.getByRole('navigation', { name: 'Toolkit navigation' }).getByRole('link', { name: 'Objects', exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/objects$/);
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(164);
  await expect(page.getByAltText('Parcel model preview')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'People', exact: true }).click();
  // The worker and the seven person characters.
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(8);
  await page.getByRole('link', { name: 'Explore Worker', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByLabel('Object variant').selectOption('carrying');
  await page.getByLabel('Object animation').uncheck();
  await page.getByLabel('Preview environment').selectOption('midnight');
  await page.getByRole('button', { name: 'Select object', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Object selected');
  await page.getByRole('button', { name: 'Move object', exact: true }).click();
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
  await expect(page.locator('.docs-code-block pre')).toContainText('"carrying"');
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount preview', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.getByLabel('Object variant')).toHaveValue('working');
  await page.getByRole('link', { name: 'All objects', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel('Search objects').fill('nonexistent-model');
  await expect(page.getByRole('heading', { name: 'No objects match these filters.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Search objects').fill('Forklift');
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(1);
  await page.getByRole('link', { name: 'Explore Forklift', exact: true }).click();
  await expect(page.getByRole('link', { name: 'See it in a scene', exact: true })).toHaveAttribute('href', '/examples/logistics');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('catalog detail links work directly and layouts fit a phone', async ({ page }) => {
  await page.goto('/docs/objects/lab-workstation');
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByLabel('Object variant').selectOption('empty');
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
  await expect(page.locator('.docs-code-block pre')).toContainText('lab-workstation');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/object-detail-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'All objects', exact: true }).click();
  await expect(page.getByAltText('Parcel model preview')).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/object-catalog-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('Object availability').selectOption('portable');
  await expect(page.getByAltText('Branch workstation model preview')).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'artifacts/object-catalog-desktop.png', fullPage: true });
});

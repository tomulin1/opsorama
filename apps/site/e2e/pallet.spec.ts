import { expect, test } from './fixtures';

test('pallet catalog entry exposes 0–27 fixed boxes, labels, selection, snippets and teardown', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects'); await page.getByLabel('Search objects').fill('Pallet with boxes');
  await expect(page.getByRole('link', { name: 'Explore Pallet with boxes', exact: true })).toBeVisible();
  await expect(page.getByAltText('Pallet with boxes model preview')).toBeVisible();
  await page.getByRole('link', { name: 'Explore Pallet with boxes', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1);
  const count = page.getByLabel('Object count', { exact: true });
  await expect(count).toHaveAttribute('min', '0'); await expect(count).toHaveAttribute('max', '27');
  await expect(page.getByLabel('Object animation')).toHaveCount(0);
  for (const value of [0, 1, 9, 10, 27]) {
    await count.fill(String(value)); await expect(page.getByRole('button', { name: `Select ${value} boxes`, exact: true })).toBeVisible();
    await page.getByTestId('object-preview').screenshot({ path: `artifacts/pallet-${value}.png` });
  }
  await page.getByLabel('Surface label type').selectOption('text'); await page.getByLabel('Surface label text', { exact: true }).fill('STOCK');
  await page.getByRole('button', { name: 'Select object', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Object selected');
  for (const adapter of ['React', 'Vue', 'JavaScript']) { await page.getByRole('button', { name: adapter, exact: true }).click(); await expect(page.locator('.docs-code-block pre')).toContainText('pallet'); await expect(page.locator('.docs-code-block pre')).toContainText('27'); }
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click(); await expect(count).toHaveValue('9');
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('reserved layout settings remain available after the Quantities guide is removed', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const asset of ['parcel-base']) {
    await page.goto(`/docs/objects/${asset}`); await expect(page.getByLabel('Object count layout')).toHaveValue('reserved');
    await expect(page.locator('.docs-code-block pre')).toContainText('countLayout="reserved"');
    await page.getByLabel('Object count layout').selectOption('compact'); await expect(page.locator('.docs-code-block pre')).toContainText('countLayout="compact"');
    await page.getByRole('button', { name: 'Reset settings', exact: true }).click(); await expect(page.getByLabel('Object count layout')).toHaveValue('reserved');
  }
  await page.goto('/docs/objects/desk-pod');
  await expect(page.getByLabel('Object count layout')).toHaveCount(0);
  await page.getByLabel('Object count variant').selectOption('1');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.docs-code-block pre')).not.toContainText('countLayout');
  await page.goto('/docs/objects/meeting-table');
  await expect(page.getByLabel('Object count layout')).toHaveCount(0);
  await page.getByLabel('Object count', { exact: true }).fill('2');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.docs-code-block pre')).not.toContainText('countLayout');
  expect(errors).toEqual([]);
});

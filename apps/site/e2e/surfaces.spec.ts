import { expect, test } from '@playwright/test';

test('surface previews expose footprint and finish controls with snippets that keep the finish tone', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/floor'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Object animation')).toHaveCount(0); await expect(page.getByLabel('Object count', { exact: true })).toHaveCount(0);
  await page.getByLabel('Object variant').selectOption('wood');
  await expect(page.getByLabel('Object color')).toHaveValue('#c8a27c');
  await page.getByLabel('Surface width').fill('14');
  await page.getByLabel('Surface depth').fill('0.5'); await expect(page.getByRole('alert').filter({ hasText: 'last valid footprint' })).toBeVisible();
  await page.getByLabel('Surface depth').fill('4');
  for (const framework of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: framework, exact: true }).click();
    const code = page.locator('.docs-code-block pre');
    await expect(code).toContainText('wood'); await expect(code).toContainText('14'); await expect(code).not.toContainText('#c8a27c');
  }
  await page.goto('/docs/objects/sidewalk');
  await page.getByLabel('Object variant').selectOption('corner'); await expect(page.getByLabel('Surface width')).toHaveValue('2');
  await page.goto('/docs/objects/road');
  await expect(page.getByLabel('Surface width')).toHaveCount(0);
  await page.getByLabel('Object variant').selectOption('crossroads'); await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('street composition mounts, updates, selects and disposes through every native adapter', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/surfaces');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1); await expect(page.getByRole('region', { name: 'Surfaces kit' }).getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Terrace floor finish').selectOption('epoxy'); await page.getByLabel('Midnight palette', { exact: true }).check();
    await page.getByRole('button', { name: 'Parking · 5 bays', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Parking · 5 bays');
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.getByRole('button', { name: 'Crosswalk', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Crosswalk');
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByLabel('Terrace floor finish').selectOption('tiles'); await page.getByLabel('Midnight palette', { exact: true }).uncheck();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'artifacts/surfaces-example.png', fullPage: true });
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open surfaces example', exact: true })).toHaveAttribute('href', '/examples/surfaces');
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';

test('the example catalog has no warehouse example after its retirement', async ({ page }) => {
  await page.goto('/examples');
  await expect(page.getByRole('link', { name: 'Open warehouse example', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open logistics objects', exact: true })).toBeVisible();
});

test('neutral logistics models expose color and variants without state controls or state props in snippets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const snippet = page.locator('.object-usage .docs-code-block pre');
  for (const slug of ['forklift', 'loading-dock', 'shipping-container']) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByLabel('Object animation')).toHaveCount(0); await expect(page.getByLabel('Object count', { exact: true })).toHaveCount(0);
    await page.getByLabel('Object color').fill('#765432');
    await expect(page.getByLabel('Object state', { exact: true })).toHaveCount(0);
    // The operated forklift seats a driver; the variant is part of the exported snippet.
    const variant = slug === 'loading-dock' ? 'open' : slug === 'forklift' ? 'operated' : undefined;
    if (variant) await page.getByLabel('Object variant').selectOption(variant);
    for (const framework of ['React', 'Vue', 'JavaScript']) {
      await page.getByRole('button', { name: framework, exact: true }).click();
      await expect(snippet).toContainText(slug); await expect(snippet).toContainText('#765432');
      await expect(snippet).not.toContainText(/(?:^|\n)\s*:?['"]?state['"]?\s*[:=]/);
      if (variant) await expect(snippet).toContainText(variant);
    }
    await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('logistics composition mounts, updates, selects and disposes through every native adapter', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/logistics');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1); await expect(page.getByRole('region', { name: 'Logistics kit' }).getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Open dock', { exact: true }).check(); await page.getByLabel('Midnight palette', { exact: true }).check();
    await page.getByRole('button', { name: 'Forklift', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Forklift');
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.getByRole('button', { name: 'Loading dock', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Loading dock');
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByLabel('Open dock', { exact: true }).uncheck(); await page.getByLabel('Midnight palette', { exact: true }).uncheck();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'artifacts/logistics-objects.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Toolkit navigation' }).getByRole('link', { name: 'Examples', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

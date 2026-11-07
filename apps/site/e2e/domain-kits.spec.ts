import { expect, test } from './fixtures';

const NEW_OBJECTS = ['valve', 'tower-crane', 'gantry-crane', 'aircraft', 'baggage-cart', 'hospital-bed', 'service-cart', 'kitchen-station', 'tractor', 'grain-silo', 'event-stage', 'exhibition-booth'];

test('new domain kit models have live previews and usage snippets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of NEW_OBJECTS) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas'), slug).toHaveCount(1);
    // All twelve are static; only the baggage cart is countable.
    await expect(page.getByLabel('Object animation'), slug).toHaveCount(0);
    await expect(page.getByLabel('Object count', { exact: true }), slug).toHaveCount(slug === 'baggage-cart' ? 1 : 0);
    await page.getByLabel('Object color').fill('#765432');
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText(slug); await expect(page.locator('.docs-code-block pre')).toContainText('#765432');
  }
  expect(errors).toEqual([]);
});

test('domain kit composition mounts, updates, selects and disposes through every native adapter', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/domain-kits');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1); await expect(page.getByRole('region', { name: 'Domain kits' }).getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Valve closed', { exact: true }).check(); await page.getByLabel('Midnight palette', { exact: true }).check();
    await page.getByRole('button', { name: 'Aircraft', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Aircraft');
    await page.getByRole('button', { name: 'Hospital bed', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Hospital bed');
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByLabel('Valve closed', { exact: true }).uncheck(); await page.getByLabel('Midnight palette', { exact: true }).uncheck();
  }
  await page.screenshot({ path: 'artifacts/domain-kits-objects.png', fullPage: true });
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open domain kit objects', exact: true })).toHaveAttribute('href', '/examples/domain-kits');
  expect(errors).toEqual([]);
});

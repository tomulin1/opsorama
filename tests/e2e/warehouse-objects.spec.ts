import { expect, test } from '@playwright/test';

const NEW_OBJECTS = ['pallet-rack', 'reach-truck', 'stretch-wrapper', 'carton-flow-rack', 'safety-barrier', 'pallet-stack', 'ibc-tank', 'drum-pallet', 'bulk-bag'];

test('new warehouse models have live previews and usage snippets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of NEW_OBJECTS) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas'), slug).toHaveCount(1);
    // Only the stretch wrapper animates; racks, stacks and drums are countable.
    await expect(page.getByLabel('Object animation'), slug).toHaveCount(slug === 'stretch-wrapper' ? 1 : 0);
    await expect(page.getByLabel('Object count', { exact: true }), slug).toHaveCount(['pallet-rack', 'carton-flow-rack', 'pallet-stack', 'drum-pallet'].includes(slug) ? 1 : 0);
    // The pallet stack keeps fixed wood tones, so it offers no color control.
    await expect(page.getByLabel('Object color'), slug).toHaveCount(slug === 'pallet-stack' ? 0 : 1);
    if (slug !== 'pallet-stack') await page.getByLabel('Object color').fill('#765432');
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText(slug);
    if (slug !== 'pallet-stack') await expect(page.locator('.docs-code-block pre')).toContainText('#765432');
    if (slug === 'reach-truck') { await page.getByLabel('Object variant').selectOption('operated'); await expect(page.locator('.docs-code-block pre')).toContainText('operated'); }
  }
  expect(errors).toEqual([]);
});

test('warehouse composition mounts, updates, selects and disposes through every native adapter', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/warehouse-objects');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1); await expect(page.getByRole('region', { name: 'Warehouse objects' }).getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Wrapper stopped', { exact: true }).check(); await page.getByLabel('Midnight palette', { exact: true }).check();
    await page.getByRole('button', { name: 'Reach truck', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Reach truck');
    await page.getByRole('button', { name: 'Stretch wrapper', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Stretch wrapper');
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByLabel('Wrapper stopped', { exact: true }).uncheck(); await page.getByLabel('Midnight palette', { exact: true }).uncheck();
  }
  await page.screenshot({ path: 'artifacts/warehouse-objects.png', fullPage: true });
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open warehouse objects', exact: true })).toHaveAttribute('href', '/examples/warehouse-objects');
  expect(errors).toEqual([]);
});

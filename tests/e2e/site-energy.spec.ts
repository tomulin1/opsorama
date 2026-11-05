import { expect, test } from '@playwright/test';

const NEW_OBJECTS = ['mobile-robot', 'robot-arm', 'machine-tool', 'security-camera', 'ev-charger', 'solar-array', 'wind-turbine', 'storage-tank', 'pump-unit', 'fence-segment', 'waste-bin', 'traffic-cone'];

test('new site, energy and automation models have live previews and usage snippets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of NEW_OBJECTS) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas'), slug).toHaveCount(1);
    // Only the wind turbine has built-in local animation; counts appear only for countable models.
    await expect(page.getByLabel('Object animation'), slug).toHaveCount(slug === 'wind-turbine' ? 1 : 0);
    await expect(page.getByLabel('Object count', { exact: true }), slug).toHaveCount(slug === 'solar-array' || slug === 'traffic-cone' ? 1 : 0);
    await page.getByLabel('Object color').fill('#765432');
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText(slug); await expect(page.locator('.docs-code-block pre')).toContainText('#765432');
  }
  expect(errors).toEqual([]);
});

test('site and energy composition mounts, updates, selects and disposes through every native adapter', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/site-energy');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1); await expect(page.getByRole('region', { name: 'Site and energy kit' }).getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Charger 1 fault', { exact: true }).check(); await page.getByLabel('Turbine stopped', { exact: true }).check(); await page.getByLabel('Midnight palette', { exact: true }).check();
    await page.getByRole('button', { name: 'Robot arm', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Robot arm');
    await page.getByRole('button', { name: 'EV charger 1', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: EV charger 1');
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByLabel('Charger 1 fault', { exact: true }).uncheck(); await page.getByLabel('Turbine stopped', { exact: true }).uncheck(); await page.getByLabel('Midnight palette', { exact: true }).uncheck();
  }
  await page.screenshot({ path: 'artifacts/site-energy-objects.png', fullPage: true });
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open site and energy objects', exact: true })).toHaveAttribute('href', '/examples/site-energy');
  expect(errors).toEqual([]);
});

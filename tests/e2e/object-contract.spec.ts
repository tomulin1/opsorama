import { expect, test, type Page } from '@playwright/test';

const readX = async (page: Page) => Number(await page.getByLabel('Rendered x').textContent());

test('the parcel contract holds in React, Vue and JavaScript', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/object-contract');
  const canvas = page.locator('.adapter-example-surface canvas'), selection = page.getByLabel('Selection', { exact: true });
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(canvas).toHaveCount(1);
    await expect.poll(() => readX(page), { timeout: 15_000 }).toBeCloseTo(-2.2, 1);

    // Selection survives palette switches, instance overrides, the legacy color and status styling.
    await page.getByRole('button', { name: 'Select parcel' }).click();
    await expect(selection).toHaveText('parcel-main');
    await page.getByLabel('Scene palette', { exact: true }).selectOption('meadow');
    await page.getByLabel('Instance trim and sticker', { exact: true }).check();
    await page.getByLabel('Legacy color', { exact: true }).check();
    await page.getByLabel('Variant', { exact: true }).selectOption('open');
    await expect(selection).toHaveText('parcel-main');

    // With motion on, a move interpolates; the rendered position passes through in-between values.
    await page.getByRole('button', { name: 'Move parcel' }).click();
    await expect.poll(() => readX(page), { timeout: 5_000 }).toBeGreaterThan(-1.8);
    const between = await readX(page);
    expect(between).toBeLessThan(2);
    await expect.poll(() => readX(page), { timeout: 15_000 }).toBeCloseTo(2.2, 1);

    // Motion off and pause show the confirmed position without travel.
    await page.getByLabel('Motion', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Move parcel' }).click();
    await expect.poll(() => readX(page), { timeout: 1_000, intervals: [100] }).toBeCloseTo(-2.2, 1);
    await page.getByLabel('Motion', { exact: true }).check();
    await page.getByLabel('Pause', { exact: true }).check();
    await page.getByRole('button', { name: 'Move parcel' }).click();
    await expect.poll(() => readX(page), { timeout: 1_000, intervals: [100] }).toBeCloseTo(2.2, 1);
    await page.getByLabel('Pause', { exact: true }).uncheck();

    // Twenty rebuilds through every configuration return the renderer to the same geometry count.
    await page.getByRole('button', { name: 'Cycle 20 updates' }).click();
    // Wait for this cycle to finish; it restores the settings before the next steps change them.
    await expect(page.getByRole('button', { name: 'Cycle 20 updates' })).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByLabel('Geometries before cycle')).not.toHaveText('—', { timeout: 20_000 });
    const before = await page.getByLabel('Geometries before cycle').textContent();
    await expect(page.getByLabel('Geometries', { exact: true })).toHaveText(before!, { timeout: 5_000 });
    await expect(selection).toHaveText('parcel-main');

    // Reset for the next adapter.
    await page.getByLabel('Scene palette', { exact: true }).selectOption('harbor');
    await page.getByLabel('Instance trim and sticker', { exact: true }).uncheck();
    await page.getByLabel('Legacy color', { exact: true }).uncheck();
    await page.getByLabel('Variant', { exact: true }).selectOption('closed');
    await page.getByRole('button', { name: 'Move parcel' }).click();
    await page.screenshot({ path: `artifacts/object-contract-${adapter.toLowerCase()}.png` });
  }
  await page.getByRole('button', { name: 'Remount 5 times' }).click();
  await expect(page.getByRole('button', { name: 'Remount 5 times' })).toBeEnabled({ timeout: 15_000 });
  await expect(canvas).toHaveCount(1);
  await expect(page.locator('.kit-scene-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the catalog renders the parcel descriptor', async ({ page }) => {
  await page.goto('/docs/objects/parcel');
  const contract = page.getByRole('region', { name: 'Object contract' });
  await expect(contract).toBeVisible();
  for (const row of ['Geometry', 'Palette roles', 'Legacy color', 'Customization', 'States', 'Motion', 'Interaction', 'Lifecycle', 'Evidence']) await expect(contract.getByRole('rowheader', { name: row })).toBeVisible();
  await expect(contract).toContainText('checkAssetDescriptor');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the catalog renders the foundation descriptors and keeps primitives on their own contract', async ({ page }) => {
  for (const [slug, text] of [['worker', 'stance pivot'], ['parcel-base', 'assetDescriptors.parcel-base'], ['shelf', 'slot-11'], ['station', 'assetDescriptors.station'], ['pavilion', 'stock-2'], ['bag', 'assetDescriptors.bag'], ['tree', 'wood'], ['tree-palm', 'assetDescriptors.tree-palm'], ['sign', 'surfaceLabel'], ['map-pin', 'inactive'], ['office-chair', 'seat-0']] as const) {
    await page.goto(`/docs/objects/${slug}`);
    const contract = page.getByRole('region', { name: 'Object contract' });
    await expect(contract).toBeVisible();
    await expect(contract.getByRole('rowheader', { name: 'Palette roles' })).toBeVisible();
    await expect(contract).toContainText(text);
  }
  await page.goto('/docs/objects/ground');
  await expect(page.getByRole('heading', { name: 'Ground surface', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Object contract' })).toHaveCount(0);
});

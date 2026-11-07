import { expect, test } from './fixtures';

const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"><rect width="240" height="60" fill="#497bec"/><text x="120" y="42" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#ffffff">NORTH</text></svg>';

test('all declared catalog surfaces show their artwork at a fixed preview height', async ({ page }) => {
  for (const asset of ['parcel', 'bag', 'tote', 'storefront', 'parcel-locker', 'returns-drop-box', 'delivery-van', 'truck', 'whiteboard']) {
    await page.goto(`/docs/objects/${asset}`); const canvas = page.getByTestId('object-preview').locator('canvas'); await expect(canvas).toHaveCount(1);
    const before = await canvas.screenshot();
    await page.getByLabel('Surface label type').selectOption('text'); await page.getByLabel('Surface label text', { exact: true }).fill('NORTH');
    await page.getByLabel('Surface label background').fill('#ffdd00');
    await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
    expect((await canvas.boundingBox())!.height).toBe(390);
    await canvas.screenshot({ path: `artifacts/surface-label-${asset}.png` });
  }
});

test('catalog text and SVG labels update previews and snippets, preserve quantities and reset', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/storefront'); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByLabel('Surface label type').selectOption('text'); await page.getByLabel('Surface label text', { exact: true }).fill('NORTH & CO');
  await expect(page.locator('.docs-code-block pre')).toContainText('NORTH & CO');
  await page.getByRole('button', { name: 'Select object', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Object selected');
  await page.getByLabel('Surface label type').selectOption('svg');
  await page.getByLabel('Upload surface label SVG').setInputFiles({ name: 'north.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(logo) });
  await expect(page.getByLabel('Surface label SVG', { exact: true })).toHaveValue(logo);
  await page.getByRole('button', { name: 'Vue', exact: true }).click(); await expect(page.locator('.docs-code-block pre')).toContainText(':surfaceLabel="surfaceLabel"');
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/storefront-svg-label.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/storefront-svg-label-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click(); await expect(page.getByLabel('Surface label type')).toHaveValue('none');
  await expect(page.locator('.docs-code-block pre')).not.toContainText('surfaceLabel');
  await page.goto('/docs/objects/parcel-base'); await page.getByLabel('Surface label type').selectOption('text');
  await page.getByLabel('Object count', { exact: true }).fill('27'); await expect(page.getByRole('button', { name: 'Select 27 parcels', exact: true })).toBeVisible();
  await expect(page.locator('.docs-code-block pre')).toContainText('surfaceLabel=');
  await page.goto('/docs/objects/tree-pine'); await expect(page.getByLabel('Surface label type')).toHaveCount(0); expect(errors).toEqual([]);
});

test('SVG validation rejects active or external content before decoding and recovers', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => { if (request.url().includes('external.example')) requests.push(request.url()); });
  await page.goto('/docs/objects/storefront'); await page.getByLabel('Surface label type').selectOption('svg');
  const wrap = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${content}</svg>`;
  for (const svg of [wrap('<script>alert(1)</script>'), wrap('<image href="https://external.example/logo.svg"/>'), wrap('<rect onclick="alert(1)"/>'), wrap('<foreignObject/>'), wrap('<animate/>'), wrap('<rect style="fill:red"/>'), wrap('<rect fill="url(https://external.example/paint)"/>'), '<svg>broken', '<!DOCTYPE svg [<!ENTITY x "test">]>' + wrap('<text>&x;</text>'), wrap('<rect/>').replace('viewBox="0 0 10 10"', '')]) {
    await page.getByLabel('Surface label SVG', { exact: true }).fill(svg); await expect(page.getByRole('group', { name: 'Surface label', exact: true }).getByRole('alert')).toContainText('last valid label');
    await expect(page.locator('.docs-code-block pre')).not.toContainText('external.example');
  }
  await page.getByLabel('Surface label SVG', { exact: true }).fill(logo); await expect(page.getByRole('group', { name: 'Surface label', exact: true }).getByRole('alert')).toHaveCount(0); expect(requests).toEqual([]);
});

test('labels render and release bounded textures through native React, Vue and JavaScript props', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/components/asset'); const preview = page.getByRole('region', { name: 'Surface label preview' });
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await preview.getByRole('button', { name: adapter, exact: true }).click(); await expect(preview.locator('canvas')).toHaveCount(1);
    await preview.getByLabel('Surface label type').selectOption('none'); await expect(preview.getByTestId('label-diagnostics')).toContainText('0 textures');
    await preview.getByLabel('Surface label type').selectOption('text'); await preview.getByLabel('Surface label text', { exact: true }).fill('North');
    await expect(preview.getByTestId('label-diagnostics')).toContainText('1 textures');
    const textImage = await preview.locator('canvas').screenshot();
    await preview.getByLabel('Surface label type').selectOption('svg'); await preview.getByLabel('Surface label SVG', { exact: true }).fill(logo);
    await expect.poll(async () => (await preview.locator('canvas').screenshot()).equals(textImage)).toBe(false);
    for (const value of ['#cc3344', '#44bb99', '#fffaf2']) { await preview.getByLabel('Surface label background').fill(value); await expect(preview.getByTestId('label-diagnostics')).toContainText('1 textures'); }
    await expect(preview.getByRole('button', { name: 'Select North branch', exact: true })).toBeVisible();
    await preview.getByRole('button', { name: 'Unmount label preview', exact: true }).click(); await expect(preview.locator('canvas')).toHaveCount(0); await expect(preview.locator('.kit-node-label')).toHaveCount(0);
    await preview.getByRole('button', { name: 'Mount label preview', exact: true }).click(); await expect(preview.locator('canvas')).toHaveCount(1); await expect(preview.getByTestId('label-diagnostics')).toContainText('1 textures');
    await preview.getByLabel('Surface label type').selectOption('none'); await expect(preview.getByTestId('label-diagnostics')).toContainText('0 textures');
  }
  expect(errors).toEqual([]);
});

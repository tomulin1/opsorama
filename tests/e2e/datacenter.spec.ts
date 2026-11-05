import { expect, test, type Page } from '@playwright/test';

// Read immediately after a rendered frame; blank WebGL canvases have only one color.
async function canvasPixels(page: Page) {
  return page.locator('canvas').evaluate(canvas => new Promise<number>(resolve => requestAnimationFrame(() => {
    const copy = document.createElement('canvas'); copy.width = 160; copy.height = 100;
    const context = copy.getContext('2d')!; context.drawImage(canvas as HTMLCanvasElement, 0, 0, 160, 100);
    const pixels = context.getImageData(0, 0, 160, 100).data, colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    resolve(colors.size);
  })));
}

async function fanFrameChanges(page: Page) {
  return page.locator('canvas').evaluate(async canvas => {
    const copy = document.createElement('canvas'); copy.width = 320; copy.height = 200;
    const context = copy.getContext('2d')!, frames = new Set<string>();
    for (let frame = 0; frame < 12; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      context.drawImage(canvas as HTMLCanvasElement, 0, 0, 320, 200); frames.add(copy.toDataURL());
    }
    return frames.size;
  });
}

test('cooling remains visible and static under scene motion-off and reduced motion', async ({ page }) => {
  await page.goto('/docs/objects/cooling-unit'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
  await expect.poll(() => fanFrameChanges(page)).toBeGreaterThan(1);
  await page.getByLabel('Object animation').uncheck();
  await expect.poll(() => fanFrameChanges(page)).toBe(1);
  await page.getByLabel('Object animation').check();
  await expect.poll(() => fanFrameChanges(page)).toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => fanFrameChanges(page)).toBe(1);
  await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
});

test('datacenter catalog exposes variants, bounded counts and declared animation controls', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects');
  await page.getByRole('button', { name: 'Datacenter / IT', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(9);
  await expect(page.getByAltText('Cooling unit model preview')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/datacenter-catalog.png', fullPage: true });
  for (const asset of ['rack-server', 'network-switch', 'cooling-unit', 'ups-unit']) {
    await page.goto(`/docs/objects/${asset}`); await expect(page.locator('canvas')).toHaveCount(1);
    await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
    await expect(page.getByLabel('Object animation')).toHaveCount(asset === 'cooling-unit' || asset === 'rack-server' ? 1 : 0);
    if (asset === 'rack-server') await page.getByLabel('Object variant').selectOption('1u');
    if (asset === 'network-switch' || asset === 'ups-unit') {
      await page.getByLabel('Object count', { exact: true }).fill('0');
      await page.getByLabel('Object count', { exact: true }).fill(asset === 'network-switch' ? '24' : '6');
    }
    await page.getByLabel('Object color').fill('#468d83');
    await expect(page.locator('.docs-code-block pre')).toContainText('#468d83');
    await page.getByRole('button', { name: 'Select object', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Object selected');
    await page.screenshot({ path: `artifacts/datacenter-${asset}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
  await page.screenshot({ path: 'artifacts/datacenter-ups-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

for (const asset of ['rack-server', 'equipment-cabinet']) test(`${asset} activity LEDs blink and obey local and reduced motion`, async ({ page }) => {
  await page.goto(`/docs/objects/${asset}`);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(() => fanFrameChanges(page)).toBeGreaterThan(1);
  await page.getByLabel('Object animation').uncheck();
  await expect.poll(() => fanFrameChanges(page)).toBe(1);
  await page.getByLabel('Object animation').check();
  await expect.poll(() => fanFrameChanges(page)).toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => fanFrameChanges(page)).toBe(1);
});

test('facility assets expose static isolated catalog previews and typed containment variants', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const asset of ['generator-set', 'air-cooled-chiller', 'electrical-switchgear', 'battery-bank', 'aisle-containment']) {
    await page.goto(`/docs/objects/${asset}`);
    await expect(page.locator('canvas')).toHaveCount(1); await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
    await expect(page.getByLabel('Object animation')).toHaveCount(0); await expect(page.getByLabel('Object count', { exact: true })).toHaveCount(0);
    await page.getByLabel('Object color').fill('#537d86'); await expect(page.locator('.docs-code-block pre')).toContainText('#537d86');
    if (asset === 'aisle-containment') { await page.getByLabel('Object variant').selectOption('roof'); await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30); }
    await page.getByRole('button', { name: 'Select object', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Object selected');
    await page.screenshot({ path: `artifacts/facility-${asset}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('datacenter domain example updates, selects, recovers and resizes its React scene', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/datacenter');
  // One React scene; domain examples show no adapter switcher.
  for (const adapter of ['React', 'Vue', 'JavaScript']) await expect(page.getByRole('button', { name: adapter, exact: true })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1); await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
  await expect(page.getByLabel('Focus room')).toHaveValue('overview');
  for (const id of ['thermal', 'network', 'power']) await expect(page.locator(`[data-node-id="alert-${id}"]`)).toBeVisible();
  await page.getByLabel('Focus room').selectOption('hall-02');
  await page.getByRole('button', { name: 'Racks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Rack readings' })).toContainText('32 fixture records');
  // Focus moves the camera; every room stays open.
  await expect(page.locator('[data-node-id="rack-h2-1"]')).toHaveCount(1);
  await expect(page.locator('[data-node-id="rack-a02"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next racks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Rack readings' })).toContainText('9–16 of 32');
  await page.getByLabel('Focus room').selectOption('noc');
  await expect(page.locator('[data-node-id="rack-h2-1"]')).toHaveCount(1);
  // Picking in the scene selects without changing the focused room.
  await page.getByRole('button', { name: 'Select Hall 03 · 32 racks', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Selected:' })).toHaveText('Selected: Hall 03 · 32 racks');
  await expect(page.getByLabel('Focus room')).toHaveValue('noc');
  await page.getByLabel('Focus room').selectOption('plant-yard');
  await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await page.getByLabel('Connected ports').fill('24'); await page.getByLabel('Battery modules').fill('6');
  await page.getByLabel('Equipment motion').uncheck();
  await page.getByRole('button', { name: 'Switch A', exact: true }).click();
  await expect(page.getByLabel('Focus room')).toHaveValue('hall-01');
  await expect(page.getByRole('status').filter({ hasText: 'Selected:' })).toHaveText('Selected: Switch A');
  await expect(page.getByRole('button', { name: 'Select Switch A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByRole('region', { name: 'Incident queue' }).getByRole('button', { name: /High inlet temperature/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Selected:' })).toHaveText('Selected: Rack A02');
  await expect(page.getByRole('region', { name: 'Equipment inspector' })).toContainText('34.8 °C');
  await expect(page.locator('[data-node-id="alert-thermal"]')).toBeVisible();
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByRole('button', { name: 'Recovered snapshot', exact: true }).click();
  await expect(page.locator('[data-node-id^="alert-"]')).toHaveCount(0);
  await expect(page.getByText('All three alerts cleared', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Equipment inspector' })).toContainText('24.2 °C');
  await expect(page.locator('[data-node-id^="alert-"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByRole('button', { name: 'Incident snapshot', exact: true }).click();
  await expect(page.locator('[data-node-id^="alert-"]')).toHaveCount(3);
  // A scene marker pinned to the rack's top anchor; its card lists severity, title and reading.
  const marker = page.getByRole('button', { name: 'Select Critical · High inlet temperature · 34.8 °C · policy > 30 °C', exact: true });
  const tooltip = marker.locator('.kit-marker-card');
  await expect(tooltip).toBeHidden(); expect((await marker.boundingBox())!.width).toBe(32);
  await marker.hover(); await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('.kit-marker-eyebrow')).toHaveText('Critical'); await expect(tooltip.locator('.kit-marker-title')).toHaveText('High inlet temperature');
  await expect(tooltip.locator('.kit-marker-detail')).toHaveText('34.8 °C · policy > 30 °C'); expect((await marker.boundingBox())!.width).toBe(32);
  await page.locator('.dc-viewport').screenshot({ path: 'artifacts/datacenter-alert-hover.png' });
  await page.getByRole('button', { name: 'Reset view', exact: true }).hover(); await expect(tooltip).toBeHidden();
  await page.keyboard.press('Tab'); await marker.focus(); await expect(tooltip).toBeVisible();
  await marker.click(); await expect(page.getByRole('status').filter({ hasText: 'Selected:' })).toHaveText('Selected: Rack A02');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click(); await page.getByLabel('Equipment motion').check();
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.screenshot({ path: 'artifacts/datacenter-scene-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => canvasPixels(page)).toBeGreaterThan(30);
  await page.screenshot({ path: 'artifacts/datacenter-scene-mobile.png', fullPage: true });
  await page.getByRole('region', { name: 'Incident queue' }).getByRole('button', { name: /PSU redundancy lost/ }).click();
  await expect(page.getByRole('region', { name: 'Equipment inspector' })).toContainText('device fault, not a UPS outage');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect.poll(() => fanFrameChanges(page)).toBe(1);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click(); expect(errors).toEqual([]);
});
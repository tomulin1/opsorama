import { ciScaled, expect, test, type Page } from './fixtures';

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.dc-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

test('datacenter uses shared panels inside a full-size interactive viewport on desktop and mobile', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/datacenter');
  const viewport = page.locator('.dc-viewport');
  await expect(page.locator('canvas')).toHaveCount(1);
  const originalCanvas = await page.locator('canvas').elementHandle();
  await expect(viewport.locator('.hud-summary .dp-panel')).toHaveCount(4);
  const initial = (await viewport.boundingBox())!;
  expect(initial.width).toBe(page.viewportSize()!.width); expect(initial.height).toBeGreaterThan(page.viewportSize()!.height - 70);
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/datacenter-hud-desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Racks', exact: true }).click();
  const racks = page.getByRole('region', { name: 'Rack readings', exact: true });
  await expect(racks).toContainText('128 fixture records'); await expectPanelsInsideViewport(page);
  await racks.getByRole('button', { name: 'Rack A02', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Equipment inspector', exact: true });
  await expect(inspector).toContainText('Selected: Rack A02'); await expect(inspector).toContainText('34.8 °C');
  await page.getByRole('region', { name: 'Facility navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(inspector).toContainText('Selected: Rack A02');
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/datacenter-hud-inspector.png', fullPage: true });

  await page.getByRole('button', { name: 'Info', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Facility information', exact: true })).toContainText('3,264 m²');
  await expectPanelsInsideViewport(page);
  await page.getByRole('button', { name: 'Expand viewport', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-expanded', 'true');
  expect((await viewport.boundingBox())!.height).toBe(page.viewportSize()!.height);
  await expectPanelsInsideViewport(page);
  // Escape works without focus inside the viewport, as after a click on the canvas.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape'); await expect(viewport).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  // Hidden information leaves the viewport toolbar panel and the standalone zoom control.
  await expect(viewport.locator('.dp-panel')).toHaveCount(1); await expect(viewport.locator('.zc-control')).toHaveCount(1); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toBeVisible();
  expect(await originalCanvas!.evaluate(canvas => canvas.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Show information panels', exact: true }).click();
  await expect(inspector).toContainText('Selected: Rack A02');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileViewport = (await viewport.boundingBox())!;
  expect(mobileViewport.y + mobileViewport.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Info', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('region', { name: 'Incident queue' })).toBeVisible(); await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/datacenter-hud-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Racks', exact: true }).click(); await expect(racks).toBeVisible(); await expectPanelsInsideViewport(page);
  await page.getByRole('button', { name: 'Controls', exact: true }).click();
  await expect(page.getByLabel('Connected ports')).toBeVisible(); await expectPanelsInsideViewport(page);
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('extra panels start closed and metric cards open their details', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  await page.goto('/examples/datacenter');
  const viewport = page.locator('.dc-viewport');
  await expect(viewport.locator('.hud-summary .dp-panel')).toHaveCount(4);
  await expect(viewport.locator('.hud-side-panel, .hud-floating-panel')).toHaveCount(0);
  const alerts = page.getByRole('button', { name: 'Open alert queue', exact: true });
  await alerts.click(); await expect(alerts).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Incident queue', exact: true })).toBeVisible();
  await alerts.click(); await expect(page.getByRole('region', { name: 'Incident queue', exact: true })).toHaveCount(0);
  const racks = page.getByRole('region', { name: 'Rack readings', exact: true });
  await page.getByRole('button', { name: 'Open rack overview for CPU', exact: true }).click(); await expect(racks).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open rack overview for power', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Open rack overview for power', exact: true }).click(); await expect(racks).toHaveCount(0);
  await page.getByRole('button', { name: 'Inspect the rack with the peak inlet', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Equipment inspector', exact: true })).toContainText('Selected: Rack A02');
});

test('scene FPS is measured with panels hidden and motion off', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/datacenter');
  const fps = page.getByLabel('Scene FPS', { exact: true });
  const expectFrames = async () => {
    await expect(fps).toHaveText(/^\d+$/, { timeout: 15000 });
    await expect.poll(async () => Number(await fps.textContent())).toBeGreaterThan(0);
  };
  await expectFrames();
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toContainText('FPS');
  await expectFrames();
  await page.getByLabel('Equipment motion').uncheck(); await expectFrames();
  expect(errors).toEqual([]);
});

test('datacenter zoom changes camera magnification and keeps working across room focus', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  await page.goto('/examples/datacenter');
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
  const labelDistance = (ids = ['hall-01', 'hall-02']) => page.locator('.datacenter-canvas').evaluate((surface, ids) => {
    const point = (id: string) => { const rect = surface.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!.getBoundingClientRect(); return [rect.x + rect.width / 2, rect.y + rect.height / 2]; };
    const a = point(ids[0]), b = point(ids[1]);
    // Horizontal spacing tracks projection independently of vertical label collision offsets.
    return Math.abs(a[0] - b[0]);
  }, ids);
  // The scene builds in slices, so on a slow renderer one hall label can appear well before the other.
  await expect(page.locator('[data-node-id="hall-01"]')).toBeVisible();
  await expect(page.locator('[data-node-id="hall-02"]')).toHaveCount(1);
  await expect.poll(() => labelDistance()).toBeGreaterThan(10);
  const baseline = await labelDistance();
  await zoomIn.click();
  await expect.poll(async () => (await labelDistance()) / baseline).toBeCloseTo(1.25 / 1.05, 2);
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expect.poll(() => labelDistance()).toBeCloseTo(baseline, 0);

  // The wheel zooms the same setting, so the bar steps and resets from the wheel's value.
  const canvas = (await page.locator('.datacenter-canvas canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2); await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await labelDistance()) / baseline).toBeCloseTo(1.1, 2);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => labelDistance()).toBeCloseTo(baseline, 0);
  await page.mouse.wheel(0, 3000); await expect(zoomOut).toBeDisabled();
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click(); await expect(zoomOut).toBeEnabled();

  // A room focus resets the host zoom, which then keeps working.
  await page.getByLabel('Focus room').selectOption('hall-02'); await zoomIn.click();
  await expect(page.locator('[data-node-id="rack-h2-1"]')).toHaveCount(1);
  await page.getByLabel('Focus room').selectOption('overview');
  for (let step = 0; step < 30 && await zoomIn.isEnabled(); step++) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  for (let step = 0; step < 30 && await zoomOut.isEnabled(); step++) await zoomOut.click();
  await expect(zoomOut).toBeDisabled();
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expectPanelsInsideViewport(page);
});

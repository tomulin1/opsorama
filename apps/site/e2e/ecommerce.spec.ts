import { expect, test, type Page } from './fixtures';

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.ec-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    // Panels nested in another panel (the activity feed, inspector trackers) scroll with it and are clipped by it.
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => !panel.parentElement?.closest('.dp-panel')).filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

test('e-commerce fills the viewport with a floating HUD and inspects orders, areas, stock and docks', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/ecommerce', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('.ec-viewport');
  // Toolbar buttons share names with the side-panel tabs, so scope them to the toolbar.
  const toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  await expect(page.locator('canvas')).toHaveCount(1);
  const originalCanvas = await page.locator('canvas').elementHandle();
  // One React scene; domain examples show no adapter switcher.
  for (const adapter of ['React', 'Vue', 'Plain JavaScript']) await expect(page.getByRole('button', { name: adapter, exact: true })).toHaveCount(0);
  // The mock feed starts at once; pausing holds the scenario's counts for the checks below.
  await toolbar.getByRole('button', { name: 'Pause simulation', exact: true }).click();
  await expect(viewport.locator('.hud-summary .dp-panel')).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Cut-off risk', exact: true })).toContainText('4');
  const initial = (await viewport.boundingBox())!;
  expect(initial.width).toBe(page.viewportSize()!.width); expect(initial.height).toBeGreaterThan(page.viewportSize()!.height - 70);
  await expectPanelsInsideViewport(page);

  // Extra panels start closed; a metric card or a toolbar button opens them.
  await expect(viewport.locator('.hud-side-panel, .hud-floating-panel')).toHaveCount(0);
  // An order opens its progress, lines and short pick.
  await page.getByRole('button', { name: 'Open order list', exact: true }).click();
  const orders = page.getByRole('region', { name: 'Open orders', exact: true });
  await expect(orders.locator('tbody tr')).toHaveCount(33);
  await orders.getByRole('button', { name: 'Inspect order #50419', exact: true }).click();
  const order = page.getByRole('complementary', { name: 'Order inspector' });
  await expect(order).toContainText('Order #50419'); await expect(order).toContainText('Short pick'); await expect(order).toContainText('0 / 2');

  // An area filters the orders; choosing it again clears the filter.
  await toolbar.getByRole('button', { name: 'Areas', exact: true }).click();
  await page.getByRole('region', { name: 'Process areas', exact: true }).getByRole('button', { name: /Forward picking/ }).click();
  await expect(page.getByRole('complementary', { name: 'Area inspector' })).toContainText('Forward picking');
  await expect(orders.locator('tbody tr')).toHaveCount(7);
  await orders.getByRole('button', { name: 'Clear area filter', exact: true }).click(); await expect(orders.locator('tbody tr')).toHaveCount(33);

  // Stock alerts lead to the empty flow-rack lane; docks show the late inbound truck.
  await toolbar.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect location F3', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Location inspector' })).toContainText('OUT-215');
  await toolbar.getByRole('button', { name: 'Docks', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect dock D2', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Dock inspector' })).toContainText('Late');
  await page.getByRole('button', { name: 'Inspect carrier SwiftPost', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Carrier inspector' })).toContainText('at risk');
  // A click on a floating panel does not pick the scene object behind it.
  await page.getByRole('region', { name: 'Shop and warehouse navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('complementary', { name: 'Carrier inspector' })).toBeVisible();
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/ecommerce-hud-desktop.png' });

  await page.getByRole('button', { name: 'Expand viewport', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-expanded', 'true');
  expect((await viewport.boundingBox())!.height).toBe(page.viewportSize()!.height);
  // Escape works without focus inside the viewport, as after a click on the canvas.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape'); await expect(viewport).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  await expect(viewport.locator('.dp-panel')).toHaveCount(1); await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toBeVisible();
  expect(await originalCanvas!.evaluate(canvas => canvas.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Show information panels', exact: true }).click();

  await page.getByLabel('Starting scenario').selectOption('night');
  await expect(page.getByRole('region', { name: 'Operations metrics' })).toContainText('Shop closed');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await viewport.boundingBox())!;
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const panel of ['Orders', 'Stock', 'Docks', 'Info', 'Areas']) { await toolbar.getByRole('button', { name: panel, exact: true }).click(); await expectPanelsInsideViewport(page); }
  await page.screenshot({ path: 'artifacts/ecommerce-hud-mobile.png' });
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open e-commerce example', exact: true })).toHaveAttribute('href', '/examples/ecommerce');
  expect(errors).toEqual([]);
});

import { ciScaled, expect, test, type Page } from './fixtures';

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.wh-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

test('distribution centre fills the viewport with a floating HUD and inspects docks, aisles, vehicles and the chilled chamber', async ({ page }) => {
  test.setTimeout(ciScaled(150000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/warehouse', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('.wh-viewport');
  // Toolbar buttons share names with the side-panel tabs, so scope them to the toolbar.
  const toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  await expect(page.locator('canvas')).toHaveCount(1);
  const originalCanvas = await page.locator('canvas').elementHandle();
  // One React scene; domain examples show no adapter switcher.
  await expect(page.getByRole('button', { name: 'Vue', exact: true })).toHaveCount(0);
  await expect(viewport.locator('.hud-summary .dp-panel')).toHaveCount(4);
  const initial = (await viewport.boundingBox())!;
  expect(initial.width).toBe(page.viewportSize()!.width); expect(initial.height).toBeGreaterThan(page.viewportSize()!.height - 70);
  await expectPanelsInsideViewport(page);

  // Extra panels start closed; a metric card or a toolbar button opens them.
  await expect(viewport.locator('.hud-side-panel, .hud-floating-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open dock schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect door D11', exact: true }).click();
  const dock = page.getByRole('complementary', { name: 'Dock inspector' });
  await expect(dock).toContainText('L-5123'); await expect(dock).toContainText('Route 3 · Riverside');
  await toolbar.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByRole('navigation', { name: 'Alerts' }).getByRole('button', { name: /Chilled chamber at 6.4/ }).click();
  await expect(page.getByRole('complementary', { name: 'Chilled chamber inspector' })).toContainText('Open 12 min');
  await toolbar.getByRole('button', { name: 'Storage', exact: true }).click();
  await page.getByRole('button', { name: /^Inspect Aisle A04:/ }).click();
  await expect(page.getByRole('complementary', { name: 'Aisle inspector' })).toContainText('A04-06-L');
  await toolbar.getByRole('button', { name: 'Fleet', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect FL3', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Vehicle inspector' })).toContainText('Hydraulic leak');
  // A click on a floating panel does not pick the scene object behind it.
  await page.getByRole('region', { name: 'Distribution centre navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('complementary', { name: 'Vehicle inspector' })).toBeVisible();
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/warehouse-hud-desktop.png' });

  await page.getByRole('button', { name: 'Expand viewport', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-expanded', 'true');
  expect((await viewport.boundingBox())!.height).toBe(page.viewportSize()!.height);
  await page.keyboard.press('Escape'); await expect(viewport).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  await expect(viewport.locator('.dp-panel')).toHaveCount(1); await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toBeVisible();
  expect(await originalCanvas!.evaluate(canvas => canvas.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Show information panels', exact: true }).click();

  await page.getByLabel('Mock snapshot').selectOption('night');
  await expect(page.getByRole('region', { name: 'Distribution centre metrics' })).toContainText('0 waiting in the yard');
  await toolbar.getByRole('button', { name: 'Loads', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Loads' })).toContainText('Night trunk');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await viewport.boundingBox())!;
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const panel of ['Docks', 'Loads', 'Storage', 'Fleet', 'Info', 'Alerts']) { await toolbar.getByRole('button', { name: panel, exact: true }).click(); await expectPanelsInsideViewport(page); }
  await page.screenshot({ path: 'artifacts/warehouse-hud-mobile.png' });
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open distribution centre example', exact: true })).toHaveAttribute('href', '/examples/warehouse');
  expect(errors).toEqual([]);
});

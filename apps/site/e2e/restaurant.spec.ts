import { ciScaled, expect, test, type Page } from './fixtures';

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.rs-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

const NEW_OBJECTS = ['dining-table', 'booth-seating', 'bar-counter', 'bar-stool', 'espresso-machine', 'pizza-oven', 'walk-in-cooler', 'heated-pass', 'pickup-shelf', 'host-stand', 'menu-board', 'dish-machine', 'patio-umbrella', 'serving-plates'];

test('restaurant models have live previews and usage snippets', async ({ page }) => {
  test.setTimeout(ciScaled(120000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of NEW_OBJECTS) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas'), slug).toHaveCount(1);
    // Only the espresso steam and the oven fire animate; tables, booths, the pass, the pickup shelf and the serving plates are countable.
    await expect(page.getByLabel('Object animation'), slug).toHaveCount(['espresso-machine', 'pizza-oven'].includes(slug) ? 1 : 0);
    await expect(page.getByLabel('Object count', { exact: true }), slug).toHaveCount(['dining-table', 'booth-seating', 'heated-pass', 'pickup-shelf', 'serving-plates'].includes(slug) ? 1 : 0);
    // Serving plates keep fixed plate and food tones, so they have no color control.
    const colored = slug !== 'serving-plates';
    await expect(page.getByLabel('Object color'), slug).toHaveCount(colored ? 1 : 0);
    if (colored) await page.getByLabel('Object color').fill('#765432');
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText(slug);
    if (colored) await expect(page.locator('.docs-code-block pre')).toContainText('#765432');
  }
  expect(errors).toEqual([]);
});

test('restaurant fills the viewport with a floating HUD and inspects tables, stations and tickets', async ({ page }) => {
  test.setTimeout(ciScaled(120000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/restaurant', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('.rs-viewport');
  // Toolbar buttons share names with the side-panel tabs, so scope them to the toolbar.
  const toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  await expect(page.locator('canvas')).toHaveCount(1);
  const originalCanvas = await page.locator('canvas').elementHandle();
  // One React scene; domain examples show no adapter switcher.
  for (const adapter of ['React', 'Vue', 'Plain JavaScript']) await expect(page.getByRole('button', { name: adapter, exact: true })).toHaveCount(0);
  await expect(viewport.locator('.hud-summary .dp-panel')).toHaveCount(4);
  const initial = (await viewport.boundingBox())!;
  expect(initial.width).toBe(page.viewportSize()!.width); expect(initial.height).toBeGreaterThan(page.viewportSize()!.height - 70);
  await expectPanelsInsideViewport(page);

  // Extra panels start closed; a metric card or a toolbar button opens them.
  await expect(viewport.locator('.hud-side-panel, .hud-floating-panel')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open floor tables', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect Table 4: Bill requested', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Table inspector' })).toContainText('Bill requested');
  await toolbar.getByRole('button', { name: 'Tickets', exact: true }).click();
  const tickets = page.getByRole('region', { name: 'Kitchen tickets', exact: true });
  await expect(tickets.locator('tbody tr')).toHaveCount(12);
  await tickets.getByRole('button', { name: 'Inspect Table 3 for ticket #2041', exact: true }).click();
  const table = page.getByRole('complementary', { name: 'Table inspector' });
  await expect(table).toContainText('Table 3'); await expect(table).toContainText('Food delayed'); await expect(table).toContainText('#2041');
  await toolbar.getByRole('button', { name: 'Stations', exact: true }).click();
  await page.getByRole('button', { name: /^Grill line:/ }).click();
  await expect(page.getByRole('complementary', { name: 'Station inspector' })).toContainText('Grill line');
  await expect(tickets.locator('tbody tr')).toHaveCount(3); await expect(tickets).toContainText('Grill line');
  await tickets.getByRole('button', { name: 'Clear station filter', exact: true }).click(); await expect(tickets.locator('tbody tr')).toHaveCount(12);
  // A click on a floating panel does not pick the scene object behind it.
  await page.getByRole('region', { name: 'Restaurant navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('complementary', { name: 'Station inspector' })).toBeVisible();
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/restaurant-hud-desktop.png' });

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
  await expect(page.getByRole('complementary', { name: 'Station inspector' })).toBeVisible();
  // A metric card opens its detail, shows it as pressed and closes it again.
  const cooler = page.getByRole('button', { name: 'Inspect the walk-in cooler', exact: true });
  await cooler.click(); await expect(page.getByRole('complementary', { name: 'Cooler inspector' })).toContainText('Walk-in cooler'); await expect(cooler).toHaveAttribute('aria-pressed', 'true');
  await cooler.click(); await expect(page.getByRole('complementary', { name: 'Cooler inspector' })).toHaveCount(0);

  await page.getByLabel('Mock snapshot').selectOption('closed');
  await expect(page.getByRole('region', { name: 'Service metrics' })).toContainText('0 / 14');
  await expect(tickets.getByText('No open tickets in this scope.')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await viewport.boundingBox())!;
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const panel of ['Floor', 'Tickets', 'Info', 'Stations']) { await toolbar.getByRole('button', { name: panel, exact: true }).click(); await expectPanelsInsideViewport(page); }
  await page.screenshot({ path: 'artifacts/restaurant-hud-mobile.png' });
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open restaurant example', exact: true })).toHaveAttribute('href', '/examples/restaurant');
  expect(errors).toEqual([]);
});

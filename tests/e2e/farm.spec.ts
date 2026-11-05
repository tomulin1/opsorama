import { expect, test, type Page } from '@playwright/test';

const ANIMALS = ['cow', 'horse', 'sheep', 'pig', 'chicken', 'dog', 'cat', 'bird'];
const FARM_OBJECTS = ['barn', 'paddock-fence', 'hay-bale', 'trough', 'chicken-coop', 'crop-field'];

test('animal and farm models have live previews, contracts and usage snippets', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of [...ANIMALS, ...FARM_OBJECTS]) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas'), slug).toHaveCount(1);
    // Every animal animates in place; every farm object is static; nothing in either batch is countable.
    await expect(page.getByLabel('Object animation'), slug).toHaveCount(ANIMALS.includes(slug) ? 1 : 0);
    await expect(page.getByLabel('Object count', { exact: true }), slug).toHaveCount(0);
    await expect(page.getByText(`assetDescriptors.${slug}`, { exact: false }).first(), slug).toBeVisible();
    await page.getByLabel('Object color').fill('#765432');
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText(slug); await expect(page.locator('.docs-code-block pre')).toContainText('#765432');
  }
  await page.goto('/docs/objects');
  await page.getByRole('button', { name: 'Animals', exact: true }).click(); await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(ANIMALS.length);
  await page.getByRole('button', { name: 'Farm', exact: true }).click(); await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(FARM_OBJECTS.length);
  expect(errors).toEqual([]);
});

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.fm-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

test('farm fills the viewport with a floating HUD and inspects pens, animals, troughs and fields', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/farm', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('.fm-viewport');
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
  await page.getByRole('button', { name: 'Open livestock pens', exact: true }).click();
  await page.getByRole('button', { name: /^Inspect Dairy pasture:/ }).click();
  const pen = page.getByRole('complementary', { name: 'Pen inspector' });
  await expect(pen).toContainText('46 of 46'); await expect(pen).toContainText('UK-187');
  await toolbar.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByRole('navigation', { name: 'Alerts' }).getByRole('button', { name: /EW-033/ }).click();
  await expect(page.getByRole('complementary', { name: 'Pen inspector' })).toContainText('37 of 38');
  await toolbar.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByRole('navigation', { name: 'Alerts' }).getByRole('button', { name: /Dairy pasture water/ }).click();
  await expect(page.getByRole('complementary', { name: 'Trough inspector' })).toContainText('Empty');
  await toolbar.getByRole('button', { name: 'Fields', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect North Acre', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Field inspector' })).toContainText('Ready to harvest');
  // A click on a floating panel does not pick the scene object behind it.
  await page.getByRole('region', { name: 'Farm navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('complementary', { name: 'Field inspector' })).toBeVisible();
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/farm-hud-desktop.png' });

  await page.getByRole('button', { name: 'Expand viewport', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-expanded', 'true');
  expect((await viewport.boundingBox())!.height).toBe(page.viewportSize()!.height);
  await page.keyboard.press('Escape'); await expect(viewport).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  await expect(viewport.locator('.dp-panel')).toHaveCount(1); await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toBeVisible();
  expect(await originalCanvas!.evaluate(canvas => canvas.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Show information panels', exact: true }).click();

  await page.getByLabel('Mock snapshot').selectOption('harvest');
  await expect(page.getByRole('region', { name: 'Farm metrics' })).toContainText('All animals counted');
  await toolbar.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('list', { name: "Today's tasks" })).toContainText('Harvest Long Meadow');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await viewport.boundingBox())!;
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const panel of ['Pens', 'Fields', 'Tasks', 'Info', 'Alerts']) { await toolbar.getByRole('button', { name: panel, exact: true }).click(); await expectPanelsInsideViewport(page); }
  await page.screenshot({ path: 'artifacts/farm-hud-mobile.png' });
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open farm example', exact: true })).toHaveAttribute('href', '/examples/farm');
  expect(errors).toEqual([]);
});

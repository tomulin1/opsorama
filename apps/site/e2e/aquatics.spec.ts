import { expect, test, type Page } from './fixtures';

const NEW_OBJECTS = ['lap-pool', 'wading-pool', 'swimmer', 'starting-block', 'lifeguard-chair', 'pool-ladder', 'sun-lounger', 'deck-shower', 'life-ring-post', 'dosing-station', 'sand-filter'];
const ANIMATED = ['lap-pool', 'wading-pool', 'swimmer', 'deck-shower'];

test('aquatics models have live previews, contracts and usage snippets', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of NEW_OBJECTS) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas'), slug).toHaveCount(1);
    // Ripples, the fountain, the stroke and the shower water animate; nothing in the batch is countable.
    await expect(page.getByLabel('Object animation'), slug).toHaveCount(ANIMATED.includes(slug) ? 1 : 0);
    await expect(page.getByLabel('Object count', { exact: true }), slug).toHaveCount(0);
    await expect(page.getByText(`assetDescriptors.${slug}`, { exact: false }).first(), slug).toBeVisible();
    await page.getByLabel('Object color').fill('#765432');
    await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText(slug); await expect(page.locator('.docs-code-block pre')).toContainText('#765432');
  }
  await page.goto('/docs/objects'); await page.getByRole('button', { name: 'Aquatics', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(NEW_OBJECTS.length);
  expect(errors).toEqual([]);
});

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.aq-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

test('aquatic centre fills the viewport with a floating HUD and inspects lanes, posts and water', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/aquatics', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('.aq-viewport');
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
  await page.getByRole('button', { name: 'Open lane overview', exact: true }).click();
  await page.getByRole('button', { name: /^Inspect lane 4:/ }).click();
  const lane = page.getByRole('complementary', { name: 'Lane inspector' });
  await expect(lane).toContainText('Lane 4'); await expect(lane).toContainText('Swim school'); await expect(lane.getByRole('alert')).toContainText('Instructor requested');
  await toolbar.getByRole('button', { name: 'Lifeguards', exact: true }).click();
  await page.getByRole('button', { name: /^Inspect Teaching pool chair:/ }).click();
  await expect(page.getByRole('complementary', { name: 'Lifeguard inspector' })).toContainText('Post empty while 14 bathers');
  await toolbar.getByRole('button', { name: 'Water', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect water in the Teaching pool', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Water inspector' })).toContainText('Outside limits');
  await page.getByRole('button', { name: 'Inspect filtration', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Plant inspector' })).toContainText('Backwash');
  // A click on a floating panel does not pick the scene object behind it.
  await page.getByRole('region', { name: 'Aquatic centre navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('complementary', { name: 'Plant inspector' })).toBeVisible();
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/aquatics-hud-desktop.png' });

  await page.getByRole('button', { name: 'Expand viewport', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-expanded', 'true');
  expect((await viewport.boundingBox())!.height).toBe(page.viewportSize()!.height);
  await page.keyboard.press('Escape'); await expect(viewport).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  await expect(viewport.locator('.dp-panel')).toHaveCount(1); await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toBeVisible();
  expect(await originalCanvas!.evaluate(canvas => canvas.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Show information panels', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Plant inspector' })).toBeVisible();

  await page.getByLabel('Mock snapshot').selectOption('closed');
  await expect(page.getByRole('region', { name: 'Pool metrics' })).toContainText('Pool covered');
  await toolbar.getByRole('button', { name: 'Lifeguards', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Lifeguard posts', exact: true })).toContainText('Off duty');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await viewport.boundingBox())!;
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const panel of ['Lanes', 'Water', 'Info', 'Lifeguards']) { await toolbar.getByRole('button', { name: panel, exact: true }).click(); await expectPanelsInsideViewport(page); }
  await page.screenshot({ path: 'artifacts/aquatics-hud-mobile.png' });
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open aquatic centre example', exact: true })).toHaveAttribute('href', '/examples/aquatics');
  expect(errors).toEqual([]);
});

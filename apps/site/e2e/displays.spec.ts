import { expect, test, type Page } from './fixtures';

async function canvasPixels(page: Page) {
  return page.locator('canvas').evaluate(canvas => new Promise<string>(resolve => requestAnimationFrame(() => {
    const copy = document.createElement('canvas'); copy.width = 320; copy.height = 220;
    copy.getContext('2d')!.drawImage(canvas as HTMLCanvasElement, 0, 0, 320, 220); resolve(copy.toDataURL());
  })));
}

test('catalog displays expose valid settings, snippets, artwork and remount cleanup', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects'); await page.getByRole('button', { name: 'Displays & time', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(7); await expect(page.locator('canvas')).toHaveCount(0);
  for (const asset of ['monitor', 'information-board', 'led-display', 'analog-clock', 'digital-clock', 'stopwatch', 'countdown-timer']) {
    await page.goto(`/docs/objects/${asset}`); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('.object-detail [role=alert], .adapter-example [role=alert]')).toHaveCount(0); await expect(page.getByLabel('Object count', { exact: true })).toHaveCount(0);
    if (asset === 'led-display') {
      await page.getByLabel('Display value', { exact: true }).fill('-12.5'); await page.getByLabel('Display decimals').selectOption('2');
      await expect(page.getByLabel('Configured display reading')).toHaveText('-12.50');
      await page.getByLabel('Display unknown').check(); await expect(page.getByLabel('Configured display reading')).toHaveText('----');
    } else if (['analog-clock', 'digital-clock', 'stopwatch', 'countdown-timer'].includes(asset)) {
      await page.getByLabel('Object animation').uncheck(); await page.getByLabel('Display seconds').fill('61');
      await expect(page.getByLabel('Configured display reading')).toHaveText('00:01:01');
      for (const framework of ['React', 'Vue', 'JavaScript']) { await page.getByRole('button', { name: framework, exact: true }).click(); await expect(page.locator('.docs-code-block pre')).toContainText('display'); await expect(page.locator('.docs-code-block pre')).toContainText('61'); }
    } else await expect(page.getByLabel('Object animation')).toHaveCount(0);
    const variants = await page.getByLabel('Object variant').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    for (const variant of variants) await page.getByLabel('Object variant').selectOption(variant);
    await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0); await expect(page.locator('.kit-node-label')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/countdown-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});

test('all native adapters update display inputs and screen artwork, resize, select and dispose', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.goto('/examples/displays');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    for (const [asset, name] of [['monitor', 'Monitor / screen'], ['information-board', 'Information board'], ['led-display', 'LED numeric display'], ['analog-clock', 'Analog clock'], ['digital-clock', 'Digital clock'], ['stopwatch', 'Stopwatch'], ['countdown-timer', 'Countdown timer']]) {
      await page.getByLabel('Display model').selectOption(asset); await expect(page.getByRole('button', { name: `Select ${name}`, exact: true })).toBeVisible();
      if (asset === 'monitor' || asset === 'information-board') await page.getByLabel('Screen text').fill('Queue\n12 pending');
      else if (asset === 'led-display') await page.getByLabel('Display value', { exact: true }).fill('42.5');
      else { await page.getByLabel('Display seconds').fill('83'); await page.getByLabel('Scene animation').check(); await page.getByLabel('Scene paused').check(); await page.getByLabel('Scene paused').uncheck(); await page.getByLabel('Scene animation').uncheck(); }
      await page.getByRole('button', { name: `Select ${name}`, exact: true }).click(); await expect(page.locator('.object-detail [role=alert], .adapter-example [role=alert]')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0); await expect(page.locator('.kit-node-label')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/displays-adapters-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});

test('running clocks obey scene motion, pause and reduced-motion gates through the shared renderer', async ({ page }) => {
  await page.goto('/examples/displays'); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByLabel('Display model').selectOption('analog-clock'); await page.getByLabel('Display seconds').fill('0');
  await expect(page.getByLabel('Display running')).toBeChecked();
  const staticPixels = await canvasPixels(page); await page.waitForTimeout(350); expect(await canvasPixels(page)).toBe(staticPixels);
  await page.getByLabel('Scene animation').check(); await expect.poll(() => canvasPixels(page)).not.toBe(staticPixels);
  await page.getByLabel('Scene paused').check();
  const pausedPixels = await canvasPixels(page); await page.waitForTimeout(350); expect(await canvasPixels(page)).toBe(pausedPixels);
  await page.getByLabel('Scene paused').uncheck(); await expect.poll(() => canvasPixels(page)).not.toBe(pausedPixels);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedPixels = await canvasPixels(page); await page.waitForTimeout(350); expect(await canvasPixels(page)).toBe(reducedPixels);
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await expect.poll(() => canvasPixels(page)).not.toBe(reducedPixels);
  await page.getByLabel('Scene animation').uncheck();
  const disabledPixels = await canvasPixels(page); await page.waitForTimeout(350); expect(await canvasPixels(page)).toBe(disabledPixels);
  await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await page.getByRole('button', { name: 'Mount scene', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1); await expect.poll(() => canvasPixels(page)).toBe(staticPixels);
});

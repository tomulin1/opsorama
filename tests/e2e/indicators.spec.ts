import { expect, test, type Page } from '@playwright/test';

async function canvasColors(page: Page) {
  return page.locator('canvas').evaluate(canvas => new Promise<number>(resolve => requestAnimationFrame(() => {
    const copy = document.createElement('canvas'); copy.width = 160; copy.height = 100;
    const context = copy.getContext('2d')!; context.drawImage(canvas as HTMLCanvasElement, 0, 0, 160, 100);
    const pixels = context.getImageData(0, 0, 160, 100).data, colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    resolve(colors.size);
  })));
}

test('capacity measured inputs validate, retain exact readings and preserve legacy counts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/capacity-gauge'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Object count', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveAttribute('type', 'range');
  await page.getByLabel('Measurement unit', { exact: true }).fill('kW');
  await page.getByLabel('Measurement value', { exact: true }).fill('72.5');
  await page.getByLabel('Measurement min', { exact: true }).fill('10');
  await page.getByLabel('Measurement max', { exact: true }).fill('90');
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveAttribute('min', '10');
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveAttribute('max', '90');
  await page.getByLabel('Measurement unit', { exact: true }).fill('kW');
  await page.getByLabel('Measurement target', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Add band', exact: true }).click();
  await page.getByLabel('Band 1 state').selectOption('critical');
  await expect(page.getByLabel('Current measurement')).toHaveText('72.5 kW');
  for (const framework of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: framework, exact: true }).click();
    await expect(page.locator('.docs-code-block pre')).toContainText('72.5');
    await expect(page.locator('.docs-code-block pre')).toContainText('measurement');
  }
  await page.getByLabel('Measurement max', { exact: true }).fill('5');
  await expect(page.locator('.object-measurement-controls').getByRole('alert')).toContainText('last valid configuration');
  await expect(page.locator('.docs-code-block pre')).toContainText('"max": 90');
  await page.getByLabel('Measurement max', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Remove band 1', exact: true }).click();
  await page.getByLabel('Measurement max', { exact: true }).fill('60');
  await expect(page.getByLabel('Current measurement')).toHaveText('72.5 kW (out of range)');
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveValue('60');
  await expect(page.locator('.docs-code-block pre')).toContainText('72.5');
  await page.getByLabel('Unknown reading').check(); await expect(page.getByLabel('Current measurement')).toHaveText('Unknown');
  await expect(page.getByLabel('Measurement value', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveValue('60');
  await page.getByLabel('Gauge input mode').selectOption('count');
  await page.getByLabel('Object count', { exact: true }).fill('10');
  await page.getByLabel('Object variant').selectOption('horizontal-segmented');
  await expect(page.getByRole('button', { name: 'Select 10 segments', exact: true })).toBeVisible();
  await page.getByLabel('Gauge input mode').selectOption('measurement');
  await expect(page.getByLabel('Current measurement')).toHaveText('60 %');
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
  await page.screenshot({ path: 'artifacts/capacity-measurement-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('percentage readouts round while source precision and other units remain intact', async ({ page }) => {
  await page.goto('/docs/objects/ring-gauge'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Current measurement')).toHaveText('73 %');
  await expect(page.getByRole('button', { name: 'Select 73 %', exact: true })).toBeVisible();
  await expect(page.locator('.docs-code-block pre')).toContainText('72.5');
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveAttribute('step', '1');
  await page.getByLabel('Measurement value', { exact: true }).fill('67');
  await expect(page.getByLabel('Current measurement')).toHaveText('67 %');
  await page.getByLabel('Measurement value', { exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Current measurement')).toHaveText('68 %');
  await page.getByLabel('Measurement unit', { exact: true }).fill('kW');
  await expect(page.getByLabel('Measurement value', { exact: true })).toHaveAttribute('step', 'any');
  await page.getByLabel('Measurement value', { exact: true }).fill('67.25');
  await expect(page.getByLabel('Current measurement')).toHaveText('67.25 kW');
});

test('all indicator variants render and mobile measurement controls fit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects'); await page.getByRole('button', { name: 'Indicators', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(7);
  await expect(page.getByAltText('Ring gauge model preview')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/indicator-collection.png', fullPage: true });
  for (const [asset, variants] of [
    ['capacity-gauge', ['vertical-segmented', 'horizontal-segmented', 'vertical-continuous', 'horizontal-continuous']],
    ['ring-gauge', ['full', 'semicircle']], ['dial-gauge', ['semicircle', 'full']],
    ['battery-indicator', ['vertical-continuous', 'horizontal-continuous', 'vertical-segmented', 'horizontal-segmented']],
  ] as const) {
    await page.goto(`/docs/objects/${asset}`); await expect(page.locator('canvas')).toHaveCount(1);
    for (const variant of variants) {
      await page.getByLabel('Object variant').selectOption(variant);
      await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
    }
    await expect(page.getByLabel('Object animation')).toHaveCount(0);
    await page.screenshot({ path: `artifacts/${asset}-measured.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Add band', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/battery-measurement-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('semicircle dial renders its minimum and maximum needle and target on desktop and mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/dial-gauge'); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByLabel('Object variant').selectOption('semicircle');
  for (const value of ['0', '100']) {
    await page.getByLabel('Measurement value', { exact: true }).fill(value);
    await page.getByLabel('Measurement target', { exact: true }).fill(value);
    await expect(page.getByRole('button', { name: `Select ${value} %`, exact: true })).toBeVisible();
    await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
    await page.screenshot({ path: `artifacts/dial-semicircle-fixed-${value}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/dial-semicircle-fixed-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('measured Asset props update and dispose through React, native Vue and JavaScript', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/indicators');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByLabel('Indicator value', { exact: true })).toHaveAttribute('type', 'range');
    for (const asset of ['capacity-gauge', 'ring-gauge', 'dial-gauge', 'battery-indicator']) {
      await page.getByLabel('Indicator model').selectOption(asset);
      await page.getByLabel('Indicator value', { exact: true }).fill('73');
      await expect(page.getByRole('button', { name: 'Select 73 %', exact: true })).toBeVisible();
      await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
      await page.getByLabel('Indicator value', { exact: true }).fill('100');
      await expect(page.getByRole('button', { name: 'Select 100 %', exact: true })).toBeVisible();
      await page.getByLabel('Indicator unknown').check();
      await expect(page.getByRole('button', { name: 'Select Unknown', exact: true })).toBeVisible();
      await expect(page.getByLabel('Indicator value', { exact: true })).toBeDisabled();
      await page.getByLabel('Indicator unknown').uncheck();
    }
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0); await expect(page.locator('.kit-node-label')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  }
  await page.getByLabel('Indicator value', { exact: true }).fill('73');
  await page.screenshot({ path: 'artifacts/indicators-adapters-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => canvasColors(page)).toBeGreaterThan(30);
  await page.screenshot({ path: 'artifacts/indicators-adapters-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

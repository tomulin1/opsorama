import { expect, test, type Page } from './fixtures';

async function canvasImage(page: Page) {
  return page.locator('canvas').evaluate(canvas => new Promise<{ image: string; colors: number }>(resolve => requestAnimationFrame(() => {
    const copy = document.createElement('canvas'); copy.width = 240; copy.height = 160;
    const context = copy.getContext('2d')!; context.drawImage(canvas as HTMLCanvasElement, 0, 0, 240, 160);
    const pixels = context.getImageData(0, 0, 240, 160).data, colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    resolve({ image: copy.toDataURL(), colors: colors.size });
  })));
}

test('portable previews rotate in four directions without losing settings, selection or snippets', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const slug of ['delivery-van', 'desk-pod', 'conveyor', 'lab-workstation', 'ground', 'path']) {
    await page.goto(`/docs/objects/${slug}`); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByRole('toolbar', { name: 'Preview view controls' })).toBeVisible();
    await expect(page.getByLabel('Object direction')).toHaveText('0°');
    if (await page.getByLabel('Object animation').count()) await page.getByLabel('Object animation').uncheck();
    const images = new Set<string>();
    for (const degrees of [0, 90, 180, 270]) {
      if (degrees !== 0) await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
      await expect(page.getByLabel('Object direction')).toHaveText(`${degrees}°`);
      const angle = degrees * Math.PI / 180;
      for (const framework of ['React', 'Vue', 'JavaScript']) {
        await page.getByRole('button', { name: framework, exact: true }).click();
        await expect(page.locator('.docs-code-block pre')).toContainText(framework === 'JavaScript' ? '"rotation"' : 'rotation=');
        await expect(page.locator('.docs-code-block pre')).toContainText(String(angle));
      }
      await expect.poll(async () => (await canvasImage(page)).colors).toBeGreaterThan(30);
      images.add((await canvasImage(page)).image);
    }
    expect(images.size, slug).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Select object', exact: true }).click();
    await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
    await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Object selected');
    await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByLabel('Object direction')).toHaveText('90°');
    await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
    await expect(page.getByLabel('Object direction')).toHaveText('0°');
  }
  await page.goto('/docs/objects/parcel-base'); await page.getByLabel('Object count', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
  await expect(page.getByLabel('Object direction')).toHaveText('270°');
  await expect(page.getByLabel('Object count', { exact: true })).toHaveValue('9');
  await expect(page.getByRole('button', { name: 'Select 9 parcels', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(async () => (await canvasImage(page)).colors).toBeGreaterThan(30);
  await page.screenshot({ path: 'artifacts/direction-mobile.png', fullPage: true });
  await page.goto('/docs/objects/forklift'); await expect(page.getByLabel('Object direction')).toHaveText('0°');
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByLabel('Object direction')).toHaveText('90°');
  expect(errors).toEqual([]);
});

test('viewport zoom changes the camera only, respects bounds and survives remount', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/whiteboard'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(async () => (await canvasImage(page)).colors).toBeGreaterThan(30);
  const source = await page.locator('.docs-code-block pre').innerText(), before = (await canvasImage(page)).image;
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await canvasImage(page)).image).not.toBe(before);
  await expect(page.locator('.docs-code-block pre')).toHaveText(source);
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true }), zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
  for (let i = 0; i < 50 && await zoomIn.isEnabled(); i++) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  await expect(page.locator('.docs-code-block pre')).toHaveText(source);
  for (let i = 0; i < 50 && await zoomOut.isEnabled(); i++) await zoomOut.click();
  await expect(zoomOut).toBeDisabled();
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click();
  await expect(zoomIn).toBeDisabled(); await expect(page.getByRole('button', { name: 'Rotate left', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(zoomOut).toBeDisabled(); await expect(page.getByLabel('Object direction')).toHaveText('90°');
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(zoomOut).toBeEnabled(); await expect(page.getByLabel('Object direction')).toHaveText('90°');
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.getByLabel('Object direction')).toHaveText('0°');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/viewport-controls-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  const viewport = await page.locator('.object-preview-viewport').boundingBox(), toolbar = await page.getByRole('toolbar', { name: 'Preview view controls' }).boundingBox();
  expect(toolbar!.x).toBeGreaterThanOrEqual(viewport!.x); expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/viewport-controls-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

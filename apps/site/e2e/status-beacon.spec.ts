import { expect, test, type Page } from '@playwright/test';

async function beaconImage(page: Page) {
  return page.locator('canvas').evaluate(canvas => new Promise<string>(resolve => requestAnimationFrame(() => {
    const copy = document.createElement('canvas'); copy.width = 240; copy.height = 160;
    copy.getContext('2d')!.drawImage(canvas as HTMLCanvasElement, 0, 0, 240, 160); resolve(copy.toDataURL());
  })));
}

test('beacon preview switches all lamp states, exports them and retains state on remount', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/status-beacon'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Object state')).toHaveValue('normal');
  await expect(page.getByLabel('Object state').locator('option')).toHaveText(['Normal (green)', 'Warning (amber)', 'Critical (red)', 'Inactive (off)']);
  await page.getByLabel('Object animation').uncheck();
  await expect(page.locator('.docs-code-block pre')).toContainText('state="normal"');
  const images = new Set<string>();
  for (const state of ['normal', 'warning', 'critical', 'inactive']) {
    await page.getByLabel('Object state').selectOption(state);
    for (const framework of ['React', 'Vue', 'JavaScript']) {
      await page.getByRole('button', { name: framework, exact: true }).click();
      await expect(page.locator('.docs-code-block pre')).toContainText(`"${state}"`);
    }
    const previous = [...images].at(-1);
    if (previous) await expect.poll(() => beaconImage(page)).not.toBe(previous);
    images.add(await beaconImage(page));
  }
  expect(images.size).toBe(4);
  await expect(page.getByLabel('Object state').locator('option[value="busy"]')).toHaveCount(0);
  await page.getByLabel('Object state').selectOption('critical');
  await page.getByRole('button', { name: 'Select object', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Object selected');
  await page.getByLabel('Object state').selectOption('warning');
  await expect(page.getByRole('status')).toHaveText('Object selected');
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Object state')).toHaveValue('warning');
  await expect(page.locator('.docs-code-block pre')).toContainText('"warning"');
  await page.screenshot({ path: 'artifacts/status-beacon-warning.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(page.getByLabel('Object state')).toHaveValue('normal');
  await expect(page.getByLabel('Object animation')).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/status-beacon-mobile.png', fullPage: true });
  await page.goto('/docs/objects/tree-pine'); await expect(page.getByLabel('Object state')).toHaveCount(0);
  expect(errors).toEqual([]);
});

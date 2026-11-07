import { test, expect } from './fixtures';

test('generic panels support native content, controlled updates and teardown across adapters', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/panels');
  const samples = page.getByRole('region', { name: 'Generic panel samples' });
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await samples.getByRole('button', { name: adapter, exact: true }).click();
    const resources = samples.getByRole('region', { name: 'ResourceList', exact: true });
    const metric = samples.getByRole('region', { name: 'MetricCard', exact: true });
    const inspector = samples.getByRole('region', { name: 'EntityInspector', exact: true });
    await expect(samples.locator('.dp-panel')).toHaveCount(11);
    await resources.getByRole('button', { name: /Item B/ }).click();
    await expect(inspector).toContainText('b');
    await expect(resources.getByRole('button', { name: /Item B/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(resources.getByRole('button', { name: /Item C/ })).toBeDisabled();
    await samples.getByRole('button', { name: 'Custom action', exact: true }).click();
    await expect(samples.getByRole('status').first()).toHaveText('Selected sample: custom');
    await resources.getByRole('button', { name: /Item A/ }).focus();
    await page.getByLabel('Sample reading', { exact: true }).fill('120');
    await expect(metric.locator('.dp-metric-value')).toHaveText('120units');
    await expect(samples.getByRole('region', { name: 'CapacityCard' })).toContainText('above range');
    await expect(samples.getByRole('meter', { name: 'Reading', exact: true })).toHaveAttribute('aria-valuenow', '100');
    await page.getByLabel('Sample reading', { exact: true }).fill('');
    await expect(metric).toContainText('Unknown'); await expect(samples.getByRole('meter')).toHaveCount(0);
    await page.getByLabel('Sample reading', { exact: true }).fill('0'); await expect(metric.locator('.dp-metric-value')).toHaveText('0units');
    for (const state of ['loading', 'empty', 'error', 'ready']) {
      await samples.getByLabel('Content state').selectOption(state);
      await expect(metric).toHaveAttribute('data-state', state);
      if (state === 'loading') await expect(metric).toHaveAttribute('aria-busy', 'true');
      if (state === 'error') await expect(metric.getByRole('alert')).toHaveText('Data unavailable.');
    }
    const zoom = samples.getByRole('group', { name: 'Zoom', exact: true }), vertical = samples.getByRole('group', { name: 'Vertical zoom', exact: true });
    const sliderZoom = samples.getByRole('group', { name: 'Slider zoom', exact: true });
    await expect(zoom).toHaveAttribute('data-appearance', 'toolbar'); await expect(vertical).toHaveAttribute('data-orientation', 'vertical');
    await zoom.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const slider = sliderZoom.getByRole('slider', { name: 'Zoom level' });
    await expect(slider).toHaveValue('1.25'); await slider.focus(); await slider.press('ArrowRight');
    // step="any": native arrow keys move by 1% of the range.
    await expect.poll(async () => Number(await slider.inputValue())).toBeCloseTo(1.29, 2); await expect(slider).toBeFocused();
    await slider.fill('5'); await expect(zoom.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
    await expect(vertical.getByRole('button', { name: 'Enlarge', exact: true })).toBeDisabled();
    await zoom.getByRole('button', { name: 'Reset zoom', exact: true }).click(); await expect(slider).toHaveValue('1');
    await vertical.getByRole('button', { name: 'Reduce', exact: true }).click(); await expect(slider).toHaveValue('0.9');
    await vertical.getByRole('button', { name: 'Reset zoom', exact: true }).click();
    await samples.getByRole('button', { name: 'Unmount panels', exact: true }).click();
    await expect(samples.locator('.dp-panel')).toHaveCount(0);
    await samples.getByRole('button', { name: 'Mount panels', exact: true }).click();
    await expect(samples.locator('.dp-panel')).toHaveCount(11);
  }
  await page.screenshot({ path: 'artifacts/panels-desktop.png', fullPage: true });
  await samples.evaluate(element => { element.style.setProperty('--panel-radius', '4px'); element.style.colorScheme = 'dark'; });
  await expect(samples.locator('.dp-panel').first()).toHaveCSS('border-radius', '4px');
  await expect(samples.locator('.dp-panel').first()).toHaveCSS('background-color', 'rgb(32, 43, 64)');
  await samples.evaluate(element => { element.style.removeProperty('--panel-radius'); element.style.removeProperty('color-scheme'); });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(0); expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/panels-mobile.png', fullPage: true });
  await page.goto('/docs/data-panels');
  await expect(page.getByRole('heading', { name: 'Panels', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Generic panel samples' }).locator('.dp-panel')).toHaveCount(11);
});

test('plain JS preserves focused rows through updates and cleans up its roots', async ({ page }) => {
  await page.goto('/examples/panels');
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
  const row = page.getByRole('region', { name: 'ResourceList', exact: true }).getByRole('button', { name: /Item A/ });
  await row.focus();
  await row.press('Enter');
  await expect(row).toBeFocused(); await expect(row).toHaveAttribute('aria-pressed', 'true');
  // Programmatic activation leaves focus on the row while the host reorders its input.
  await page.getByLabel('Reverse sample rows').evaluate(element => (element as HTMLInputElement).click());
  await expect(row).toBeFocused();
  await expect(page.getByRole('region', { name: 'ResourceList', exact: true }).getByRole('button').first()).toHaveText('Item C');
  await page.getByRole('region', { name: 'ProcessTracker', exact: true }).getByRole('button', { name: /Step B/ }).click();
  await expect(page.getByRole('region', { name: 'ResourceList', exact: true }).getByRole('button', { name: /Item B/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Unmount panels', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Selected sample: b');
  await expect(page.locator('.panel-samples-grid')).toHaveCount(0);
});

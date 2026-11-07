import { ciScaled, test, expect } from './fixtures';

test('zoom control configurator drives the real component through all native adapters', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/zoom-control');
  await expect(page.getByRole('heading', { name: 'Zoom control', exact: true })).toBeVisible();
  const configurator = page.getByRole('region', { name: 'ZoomControl configurator' });
  const control = configurator.getByRole('group', { name: 'Zoom', exact: true }), stage = configurator.locator('.zoom-stage-note');
  const code = configurator.locator('.docs-code-block code');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await configurator.getByRole('button', { name: adapter, exact: true }).click();
    await configurator.getByRole('button', { name: 'Reset settings', exact: true }).click();
    await expect(control).toHaveAttribute('data-appearance', 'toolbar');
    await expect(control.locator('svg')).toHaveCount(3);
    await control.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(stage).toContainText('1.20×');
    await control.getByRole('button', { name: 'Reset zoom', exact: true }).click(); await expect(stage).toContainText('1.00×');

    await configurator.getByLabel('Orientation').selectOption('vertical');
    await configurator.getByLabel('Host content').check();
    await expect(control).toHaveAttribute('data-orientation', 'vertical');
    await expect(control).toContainText('Host content');
    await expect(code).toContainText(adapter === 'React' ? 'orientation="vertical"' : "orientation: 'vertical'");

    await configurator.getByLabel('FPS readout').selectOption('reading');
    await expect(control.getByLabel('Scene FPS', { exact: true })).toHaveText('60'); await expect(control.locator('.zc-separator')).toHaveCount(1);
    await expect(code).toContainText(adapter === 'JavaScript' ? 'sampleRendererFps' : 'useRendererFps');
    await configurator.getByLabel('FPS readout').selectOption('unknown'); await expect(control.getByLabel('Scene FPS', { exact: true })).toHaveText('—');
    await configurator.getByLabel('Controls').selectOption('slider');
    await expect(control.getByRole('button', { name: 'Zoom in', exact: true })).toHaveCount(0);
    await control.getByRole('slider', { name: 'Zoom level' }).fill('2'); await expect(stage).toContainText('2.00×');

    await configurator.getByLabel('Disabled').check(); await expect(control.getByRole('slider')).toBeDisabled();
    await configurator.getByLabel('Minimum').fill('6');
    await expect(configurator.getByRole('alert')).toContainText('maximum above minimum');
    // The preview keeps the last valid settings while the host input is invalid.
    await expect(control.getByRole('slider')).toBeDisabled();
  }
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

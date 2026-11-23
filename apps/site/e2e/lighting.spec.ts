import { ciScaled, expect, test } from './fixtures';

// A display ratio of 2 shows how each quality profile caps the canvas pixel ratio.
test.use({ deviceScaleFactor: 2 });

test('lighting presets, sky and fog restyle the yard without rebuilding models, and quality caps the pixel ratio, in every adapter', async ({ page }) => {
  // Three adapters, five presets and three quality levels, each waited for in the readouts.
  test.setTimeout(ciScaled(120000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/lighting');
  const example = page.getByRole('region', { name: 'Lighting example' }), canvas = example.locator('canvas');
  const builds = async () => Number(/Model builds: (\d+)/.exec(await example.getByLabel('Model builds').innerText())?.[1] ?? -1);
  const ratio = async () => Number(/Pixel ratio: ([\d.]+)/.exec(await example.getByLabel('Pixel ratio').innerText())?.[1] ?? -1);
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(canvas).toHaveCount(1); await expect(example.getByLabel('Load status')).toHaveText('Scene loaded');
    await expect.poll(builds).toBeGreaterThan(0);
    const built = await builds(), studio = await canvas.screenshot();
    // Each preset changes the picture; none rebuilds a model.
    for (const preset of ['daylight', 'overcast', 'dusk', 'night']) {
      await example.getByLabel('Lighting preset').selectOption(preset);
      await expect.poll(async () => (await canvas.screenshot()).equals(studio)).toBe(false);
    }
    const night = await canvas.screenshot();
    await example.getByRole('button', { name: 'Sky' }).click(); await example.getByRole('button', { name: 'Fog' }).click(); await example.getByRole('button', { name: 'Perspective' }).click();
    await expect.poll(async () => (await canvas.screenshot()).equals(night)).toBe(false);
    // Presets, sky, fog and the camera rebuilt nothing (the readout refreshes every 500 ms).
    await page.waitForTimeout(600); expect(await builds()).toBe(built);
    // A theme change restyles models: they are rebuilt once.
    await example.getByRole('button', { name: 'Theme: light' }).click(); await expect(example.getByRole('button', { name: 'Theme: midnight' })).toBeVisible();
    await expect.poll(builds).toBeGreaterThan(built);
    await page.waitForTimeout(600); const afterTheme = await builds();
    await example.getByLabel('Lighting preset').selectOption('studio'); await example.getByRole('button', { name: 'Sky' }).click();
    await page.waitForTimeout(600); expect(await builds()).toBe(afterTheme);
    // Quality caps the canvas pixel ratio: 2, 1.5, 1 on a display ratio of 2.
    for (const [level, expected] of [['low', 1], ['balanced', 1.5], ['high', 2]] as const) {
      await example.getByLabel('Quality').selectOption(level);
      await expect.poll(ratio).toBe(expected);
    }
    await example.locator('.kit-node-label', { hasText: 'Van 1' }).click();
    await expect(example.getByLabel('Selection')).toHaveText('Selected: van (van:1)');
    // Back to the defaults for the next adapter.
    await example.getByRole('button', { name: 'Fog' }).click(); await example.getByRole('button', { name: 'Perspective' }).click(); await example.getByRole('button', { name: 'Theme: midnight' }).click();
  }
  expect(errors).toEqual([]);
});

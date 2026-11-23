import { ciScaled, expect, sceneCanvas, test, type Locator } from './fixtures';

/** The step count of the fixed-step readout. */
async function steps(readout: Locator): Promise<number> {
  const text = await readout.textContent();
  const match = /Fixed steps \(1\/60 s\): (\d+)/.exec(text ?? '');
  expect(match, `step readout: ${text}`).not.toBeNull();
  return Number(match![1]);
}

test('engine hooks report pointer events, keep the selection on a prevented click, step on a fixed clock and clean up the plugin in each adapter', async ({ page }) => {
  test.setTimeout(ciScaled(150000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/engine-hooks');
  const example = page.getByRole('region', { name: 'Engine hooks example' });
  const stepReadout = example.locator('.engine-step-readout'), click = example.locator('.engine-click-readout'), hover = example.locator('.engine-hover-readout');
  const lifecycle = example.getByLabel('Plugin lifecycle');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(sceneCanvas(page)).toHaveCount(1);
    await expect(example.locator('.engine-load-status')).toHaveText('Scene loaded', { timeout: ciScaled(30000) });

    // The fixed-step listener counts while the scene runs and stops while it is paused.
    await expect.poll(() => steps(stepReadout)).toBeGreaterThan(10);
    await example.getByLabel('Pause scene').check();
    const paused = await steps(stepReadout);
    await page.waitForTimeout(400);
    expect(await steps(stepReadout)).toBe(paused);
    await example.getByLabel('Pause scene').uncheck();
    await expect.poll(() => steps(stepReadout)).toBeGreaterThan(paused);

    // A label reports enter and a click from the label, and selects as usual.
    const charger = page.getByRole('button', { name: 'Select Charger' });
    await charger.hover();
    await expect(hover).toHaveText('Pointer over: charger');
    await charger.click();
    await expect(click).toContainText('Last click: charger at');
    await expect(click).toContainText('(label, mouse)');
    await expect(charger).toHaveClass(/kit-node-selected/);

    // A click on open ground in front of the zones sends the robot and prevents the default selection change. Selecting
    // the charger moved the camera toward it, so the point sits between the view centre and the bottom edge, where the
    // yard (28 × 16 m) still covers the floor; a zone is floor too.
    const box = (await sceneCanvas(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * .5, box.y + box.height * .66);
    await expect(click).toContainText(/Last click: (yard|charging-zone|storage-zone) at/);
    await expect(click).toContainText('(canvas, mouse) · robot sent');
    await expect(charger).toHaveClass(/kit-node-selected/);
  }
  // Every adapter switch disposed the previous renderer, which ran the plugin cleanup; unmounting runs the last one.
  await expect(lifecycle).toHaveText('Plugin setups: 3 · cleanups: 2');
  await example.getByRole('button', { name: 'Unmount scene' }).click();
  await expect(lifecycle).toHaveText('Plugin setups: 3 · cleanups: 3');
  await page.screenshot({ path: 'artifacts/engine-hooks.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('the fixed-step clock keeps counting with motion off', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  await page.goto('/examples/engine-hooks');
  const example = page.getByRole('region', { name: 'Engine hooks example' }), stepReadout = example.locator('.engine-step-readout');
  await expect(example.locator('.engine-load-status')).toHaveText('Scene loaded', { timeout: ciScaled(30000) });
  await example.getByLabel('Scene motion').uncheck();
  const before = await steps(stepReadout);
  await expect.poll(() => steps(stepReadout)).toBeGreaterThan(before + 5);
});

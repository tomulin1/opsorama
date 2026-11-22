import { ciScaled, expect, sceneCanvas, test } from './fixtures';

test('camera example switches projection, turns the view and runs interruptible transitions in each adapter', async ({ page }) => {
  test.setTimeout(ciScaled(120000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cameras');
  const example = page.getByRole('region', { name: 'Camera example' });
  const readout = example.locator('.camera-readout'), moves = example.getByRole('list', { name: 'Camera moves' });
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(sceneCanvas(page)).toHaveCount(1);
    await example.getByRole('button', { name: 'Reset camera', exact: true }).click();
    // The default camera: orthographic, from offset [16, 22, 30] (yaw 28.1°, pitch 32.9°) over the yard's centre.
    await expect(readout).toContainText('orthographic · target 0.0, 0.0, 0.0 · yaw 28.1° · pitch 32.9° · zoom 1.00');
    const overview = await readout.textContent();

    // A timed move to a node reports completion and moves the view; the overview move returns to it.
    await example.getByLabel('Transition seconds').fill('0.4');
    await example.getByRole('button', { name: 'Go to Forklift', exact: true }).click();
    await expect(moves.getByRole('listitem').first()).toHaveText('Forklift: completed');
    await expect(readout).not.toHaveText(overview!);
    await example.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(moves.getByRole('listitem').first()).toHaveText('Overview: completed');
    await expect(readout).toHaveText(overview!);

    // A new move interrupts a running one where it is.
    await example.getByLabel('Transition seconds').fill('3');
    await example.getByRole('button', { name: 'Go to Truck', exact: true }).click();
    await example.getByRole('button', { name: 'Go to Loading dock', exact: true }).click();
    await expect(moves.getByRole('listitem').first()).toHaveText('Truck: interrupted');
    await expect(moves.getByRole('listitem').first()).toHaveText('Loading dock: completed', { timeout: ciScaled(10000) });

    // Projection and direction come from the camera settings; switching keeps the target.
    await example.getByLabel('Camera projection').selectOption('perspective');
    await expect(readout).toContainText('perspective');
    await example.getByLabel('Camera yaw').fill('90');
    await expect(readout).toContainText('yaw 90.0°');
    await example.getByLabel('Camera field of view').fill('60');
    await expect(example.locator('.docs-code-block code')).toContainText('fov: 60');
    await example.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(moves.getByRole('listitem').first()).toHaveText('Overview: completed', { timeout: ciScaled(10000) });
    await expect(readout).toContainText('perspective · target 0.0, 0.0, 0.0 · yaw 90.0°');
  }
  // Reduced motion turns every move into a cut.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await example.getByRole('button', { name: 'Go to Shipping container', exact: true }).click();
  await expect(moves.getByRole('listitem').first()).toHaveText('Shipping container: completed', { timeout: 1000 });
  await page.screenshot({ path: 'artifacts/cameras.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('a drag interrupts a running camera transition', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  await page.goto('/examples/cameras');
  const example = page.getByRole('region', { name: 'Camera example' }), moves = example.getByRole('list', { name: 'Camera moves' });
  await expect(example.locator('.camera-readout')).toContainText('orthographic');
  await example.getByLabel('Transition seconds').fill('3');
  await example.getByRole('button', { name: 'Go to Truck', exact: true }).click();
  // Press on open ground, away from labels, and drag past the 5 px threshold.
  const box = (await sceneCanvas(page).boundingBox())!, x = box.x + box.width * .78, y = box.y + box.height * .85;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x - 60, y - 20, { steps: 4 }); await page.mouse.up();
  await expect(moves.getByRole('listitem').first()).toHaveText('Truck: interrupted');
});

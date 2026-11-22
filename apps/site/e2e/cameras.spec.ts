import { ciScaled, expect, sceneCanvas, test, type Page } from './fixtures';

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

/**
 * Drags on the canvas with the given button, from the first of a few points near the front right of the scene where no
 * label covers the canvas (a following camera moves the labels).
 */
async function dragGround(page: Page, dx: number, dy: number, button: 'left' | 'right' = 'left') {
  const box = (await sceneCanvas(page).boundingBox())!;
  const [x, y] = await page.evaluate(({ left, top, width, height }) => {
    const points = [[.78, .85], [.7, .9], [.86, .78], [.6, .8], [.9, .6]].map(([fx, fy]) => [left + width * fx, top + height * fy]);
    return points.find(([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS') ?? points[0];
  }, { left: box.x, top: box.y, width: box.width, height: box.height });
  await page.mouse.move(x, y); await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 4 }); await page.mouse.up({ button });
}

test('orbit controls turn the view around its target with a right drag or a Ctrl drag', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  await page.goto('/examples/cameras');
  const example = page.getByRole('region', { name: 'Camera example' }), readout = example.locator('.camera-readout');
  await expect(readout).toContainText('target 0.0, 0.0, 0.0 · yaw 28.1° · pitch 32.9°');
  // Pan controls ignore the right button.
  await dragGround(page, -80, -30, 'right');
  await expect(readout).toContainText('target 0.0, 0.0, 0.0 · yaw 28.1° · pitch 32.9°');
  await example.getByLabel('Orbit controls').check();
  await expect(example.locator('.docs-code-block code')).toContainText("controls: 'orbit'");
  // Dragging left turns the scene left (yaw grows); dragging up lowers the camera (pitch falls). The target stays.
  await dragGround(page, -80, -30, 'right');
  await expect(readout).not.toContainText('yaw 28.1°');
  await expect(readout).not.toContainText('pitch 32.9°');
  await expect(readout).toContainText('target 0.0, 0.0, 0.0');
  const turned = await readout.textContent();
  await page.keyboard.down('Control'); await dragGround(page, 60, 0); await page.keyboard.up('Control');
  await expect(readout).not.toHaveText(turned!);
  await expect(readout).toContainText('target 0.0, 0.0, 0.0');
});

test('the camera follows a route-driven node and plays a camera path in each adapter', async ({ page }) => {
  test.setTimeout(ciScaled(180000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cameras');
  const example = page.getByRole('region', { name: 'Camera example' }), readout = example.locator('.camera-readout');
  const moves = example.getByRole('list', { name: 'Camera moves' }), latest = moves.getByRole('listitem').first(), status = example.locator('.camera-follow-status');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(sceneCanvas(page)).toHaveCount(1);
    const follow = example.getByRole('button', { name: 'Follow Mobile robot', exact: true });
    await expect(follow).toBeEnabled();
    await follow.click();
    await expect(status).toHaveText('Following Mobile robot');
    // The target keeps moving with the robot on its loop.
    for (let check = 0; check < 2; check++) {
      const before = await readout.textContent();
      await expect.poll(() => readout.textContent(), { timeout: ciScaled(5000) }).not.toBe(before);
    }
    // A pan ends following.
    await dragGround(page, -60, -20);
    await expect(latest).toHaveText('Follow: interrupted');
    await expect(status).toHaveText('Camera free');
    // Following from behind turns the camera toward the robot's heading; stopping reports it.
    await example.getByRole('button', { name: 'Follow from behind', exact: true }).click();
    await expect(status).toHaveText('Following Mobile robot from behind');
    await expect(readout).not.toContainText('yaw 28.1°', { timeout: ciScaled(5000) });
    await example.getByRole('button', { name: 'Stop following', exact: true }).click();
    await expect(latest).toHaveText('Follow: stopped');

    // The tour plays to completion; a stopped tour reports that it was interrupted.
    await example.getByRole('button', { name: 'Play tour', exact: true }).click();
    await expect(status).toHaveText('Playing tour');
    await expect(latest).toHaveText('Tour: completed', { timeout: ciScaled(20000) });
    await expect(status).toHaveText('Camera free');
    await example.getByRole('button', { name: 'Play tour', exact: true }).click();
    await example.getByRole('button', { name: 'Stop tour', exact: true }).click();
    await expect(latest).toHaveText('Tour: interrupted');
    // A new move interrupts a playing tour too.
    await example.getByRole('button', { name: 'Play tour', exact: true }).click();
    await example.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(latest).toHaveText('Overview: completed', { timeout: ciScaled(10000) });
    await expect(moves.getByRole('listitem').nth(1)).toHaveText('Tour: interrupted');
  }
  // With reduced motion the tour cuts from keyframe to keyframe and still completes on its timing.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await example.getByRole('button', { name: 'Play tour', exact: true }).click();
  await expect(latest).toHaveText('Tour: completed', { timeout: ciScaled(20000) });
  expect(errors).toEqual([]);
});

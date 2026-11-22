import type { CDPSession } from '@playwright/test';
import { ciScaled, expect, sceneCanvas, test, type Page } from './fixtures';

// A phone-sized touch screen. Chromium only: the gestures go through the DevTools protocol, so the browser turns real
// touch input into the pointer events the renderer handles (synthetic PointerEvents cannot take pointer capture).
test.use({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true });

type Point = { x: number; y: number };

/**
 * Finds a centre on the canvas where every given offset (CSS pixels from the centre) lands on the canvas itself, not on a
 * label, so each finger's pointerdown reaches the renderer. Scrolls the canvas into view first.
 */
async function canvasCentre(page: Page, offsets: readonly Point[]): Promise<Point> {
  await sceneCanvas(page).scrollIntoViewIfNeeded();
  return sceneCanvas(page).evaluate((canvas, fingers) => {
    const bounds = canvas.getBoundingClientRect();
    const candidates = [[.5, .75], [.5, .6], [.35, .8], [.65, .8], [.5, .45], [.3, .6], [.7, .6]];
    for (const [fx, fy] of candidates) {
      const x = bounds.left + bounds.width * fx, y = bounds.top + bounds.height * fy;
      if (fingers.every(finger => document.elementFromPoint(x + finger.x, y + finger.y) === canvas)) return { x, y };
    }
    throw new Error('No canvas point where every finger lands on the canvas.');
  }, offsets);
}

/** Touches with one finger per entry of `at(0)`, moves them through `at(k)` for k from 0 to 1 in `steps`, and lifts them. */
async function touchGesture(cdp: CDPSession, at: (k: number) => readonly Point[], steps = 10) {
  const points = (k: number) => at(k).map((point, id) => ({ x: point.x, y: point.y, id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let step = 1; step <= steps; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(step / steps) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('touch gestures are off by default and, when enabled, pan, pinch-zoom and orbit in each adapter', async ({ page }) => {
  test.setTimeout(ciScaled(180000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cameras');
  const example = page.getByRole('region', { name: 'Camera example' }), readout = example.locator('.camera-readout');
  const overviewText = 'target 0.0, 0.0, 0.0 · yaw 28.1° · pitch 32.9° · zoom 1.00';
  const cdp = await page.context().newCDPSession(page);
  await expect(readout).toContainText(overviewText);

  // Default: the canvas leaves touch with the page, so a one-finger drag does not move the camera.
  await expect(sceneCanvas(page)).toHaveCSS('touch-action', 'auto');
  let centre = await canvasCentre(page, [{ x: 0, y: 0 }]);
  await touchGesture(cdp, k => [{ x: centre.x - 60 * k, y: centre.y - 30 * k }]);
  await expect(readout).toContainText(overviewText);

  await example.getByLabel('Touch gestures').check();
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(sceneCanvas(page)).toHaveCount(1);
    await expect(sceneCanvas(page)).toHaveCSS('touch-action', 'none');
    await expect(example.getByRole('button', { name: 'Overview', exact: true })).toBeEnabled();
    await expect(readout).toContainText(overviewText);

    // One finger pans: the target moves, direction and zoom stay.
    centre = await canvasCentre(page, [{ x: 0, y: 0 }]);
    await touchGesture(cdp, k => [{ x: centre.x - 80 * k, y: centre.y - 40 * k }]);
    await expect(readout).not.toContainText('target 0.0, 0.0, 0.0');
    await expect(readout).toContainText('yaw 28.1° · pitch 32.9° · zoom 1.00');

    // Two fingers spreading apart zoom in.
    centre = await canvasCentre(page, [{ x: -40, y: 0 }, { x: 40, y: 0 }]);
    await touchGesture(cdp, k => [{ x: centre.x - 40 - 50 * k, y: centre.y }, { x: centre.x + 40 + 50 * k, y: centre.y }]);
    await expect(readout).not.toContainText('zoom 1.00');
    await expect(readout).toContainText('yaw 28.1° · pitch 32.9°');
  }

  // With orbit controls a two-finger twist turns the yaw and a two-finger vertical drag the pitch.
  await example.getByLabel('Orbit controls').check();
  await example.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(readout).toContainText('yaw 28.1° · pitch 32.9°');
  const radius = 50;
  centre = await canvasCentre(page, [{ x: -radius, y: 0 }, { x: radius, y: 0 }]);
  await touchGesture(cdp, k => {
    const angle = k * .8;
    return [{ x: centre.x - radius * Math.cos(angle), y: centre.y - radius * Math.sin(angle) }, { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) }];
  }, 16);
  await expect(readout).not.toContainText('yaw 28.1°');
  await expect(readout).toContainText('pitch 32.9°');
  const twisted = await readout.textContent();
  centre = await canvasCentre(page, [{ x: -40, y: 0 }, { x: 40, y: 0 }]);
  await touchGesture(cdp, k => [{ x: centre.x - 40, y: centre.y - 60 * k }, { x: centre.x + 40, y: centre.y - 60 * k }]);
  await expect(readout).not.toContainText('pitch 32.9°');
  expect(await readout.textContent()).not.toBe(twisted);
  await page.screenshot({ path: 'artifacts/touch-gestures.png', fullPage: true });
  expect(errors).toEqual([]);
});

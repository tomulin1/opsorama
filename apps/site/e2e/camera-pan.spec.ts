import { expect, sceneCanvas, test, type Page } from './fixtures';

async function dragCanvas(page: Page, dx: number, dy: number) {
  // Start on the first canvas point that no floating panel or label covers, scanning from the top-left corner.
  const { x, y } = await sceneCanvas(page).evaluate((canvas, offset) => {
    const bounds = canvas.getBoundingClientRect();
    for (let row = 25; row < bounds.height - offset.dy - 25; row += 20) for (let column = 25; column < bounds.width - offset.dx - 25; column += 20) {
      const x = bounds.left + column, y = bounds.top + row;
      if (document.elementFromPoint(x, y) === canvas && document.elementFromPoint(x + offset.dx, y + offset.dy) === canvas) return { x, y };
    }
    throw new Error('No uncovered canvas point to drag from.');
  }, { dx, dy });
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}

test('e-commerce supports dragging without changing the inspected dock', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/examples/ecommerce', { waitUntil: 'domcontentloaded' }); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  // Extra panels start closed; the metric card opens the docks. The inspected dock shows its label, which follows the scene.
  await page.getByRole('button', { name: 'Open docks and carrier cut-offs', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect dock D2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dock D2', exact: true })).toBeVisible();
  const dock = page.locator('.kit-node-label[data-node-id="dock:D2"]');
  await expect(dock).toHaveAttribute('style', /translate/);
  // The camera frames the dock; wait until it stands still.
  let last = Number.NaN;
  await expect.poll(async () => { const x = (await dock.boundingBox())!.x, still = Math.abs(x - last) < .5; last = x; return still; }).toBe(true);
  const selectedX = (await dock.boundingBox())!.x;
  await dragCanvas(page, 80, 40);
  await expect.poll(async () => Math.abs((await dock.boundingBox())!.x - selectedX - 80)).toBeLessThan(2);
  await expect(page.getByRole('heading', { name: 'Dock D2', exact: true })).toBeVisible();
  // Overview moves the camera back, away from the dragged view.
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect.poll(async () => Math.abs((await dock.boundingBox())!.x - selectedX - 80)).toBeGreaterThan(5);
});

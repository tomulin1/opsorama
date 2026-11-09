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

test('e-commerce supports dragging without changing the inspected order', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/examples/ecommerce', { waitUntil: 'domcontentloaded' }); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const storage = page.locator('.kit-node-label[data-node-id="pin:storage"]');
  await expect(storage).toHaveAttribute('style', /translate/); const overviewX = (await storage.boundingBox())!.x;
  // Extra panels start closed; the metric card opens the order list.
  await page.getByRole('button', { name: 'Open order list', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect order #50419', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order #50419', exact: true })).toBeVisible();
  await expect.poll(async () => Math.abs((await storage.boundingBox())!.x - overviewX)).toBeGreaterThan(5);
  const selectedX = (await storage.boundingBox())!.x;
  await dragCanvas(page, 80, 40);
  await expect.poll(async () => Math.abs((await storage.boundingBox())!.x - selectedX - 80)).toBeLessThan(2);
  await expect(page.getByRole('heading', { name: 'Order #50419', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect.poll(async () => Math.abs((await storage.boundingBox())!.x - overviewX)).toBeLessThan(2);
});

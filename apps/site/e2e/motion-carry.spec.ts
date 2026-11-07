import { expect, test } from './fixtures';

test('pickers carry order parcels from the shelf to the packing bench in every adapter', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/motion');
  await expect(page.locator('.adapter-example-surface canvas')).toHaveCount(1);
  const carrying = page.locator('.motion-agents tbody td:last-child', { hasText: 'order-' });
  const events = page.locator('.motion-events li');
  await page.getByLabel('Speed').selectOption('2');
  await expect(carrying.first()).toBeVisible({ timeout: 40_000 });
  await page.screenshot({ path: 'artifacts/motion-carry-react.png' });
  await expect(events.filter({ hasText: 'put down' }).first()).toBeVisible({ timeout: 40_000 });
  for (const adapter of ['Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(page.locator('.adapter-example-surface canvas')).toHaveCount(1);
    await expect(carrying.first()).toBeVisible({ timeout: 40_000 });
    await page.screenshot({ path: `artifacts/motion-carry-${adapter.toLowerCase()}.png` });
  }
  expect(errors).toEqual([]);
});

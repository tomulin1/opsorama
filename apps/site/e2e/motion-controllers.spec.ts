import { ciScaled, expect, test } from './fixtures';

test('controller-driven robots run in every adapter and follow host targets', async ({ page }) => {
  test.setTimeout(ciScaled(120_000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const consoleErrors: string[] = []; page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('/examples/motion');
  const canvas = page.locator('.adapter-example-surface canvas');
  await expect(canvas).toHaveCount(1);
  await page.getByLabel('Speed').selectOption('2');
  const send = page.getByRole('button', { name: /^Send delivery robot to/ });
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click();
    await expect(canvas).toHaveCount(1);
    await send.click();
    await expect(page.getByRole('status').filter({ hasText: 'Delivery robot target' })).toBeVisible();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `artifacts/motion-controllers-${adapter.toLowerCase()}.png` });
  }
  // Motion off settles controllers at their confirmed pose without errors.
  await page.getByLabel('Motion').uncheck();
  await send.click();
  await page.waitForTimeout(500);
  await page.getByLabel('Motion').check();
  expect(errors).toEqual([]);
  expect(consoleErrors.filter(text => /controller/i.test(text))).toEqual([]);
  await expect(page.locator('.kit-scene-error')).toHaveCount(0);
});

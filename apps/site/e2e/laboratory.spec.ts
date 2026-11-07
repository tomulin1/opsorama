import { ciScaled, expect, test } from './fixtures';

test('laboratory catalog exposes bounded trays and static desks', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects'); await page.getByRole('button', { name: 'Laboratory', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Explore / })).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Explore Feature tool crate', exact: true })).toHaveCount(0);
  await page.goto('/docs/objects/lab-workstation'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Object animation')).toHaveCount(0);
  await page.getByLabel('Object count', { exact: true }).focus(); await page.keyboard.press('End'); await expect(page.getByLabel('Object count', { exact: true })).toHaveValue('9');
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click(); await expect(page.locator('.docs-code-block pre')).toContainText('"count": 9');
  await page.getByLabel('Object variant').selectOption('empty');
  await page.getByLabel('Preview environment').selectOption('midnight');
  await page.getByRole('button', { name: 'Select object', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Object selected');
  await page.screenshot({ path: 'artifacts/lab-workstation.png', fullPage: true });
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';

test.describe('move mode', () => {
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    test(`${adapter}: a target in the HTML list moves a unit`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/examples/move-mode');
      await page.getByRole('button', { name: adapter, exact: true }).click();
      await expect(page.locator('.datacenter-canvas canvas')).toBeVisible();
      await page.getByRole('button', { name: 'Tote 1', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Moving Tote 1');
      await page.getByRole('button', { name: 'Pallet B, deck, layer 1, position 1' }).click();
      await expect(page.getByRole('status')).toContainText('Select a parcel');
      await expect(page.locator('.move-mode-log li').first()).toContainText('moved');
      expect(errors).toEqual([]);
    });
  }

  test('Escape leaves move mode', async ({ page }) => {
    await page.goto('/examples/move-mode');
    await expect(page.locator('.datacenter-canvas canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Pallet A', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Moving Pallet A');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('status')).toContainText('Select a parcel');
  });
});

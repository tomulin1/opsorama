import { ciScaled, expect, test } from './fixtures';

test('Cut-off plays receiving, put-away, replenishing, restocking and shipping through menus, then reaches the report', async ({ page }) => {
  test.setTimeout(ciScaled(150000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cutoff', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toHaveCount(1);
  const summary = page.getByRole('region', { name: 'Shift summary', exact: true }), toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  const message = summary.getByRole('status');
  // The shift waits on its briefing; starting it runs the clock.
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toContainText('Peak');
  await expect(page.getByRole('timer', { name: 'Shift clock' })).toHaveText('10:00');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Speed 3×', exact: true }).click();

  // Receiving: the dock's menu commands the forklift, which unloads until the truck is empty.
  await summary.getByRole('region', { name: 'Receiving', exact: true }).getByRole('button', { name: 'Dock D1', exact: true }).click();
  await page.getByRole('menu', { name: 'Menu of Dock D1' }).getByRole('menuitem', { name: /Forklift: Unload the truck/ }).click();
  await expect(message).toHaveText('Forklift: Unload the truck at D1.');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Put-away: a staged pallet's menu opens its targets; "Choose in the scene…" lights them, Escape goes back to the list.
  await summary.getByRole('group', { name: 'Pallets in staging' }).getByRole('button').first().click();
  await page.getByRole('menuitem', { name: /Reach truck: Put away/ }).click();
  const targets = page.getByRole('menu', { name: /^Targets: Reach truck: Put away/ });
  await targets.getByRole('menuitem', { name: /Choose in the scene/ }).click();
  await expect(page.getByRole('status', { name: 'Choosing a target' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('status', { name: 'Choosing a target' })).toHaveCount(0);
  await targets.getByRole('menuitem').first().click();
  await expect(message).toContainText('Reach truck: Put pallet');

  // Replenishing: the low pick face offers a reserve pallet for the reach truck and the decant, which waits for it.
  const stock = summary.getByRole('region', { name: 'Stock', exact: true });
  await stock.getByRole('button', { name: 'F3', exact: true }).click();
  await page.getByRole('menu', { name: 'Menu of F3' }).getByRole('menuitem', { name: /Reach truck: Bring behind its pick face/ }).first().click();
  await expect(message).toContainText('Reach truck: Bring pallet');
  await stock.getByRole('button', { name: 'F3', exact: true }).click();
  await page.getByRole('menu', { name: 'Menu of F3' }).getByRole('menuitem', { name: /Replenisher: Fill the lanes/ }).click();
  await expect(message).toHaveText('Replenisher: Fill F3 from its pallet.');

  // Restocking: the shelf filler takes cartons from the same face to a department it supplies.
  await stock.getByRole('button', { name: 'F3', exact: true }).click();
  await page.getByRole('menu', { name: 'Menu of F3' }).getByRole('menuitem', { name: /Shelf filler: Restock the shop/ }).click();
  await page.getByRole('menu', { name: /^Targets: Shelf filler/ }).getByRole('menuitem').first().click();
  await expect(message).toContainText('Shelf filler: Restock');

  // Shipping: the dispatcher works by itself from its own menu, and the outbound dock's menu sends the SwiftPost truck.
  await summary.getByRole('button', { name: /^Dispatch:/ }).click();
  await page.getByRole('menu', { name: 'Commands of Dispatch' }).getByRole('menuitemcheckbox', { name: /Work by yourself/ }).click();
  await expect(message).toHaveText('Dispatch works by itself without a command.');
  await summary.getByRole('region', { name: 'Shipping', exact: true }).getByRole('button', { name: 'At D3', exact: true }).click();
  await page.getByRole('menu', { name: 'Menu of Dock D3' }).getByRole('menuitem', { name: /Send the SwiftPost truck now/ }).click();
  await expect(message).toHaveText('The SwiftPost truck leaves once no cage is on its way.');

  // The short pick of the peak opens over its pick face about 20 minutes into the shift.
  const event = page.getByRole('article', { name: 'Short pick', exact: true });
  await expect(event).toBeVisible({ timeout: ciScaled(45000) });
  await event.getByRole('button', { name: /Cancel the order/ }).click();
  await expect(event).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Detail', exact: true }).getByRole('region', { name: 'Score', exact: true })).toContainText('Event decisions');

  // Finish the shift and read the report.
  await toolbar.getByRole('button', { name: 'Finish shift', exact: true }).click();
  const report = page.getByRole('region', { name: 'End of shift report', exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText('18:00');
  await expect(report).toContainText('SwiftPost');
  await expect(report).toContainText('pallets put away');
  await page.screenshot({ path: 'artifacts/cutoff-report.png' });
  await report.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toBeVisible();
  expect(errors).toEqual([]);
});

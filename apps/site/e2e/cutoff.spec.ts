import { ciScaled, expect, test } from './fixtures';

test('Cut-off commands the crew in three steps (actor, source, target) for every process, then reaches the report', async ({ page }) => {
  test.setTimeout(ciScaled(150000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cutoff', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toHaveCount(1);
  const summary = page.getByRole('region', { name: 'Shift summary', exact: true }), toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  const message = summary.getByRole('status'), step = page.getByRole('status', { name: 'Giving a command' });
  // One command: the actor's portrait, a source from its menu (or a panel button), then a target from the next menu.
  const commandActor = async (actor: string) => {
    await summary.getByRole('button', { name: new RegExp(`^${actor}:`) }).click();
    await expect(page.getByRole('menu', { name: `Commands of ${actor}` })).toBeVisible();
  };
  const take = async (actor: string, source: RegExp) => page.getByRole('menu', { name: `Commands of ${actor}` }).getByRole('menuitem', { name: source }).first().click();
  const bring = async (target: RegExp) => page.getByRole('menu', { name: /^Targets for / }).getByRole('menuitem', { name: target }).first().click();

  // The shift waits on its briefing; commands work while the shift is paused, which keeps the software-rendered run ahead of
  // SwiftPost's 11:30 cut-off.
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toContainText('Peak');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Pause shift', exact: true }).click();

  // Receiving: the forklift takes the truck at D1 to the staging lane.
  await commandActor('Forklift');
  await expect(step).toContainText('click a lit object to take');
  await take('Forklift', /^Dock D1/);
  await bring(/Staging lane/);
  await expect(message).toHaveText('Forklift: Unload the truck at D1.');

  // Put-away: the reach truck takes a staged pallet from the panel; Escape goes back to its sources, then a target is picked.
  await commandActor('Reach truck');
  await summary.getByRole('group', { name: 'Pallets in staging' }).getByRole('button').first().click();
  await expect(page.getByRole('menu', { name: /^Targets for Pallet/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Commands of Reach truck' })).toBeVisible();
  await take('Reach truck', /staging/);
  await bring(/level/);
  await expect(message).toContainText('Reach truck: Put pallet');

  // Replenishing: the reach truck brings a reserve pallet of the short SKU behind F3, and the replenisher fills F3 from it.
  await take('Reach truck', /OUT-215 · rack/);
  await bring(/Behind F3/);
  await expect(message).toContainText('Reach truck: Bring pallet');
  await commandActor('Replenisher');
  await take('Replenisher', /F3 lanes/);
  await bring(/F3 lanes/);
  await expect(message).toHaveText('Replenisher: Fill F3 from its pallet.');

  // Restocking: the shelf filler takes cartons from F3 to Outdoor.
  await commandActor('Shelf filler');
  await take('Shelf filler', /F3 lanes/);
  await bring(/Outdoor/);
  await expect(message).toHaveText('Shelf filler: Restock Outdoor.');

  // Shipping: the dispatcher works by itself from its menu, and the panel sends the SwiftPost truck.
  await commandActor('Dispatch');
  await page.getByRole('menu', { name: 'Commands of Dispatch' }).getByRole('menuitemcheckbox', { name: /Work by yourself/ }).click();
  await expect(message).toHaveText('Dispatch works by itself without a command.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await summary.getByRole('region', { name: 'Shipping', exact: true }).getByRole('button', { name: 'Send the SwiftPost truck now', exact: true }).click();
  await expect(message).toHaveText('The SwiftPost truck leaves once no cage is on its way.');

  // The short pick of the peak opens over its pick face about 20 minutes into the shift.
  await expect(page.getByRole('timer', { name: 'Shift clock' })).toHaveText('10:00');
  await toolbar.getByRole('button', { name: 'Resume shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Speed 3×', exact: true }).click();
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

import { ciScaled, expect, test } from './fixtures';

test('Cut-off commands the crew from a card with Move, tinted sources and Take and Bring here pills for the keyboard for every process, folds the shift panel into the bar, then reaches the report', async ({ page }) => {
  test.setTimeout(ciScaled(150000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cutoff', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toHaveCount(1);
  const summary = page.getByRole('region', { name: 'Shift summary', exact: true }), toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  const message = summary.getByRole('status'), step = page.getByRole('status', { name: 'Giving a command' });
  // One command: the actor's portrait opens its action ring, a Take pill over a source, then a Bring here pill over a target.
  // The pills stand over scene nodes, which may lie outside the visible part of the canvas, so they are clicked by event.
  // The ring over an actor is placed by the renderer's first frames, which software rendering may take a while to draw.
  const ring = (actor: string) => page.getByRole('toolbar', { name: `Commands of ${actor}` });
  const commandActor = async (actor: string) => {
    await summary.getByRole('button', { name: new RegExp(`^${actor}:`) }).click();
    await expect(ring(actor)).toBeVisible({ timeout: ciScaled(20000) });
  };
  // Move on the actor's card lights what it can take.
  const startMove = async (actor: string) => ring(actor).getByRole('button', { name: 'Move', exact: true }).dispatchEvent('click');
  const take = async (source: RegExp) => page.getByRole('button', { name: source }).first().dispatchEvent('click');
  const bring = async (target: RegExp) => page.getByRole('button', { name: target }).first().dispatchEvent('click');

  // The shift waits on its briefing; commands work while the shift is paused, which keeps the software-rendered run ahead of
  // SwiftPost's 11:30 cut-off.
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toContainText('Peak');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Pause shift', exact: true }).click();

  // Receiving: the forklift takes the truck at D1 to the staging lane.
  await commandActor('Forklift');
  await expect(step).toHaveCount(0);
  await startMove('Forklift');
  await expect(ring('Forklift').getByRole('button', { name: 'Move', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(step).toContainText('click a tinted object to take');
  await take(/^Take Dock D1/);
  await bring(/^Bring here: Staging lane/);
  await expect(message).toHaveText('Forklift: Unload the truck at D1.');

  // Put-away: the reach truck takes a staged pallet from the panel; Escape goes back to its sources, then a target is picked.
  await commandActor('Reach truck');
  await startMove('Reach truck');
  await summary.getByRole('group', { name: 'Pallets in staging' }).getByRole('button').first().click();
  await expect(page.getByRole('button', { name: /^Bring here: R\d+ · level/ }).first()).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Bring here:/ })).toHaveCount(0);
  await take(/^Take Pallet \d+ · [A-Z]+-\d+ · staging/);
  await bring(/^Bring here: R\d+ · level/);
  await expect(message).toContainText('Reach truck: Put pallet');

  // Replenishing: the reach truck brings a reserve pallet of the short SKU behind F3, and the replenisher fills F3 from it.
  // After a queued move the card stays open, and Move lights the sources again.
  await startMove('Reach truck');
  await take(/^Take Pallet \d+ · OUT-215 · rack/);
  await bring(/^Bring here: Behind F3/);
  await expect(message).toContainText('Reach truck: Bring pallet');
  await commandActor('Replenisher');
  await startMove('Replenisher');
  await take(/^Take F3 lanes/);
  await bring(/^Bring here: F3 lanes/);
  await expect(message).toHaveText('Replenisher: Fill F3 from its pallet.');

  // Restocking: the shelf filler takes cartons from F3 to Outdoor.
  await commandActor('Shelf filler');
  await startMove('Shelf filler');
  await take(/^Take F3 lanes/);
  await bring(/^Bring here: Outdoor/);
  await expect(message).toHaveText('Shelf filler: Restock Outdoor.');

  // Dispatch: the dispatcher works by itself from its action ring, and the sales channels send the SwiftPost truck.
  await commandActor('Dispatch');
  await ring('Dispatch').getByRole('switch', { name: 'Work by yourself', exact: true }).dispatchEvent('click');
  await expect(message).toHaveText('Dispatch works by itself without a command.');
  await expect(ring('Dispatch').getByRole('switch', { name: 'Work by yourself', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('toolbar', { name: /^Commands of/ })).toHaveCount(0);
  const channels = summary.getByRole('region', { name: 'Sales channels', exact: true });
  await expect(channels).toContainText('Parcel lockers');
  await channels.getByRole('button', { name: 'Send the SwiftPost truck now', exact: true }).click();
  await expect(message).toHaveText('The SwiftPost truck leaves once no cage is on its way to it.');

  // The shift panel folds into the bottom bar, whose tab with the score opens it again.
  await summary.getByRole('button', { name: 'Fold the shift panel into the bottom bar', exact: true }).click();
  await expect(summary).toHaveCount(0);
  await toolbar.getByRole('button', { name: /^Open the shift panel, score \d+$/ }).click();
  await expect(summary).toBeVisible();

  // The shift runs: shoppers pay at the checkouts, which scores.
  await expect(page.getByRole('timer', { name: 'Shift clock' })).toHaveText('10:00');
  await toolbar.getByRole('button', { name: 'Resume shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Speed 3×', exact: true }).click();
  await expect(channels).not.toContainText('0 items · 0 points', { timeout: ciScaled(45000) });

  // Finish the shift and read the report.
  await toolbar.getByRole('button', { name: 'Finish shift', exact: true }).click();
  const report = page.getByRole('region', { name: 'End of shift report', exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText('18:00');
  await expect(report).toContainText('Shop checkouts');
  await expect(report).toContainText('Delivery bike');
  await expect(report).toContainText('pallets put away');
  await page.screenshot({ path: 'artifacts/cutoff-report.png' });
  await report.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toBeVisible();
  expect(errors).toEqual([]);
});

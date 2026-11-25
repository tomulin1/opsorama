import { ciScaled, expect, test } from './fixtures';

test('Cut-off plays a short scripted shift from the briefing to the report', async ({ page }) => {
  test.setTimeout(ciScaled(120000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cutoff', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toHaveCount(1);
  const crew = page.getByRole('region', { name: 'Crew commands', exact: true }), toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  // The shift waits on its briefing; starting it runs the clock.
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toContainText('Peak');
  await expect(page.getByRole('timer', { name: 'Shift clock' })).toHaveText('10:00');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Speed 3×', exact: true }).click();

  // Selecting an actor offers no move for it; switching on its assist makes it work by itself.
  await crew.getByRole('button', { name: 'Select Forklift', exact: true }).click();
  await expect(crew.getByRole('region', { name: 'Selection', exact: true })).toContainText('No move of material for forklift');
  for (const actor of ['Forklift', 'Reach truck', 'Dispatch']) {
    const assist = crew.getByRole('button', { name: `Let ${actor} work by itself`, exact: true });
    await assist.click();
    await expect(assist).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(crew.getByRole('region', { name: 'Actors', exact: true })).toContainText('Unloading PO-7779', { timeout: ciScaled(20000) });
  // Send the SwiftPost truck before its cut-off.
  await crew.getByRole('button', { name: 'Send the SwiftPost truck', exact: true }).click();
  await expect(crew).toContainText('The SwiftPost truck leaves once no cage is on its way.');

  // Answer the first event: the short pick of the peak opens 20 minutes into the shift.
  const event = page.getByRole('article', { name: 'Short pick', exact: true });
  await expect(event).toBeVisible({ timeout: ciScaled(45000) });
  await event.getByRole('button', { name: /Cancel the order/ }).click();
  await expect(event).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Events and score', exact: true }).getByRole('region', { name: 'Score', exact: true })).toContainText('Event decisions');

  // Finish the shift and read the report.
  await toolbar.getByRole('button', { name: 'Finish shift', exact: true }).click();
  const report = page.getByRole('region', { name: 'End of shift report', exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText('18:00');
  await expect(report).toContainText('SwiftPost');
  await page.screenshot({ path: 'artifacts/cutoff-report.png' });
  await report.getByRole('button', { name: 'Play again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toBeVisible();
  expect(errors).toEqual([]);
});

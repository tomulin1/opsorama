import { ciScaled, expect, test } from './fixtures';

test('Cut-off plays a short scripted shift from the briefing to the report', async ({ page }) => {
  test.setTimeout(ciScaled(120000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/cutoff', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('canvas')).toHaveCount(1);
  const commands = page.getByRole('region', { name: 'Shift commands', exact: true }), toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  // The shift waits on its briefing; starting it runs the clock.
  await expect(page.getByRole('region', { name: 'Shift briefing' })).toContainText('Peak');
  await expect(page.getByRole('timer', { name: 'Shift clock' })).toHaveText('10:00');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();
  await toolbar.getByRole('button', { name: 'Speed 3×', exact: true }).click();

  // Assign a person: select a packer, then a zone.
  await commands.getByRole('button', { name: 'Select Packer K3', exact: true }).click();
  await commands.getByRole('button', { name: 'Send Packer K3 to Shop restocking', exact: true }).click();
  await expect(commands).toContainText('Packer K3 goes to shop restocking after the current task.');
  // Prioritize a carrier and open a checkout.
  await commands.getByRole('button', { name: 'Put SwiftPost first', exact: true }).click();
  await expect(commands.getByRole('button', { name: 'Put SwiftPost first', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await commands.getByRole('button', { name: 'Open checkout 3', exact: true }).click();
  await expect(commands.getByRole('button', { name: 'Close checkout 3', exact: true })).toBeVisible();

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

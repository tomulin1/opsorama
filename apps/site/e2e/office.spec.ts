import { expect, test, type Page } from '@playwright/test';

async function expectPanelsInsideViewport(page: Page) {
  const outside = await page.locator('.of-viewport').evaluate(stage => {
    const bounds = stage.getBoundingClientRect();
    // Panels nested in another panel (the activity feed, inspector trackers) scroll with it and are clipped by it.
    return [...stage.querySelectorAll<HTMLElement>('.dp-panel, .zc-control')].filter(panel => !panel.parentElement?.closest('.dp-panel')).filter(panel => {
      const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && (rect.left < bounds.left - 1 || rect.top < bounds.top - 1 || rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1);
    }).map(panel => panel.getAttribute('aria-label'));
  });
  expect(outside).toEqual([]);
}

test('open office fills the viewport with a floating HUD and inspects people, tickets, projects and rooms', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/office', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('.of-viewport');
  // Toolbar buttons share names with the side-panel tabs, so scope them to the toolbar.
  const toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
  await expect(page.locator('canvas')).toHaveCount(1);
  const originalCanvas = await page.locator('canvas').elementHandle();
  // One React scene; domain examples show no adapter switcher.
  for (const adapter of ['React', 'Vue', 'Plain JavaScript']) await expect(page.getByRole('button', { name: adapter, exact: true })).toHaveCount(0);
  await expect(viewport.locator('.hud-summary .dp-panel')).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Blocked tickets', exact: true })).toContainText('1');
  const initial = (await viewport.boundingBox())!;
  expect(initial.width).toBe(page.viewportSize()!.width); expect(initial.height).toBeGreaterThan(page.viewportSize()!.height - 70);
  await expectPanelsInsideViewport(page);

  // Extra panels start closed; a metric card or a toolbar button opens them.
  await expect(viewport.locator('.hud-side-panel, .hud-floating-panel')).toHaveCount(0);
  // A person opens their presence and current ticket; the ticket opens its progress and blocker.
  await page.getByRole('button', { name: 'Open people list', exact: true }).click();
  const people = page.getByRole('region', { name: 'People', exact: true });
  await expect(people.locator('tbody tr')).toHaveCount(26);
  await people.getByRole('button', { name: 'Inspect Kai Müller', exact: true }).click();
  const person = page.getByRole('complementary', { name: 'Person inspector' });
  await expect(person).toContainText('Remote'); await expect(person).toContainText('HRB-211');
  await person.getByRole('button', { name: 'Inspect ticket HRB-211', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Ticket inspector' })).toContainText('Waiting for timetable API keys');

  // A team filters the people; choosing it again clears the filter.
  await toolbar.getByRole('button', { name: 'Teams', exact: true }).click();
  await page.getByRole('region', { name: 'Teams', exact: true }).getByRole('button', { name: /Web/ }).click();
  await expect(page.getByRole('complementary', { name: 'Team inspector' })).toContainText('Web team');
  // The People panel stays open beside the inspector on desktop; its toolbar button would toggle it closed.
  await expect(people.locator('tbody tr')).toHaveCount(7);
  await people.getByRole('button', { name: 'Clear filter', exact: true }).click(); await expect(people.locator('tbody tr')).toHaveCount(26);

  // Projects filter the people on them; spaces open the room booking.
  await toolbar.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect project Harbor app', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Project inspector' })).toContainText('Bayline Ferries');
  await toolbar.getByRole('button', { name: 'Spaces', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect Fjord room', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Room inspector' })).toContainText('Sprint 42 planning');
  // A click on a floating panel does not pick the scene object behind it.
  await page.getByRole('region', { name: 'Office navigation', exact: true }).click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole('complementary', { name: 'Room inspector' })).toBeVisible();
  await expectPanelsInsideViewport(page);
  await page.screenshot({ path: 'artifacts/office-hud-desktop.png' });

  await page.getByRole('button', { name: 'Expand viewport', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-expanded', 'true');
  expect((await viewport.boundingBox())!.height).toBe(page.viewportSize()!.height);
  // Escape works without focus inside the viewport, as after a click on the canvas.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Escape'); await expect(viewport).toHaveAttribute('data-expanded', 'false');
  await page.getByRole('button', { name: 'Hide information panels', exact: true }).click();
  await expect(viewport.locator('.dp-panel')).toHaveCount(1); await expect(page.getByRole('group', { name: 'Camera zoom', exact: true })).toBeVisible();
  expect(await originalCanvas!.evaluate(canvas => canvas.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Show information panels', exact: true }).click();

  await page.getByLabel('Mock snapshot').selectOption('release');
  await expect(page.getByRole('region', { name: 'Blocked tickets', exact: true })).toContainText('2');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = (await viewport.boundingBox())!;
  expect(mobile.y + mobile.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  for (const panel of ['People', 'Tickets', 'Projects', 'Spaces', 'Info', 'Teams']) { await toolbar.getByRole('button', { name: panel, exact: true }).click(); await expectPanelsInsideViewport(page); }
  await page.screenshot({ path: 'artifacts/office-hud-mobile.png' });
  await page.setViewportSize({ width: 320, height: 844 }); await expectPanelsInsideViewport(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/examples'); await expect(page.getByRole('link', { name: 'Open office example', exact: true })).toHaveAttribute('href', '/examples/office');
  expect(errors).toEqual([]);
});

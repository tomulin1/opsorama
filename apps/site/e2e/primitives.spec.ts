import { ciScaled, expect, sceneCanvas, test, type Locator, type Page } from './fixtures';

/** The `transform` of a projected label, which changes when its node moves. */
const labelTransform = (label: Locator) => label.evaluate(element => (element as HTMLElement).style.transform);

/**
 * Clicks points over the middle of the chart until one selects a series group: bars are not selectable, so a click on
 * one bubbles to its series. Returns the selection readout.
 */
async function clickBar(page: Page, selection: Locator): Promise<string> {
  const box = (await sceneCanvas(page).boundingBox())!;
  for (const [x, y] of [[.45, .45], [.5, .5], [.4, .5], [.55, .42], [.35, .45], [.5, .38], [.6, .5]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    const text = (await selection.textContent()) ?? '';
    if (/series:/.test(text)) return text;
  }
  return (await selection.textContent()) ?? '';
}

test('primitives build a data-driven chart, bubble selection to series groups, instance equal shapes and move a group on a route in each adapter', async ({ page }) => {
  test.setTimeout(ciScaled(150000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/primitives');
  const example = page.getByRole('region', { name: 'Primitives example' });
  const totals = example.getByLabel('Series totals'), selection = example.getByLabel('Selection'), instancing = example.getByLabel('Instancing');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(sceneCanvas(page)).toHaveCount(1);
    await expect(example.locator('.primitives-load-status')).toHaveText('Scene loaded', { timeout: ciScaled(30000) });

    // Eighteen bars and the shuttle's boxes share one unit box; the four wheels form a second batch.
    await expect(instancing).toHaveText(/Instanced: [2-9] batches · (2[4-9]|[3-9]\d) shapes/, { timeout: ciScaled(10000) });

    // The shuttle group drives its route: its label moves.
    const shuttle = page.getByRole('button', { name: 'Select Shuttle' });
    const before = await labelTransform(shuttle);
    await expect.poll(() => labelTransform(shuttle), { timeout: ciScaled(10000) }).not.toBe(before);

    // A click on a bar selects its series group, not the bar.
    const selected = await clickBar(page, selection);
    expect(selected).toMatch(/^Selected: series-(north|central|south) \(series:(north|central|south)\)$/);

    // New data changes the totals and rebuilds only the chart; the selection stays.
    const first = await totals.textContent();
    await example.getByRole('button', { name: 'New data' }).click();
    await expect(totals).not.toHaveText(first ?? '');
    await expect(selection).toHaveText(selected);
    // The peak marker follows the data: one label, on the new highest bar.
    await expect(page.locator('.kit-node-label', { hasText: /^Peak \d+$/ })).toHaveCount(1);

    // A series label selects its group directly.
    await page.getByRole('button', { name: 'Select North' }).click();
    await expect(selection).toHaveText('Selected: series-north (series:north)');
  }
  await page.screenshot({ path: 'artifacts/primitives.png', fullPage: true });
  expect(errors).toEqual([]);
});

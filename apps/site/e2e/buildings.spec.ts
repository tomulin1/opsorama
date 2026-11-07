import { expect, test } from './fixtures';

test('building types have distinct exteriors and preserve dimensions, cutaway, snippets and remount state', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/building'); await expect(page.locator('canvas')).toHaveCount(1);
  const type = page.getByLabel('Building type', { exact: true }); await expect(type.locator('option')).toHaveCount(7);
  await page.getByLabel('Building width', { exact: true }).fill('12');
  const frames = new Set<string>();
  for (const value of ['generic', 'warehouse', 'distribution-center', 'workshop', 'office', 'retail', 'storage-shed']) {
    await type.selectOption(value); await expect(page.locator('.docs-code-block pre')).toContainText(value);
    await expect(page.getByLabel('Building width', { exact: true })).toHaveValue('12');
    await page.screenshot({ path: `artifacts/building-type-${value}.png`, fullPage: true }); frames.add((await page.locator('canvas').screenshot()).toString('base64'));
    await page.getByLabel('Building open', { exact: true }).check(); await expect(page.getByRole('button', { name: 'Select Example desk', exact: true })).toBeVisible();
    await page.getByLabel('Building open', { exact: true }).uncheck(); await expect(page.getByRole('button', { name: 'Select Example desk', exact: true })).toHaveCount(0);
  }
  expect(frames.size).toBe(7);
  for (const framework of ['React', 'Vue', 'JavaScript']) { await page.getByRole('button', { name: framework, exact: true }).click(); await expect(page.locator('.docs-code-block pre')).toContainText('storage-shed'); }
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await page.getByRole('button', { name: 'Mount preview', exact: true }).click(); await expect(type).toHaveValue('storage-shed');
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click(); await expect(type).toHaveValue('generic');
  expect(errors).toEqual([]);
});

test('building dimensions update geometry and snippets, retain invalid drafts, and survive remount', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/objects/building'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Building width', { exact: true })).toHaveValue('8');
  const original = await page.locator('canvas').screenshot();
  await page.getByLabel('Building width', { exact: true }).fill('14.2');
  await page.getByLabel('Building height', { exact: true }).fill('5.5');
  await page.getByLabel('Building depth', { exact: true }).fill('9.3');
  await expect.poll(async () => (await page.locator('canvas').screenshot()).equals(original)).toBe(false);
  for (const framework of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: framework, exact: true }).click();
    for (const value of ['14.2', '5.5', '9.3']) await expect(page.locator('.docs-code-block pre')).toContainText(value);
  }
  await page.getByLabel('Building width', { exact: true }).fill('101');
  await expect(page.locator('.building-dimensions').getByRole('alert')).toContainText('last valid size'); await expect(page.locator('.docs-code-block pre')).toContainText('14.2');
  await page.getByLabel('Building width', { exact: true }).fill(''); await expect(page.getByLabel('Building width', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Building width', { exact: true }).fill('14.2'); await expect(page.locator('.building-dimensions').getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Building open', { exact: true }).check(); await expect(page.getByRole('button', { name: 'Select Example desk', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await page.getByRole('button', { name: 'Mount preview', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(1); await expect(page.getByLabel('Building width', { exact: true })).toHaveValue('14.2');
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/building-dimensions-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  for (const [axis, value] of [['width', '8'], ['height', '3.6'], ['depth', '6']]) await expect(page.getByLabel(`Building ${axis}`, { exact: true })).toHaveValue(value);
  await expect(page.getByLabel('Building open', { exact: true })).not.toBeChecked(); expect(errors).toEqual([]);
});

test('building catalog opens an isolated lazy interior and exports matching native snippets', async ({ page }) => {
  await page.goto('/docs/objects/building'); await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.getByLabel('Object animation')).toHaveCount(0); await expect(page.getByLabel('Object count', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select Example desk', exact: true })).toHaveCount(0);
  await page.getByLabel('Building open', { exact: true }).check(); await expect(page.getByRole('button', { name: 'Select Example desk', exact: true })).toBeVisible();
  for (const framework of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: framework, exact: true }).click(); await expect(page.locator('.docs-code-block pre')).toContainText('open');
  }
  await page.getByLabel('Building open', { exact: true }).uncheck(); await expect(page.getByRole('button', { name: 'Select Example desk', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Unmount preview', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0);
});

test('native building scenes defer interiors, select children, release resources and remount', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/buildings');
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: adapter, exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 3');
    await expect(page.getByTestId('geometry-resources')).not.toHaveText('Geometry resources: 0');
    const closedGeometry = await page.getByTestId('geometry-resources').textContent();
    await expect(page.getByTestId('workshop-state')).toHaveText('closed · idle');
    await page.getByRole('button', { name: 'Open Workshop', exact: true }).click();
    await expect(page.getByTestId('workshop-state')).toHaveText('open · ready'); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 6');
    await page.getByRole('button', { name: 'Empty tote', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Empty tote');
    await page.getByLabel('Workshop building type', { exact: true }).selectOption('distribution-center');
    await expect(page.getByRole('status')).toHaveText('Selected: Empty tote'); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 6');
    await page.getByLabel('Workshop building type', { exact: true }).selectOption('workshop');
    await expect(page.getByRole('button', { name: 'Select Empty tote', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Change palette', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Selected: Empty tote'); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 6');
    await page.getByRole('button', { name: 'Close Workshop', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Selected: none'); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 3');
    await expect(page.getByTestId('geometry-resources')).toHaveText(closedGeometry!);
    await expect(page.getByRole('button', { name: 'Empty tote', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Select Empty tote', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open Office', exact: true }).click(); await expect(page.getByTestId('office-state')).toHaveText('open · ready');
    await page.getByRole('button', { name: 'Office desk', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Selected: Office desk');
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click(); await expect(page.locator('canvas')).toHaveCount(0); await expect(page.locator('.kit-node-label')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click(); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 3');
  }
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open Workshop', exact: true }).click(); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 6');
  await page.screenshot({ path: 'artifacts/building-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});

test('mouse peek stays open inside shell bounds and closes on exit while explicit opening pins it', async ({ page }) => {
  await page.goto('/examples/buildings'); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 3');
  // The projected Workshop label lies over the original roof silhouette.
  const label = page.getByRole('button', { name: 'Select Workshop', exact: true }); await expect(label).toBeVisible();
  const bounds = await label.boundingBox(); if (!bounds) throw new Error('Missing building label.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height + 28);
  await expect(page.getByTestId('workshop-state')).toHaveText('peek · ready'); await expect(page.getByTestId('rendered-objects')).toHaveText('Rendered nodes: 6');
  await page.mouse.move(bounds.x + bounds.width / 2 + 10, bounds.y + bounds.height + 38);
  await expect(page.getByTestId('workshop-state')).toHaveText('peek · ready');
  await page.mouse.move(5, 5); await expect(page.getByTestId('workshop-state')).toHaveText('closed · ready');
  await page.getByRole('button', { name: 'Open Workshop', exact: true }).click(); await page.mouse.move(5, 5);
  await expect(page.getByTestId('workshop-state')).toHaveText('open · ready');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.screenshot({ path: 'artifacts/building-desktop.png', fullPage: true });
});

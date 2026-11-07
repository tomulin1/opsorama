import { ciScaled, expect, test } from './fixtures';

test('scene markers render every shape, restyle live in each adapter and keep the last valid marker', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/examples/markers');
  const featured = page.locator('.kit-marker[data-node-id="featured"]');
  for (const framework of ['React', 'Vue', 'JavaScript']) {
    await page.getByRole('button', { name: framework, exact: true }).click();
    await expect(page.locator('.kit-marker')).toHaveCount(9);
    for (const shape of ['pin', 'circle', 'square', 'diamond', 'triangle', 'hexagon', 'octagon', 'shield']) await expect(page.locator(`.kit-marker[data-node-id="gallery-${shape}"]`)).toHaveAttribute('data-shape', shape);
    await page.getByLabel('Marker shape').selectOption('triangle'); await page.getByLabel('Marker tone').selectOption('warning');
    await expect(featured).toHaveAttribute('data-shape', 'triangle'); await expect(featured).toHaveAttribute('data-tone', 'warning');
    await expect(page.locator('.docs-code-block pre')).toContainText('triangle');
    await page.getByLabel('Marker shape').selectOption('pin'); await page.getByLabel('Marker tone').selectOption('critical');
  }
  // A critical pin pulses; its card opens on hover and lists severity, title and detail.
  await expect(featured.locator('.kit-marker-pulse')).toHaveCount(1);
  const card = featured.locator('.kit-marker-card');
  await expect(card).toBeHidden(); await featured.hover(); await expect(card).toBeVisible();
  await expect(card.locator('.kit-marker-title')).toHaveText('High inlet temperature');
  // An empty label is invalid: the preview keeps the last valid marker and the error names the fix.
  await page.getByLabel('Marker label').fill('');
  await expect(page.getByRole('region', { name: 'Scene marker configurator' }).getByRole('alert')).toContainText('label is required');
  await expect(featured).toHaveAttribute('aria-label', /High inlet temperature/);
  // Reduced motion stops the pulse.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(featured.locator('.kit-marker-pulse')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: 'artifacts/scene-markers.png', fullPage: true });
  expect(errors).toEqual([]);
});

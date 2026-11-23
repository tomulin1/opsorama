import { expect, test } from './fixtures';

test('glTF drones load once, share and instance their parts, survive a theme change and reload after a remount in every adapter', async ({ page }) => {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/models/drone.glb')) requests.push(request.url()); });
  await page.goto('/examples/models');
  const example = page.getByRole('region', { name: 'glTF models example' });
  const status = example.getByLabel('Load status'), instancing = example.getByLabel('Instancing');
  const instances = async () => Number(/· (\d+) meshes/.exec(await instancing.innerText())?.[1] ?? -1);
  for (const adapter of ['React', 'Vue', 'JavaScript']) {
    const before = requests.length;
    await example.getByRole('button', { name: adapter, exact: true }).click();
    await expect(example.locator('canvas')).toHaveCount(1);
    await expect(status).toHaveText('Models loaded', { timeout: 30_000 });
    // The file loads at most once per mount (the browser cache may answer it).
    expect(requests.length - before).toBeLessThanOrEqual(1);
    await expect.poll(instances).toBeGreaterThan(0);
    const four = await instances();
    await example.getByRole('button', { name: 'Parked drones: 4' }).click();
    await expect.poll(instances).toBeGreaterThan(four);
    // A theme change rebuilds every model from the cached file: no new request.
    const loads = requests.length;
    await example.getByRole('button', { name: 'Theme: light' }).click();
    await expect(example.getByRole('button', { name: 'Theme: midnight' })).toBeVisible();
    await expect.poll(instances).toBeGreaterThan(four);
    expect(requests.length).toBe(loads);
    await example.locator('.kit-node-label', { hasText: 'Drone 1' }).click();
    await expect(example.getByLabel('Selection')).toHaveText('Selected: drone-1 (drone:1)');
    await example.getByRole('button', { name: 'Theme: midnight' }).click(); await example.getByRole('button', { name: 'Parked drones: 12' }).click();
  }
  // Unmounting releases the file; mounting again loads it again and builds the drones.
  await example.getByRole('button', { name: 'Unmount' }).click(); await expect(example.locator('canvas')).toHaveCount(0);
  await example.getByRole('button', { name: 'Mount' }).click();
  await expect(status).toHaveText('Models loaded', { timeout: 30_000 });
  await expect.poll(instances).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

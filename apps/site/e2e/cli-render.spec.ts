import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderScene, run } from '../../../packages/cli/src/index';

// The opsorama command renders scenes in its own headless Chromium; the page fixture only decodes the images it writes.
test.describe.configure({ mode: 'serial' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-cli-render-'));
test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const scene = { schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [10, 6] },
  { id: 'lift', kind: 'asset', asset: 'forklift', label: 'Forklift 1', position: [-2, 0, 0] },
  { id: 'bar', kind: 'shape', shape: { type: 'box', size: [1, 2, 1] }, color: '#d03a2f', position: [2, 0, 0] },
  { id: 'logo', kind: 'image', src: 'logo.png', size: [1.2, 1.2], position: [0, 1.5, -2], billboard: true },
] };
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

test('renders a checked scene to a PNG with catalog models, primitives, labels and a relative image', async ({ page }) => {
  await page.setContent('<canvas width="8" height="8"></canvas>');
  const logo = await page.evaluate(() => { const canvas = document.querySelector('canvas')!, context = canvas.getContext('2d')!; context.fillStyle = '#2f6fd0'; context.fillRect(0, 0, 8, 8); return canvas.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(path.join(dir, 'logo.png'), Buffer.from(logo, 'base64'));
  const out = path.join(dir, 'images', 'scene.png');
  const result = await renderScene({ scene, baseDirectory: dir, out, width: 640, height: 400 });
  expect(result.problems).toEqual([]); expect(result.errors).toEqual([]);
  expect(result.diagnostics).toMatchObject({ objects: 4, loaded: true }); expect(result.diagnostics!.drawCalls).toBeGreaterThan(0);
  expect(result.out).toBe(out); expect(Buffer.from(result.png!).equals(fs.readFileSync(out))).toBe(true); expect(pngSize(Buffer.from(result.png!))).toEqual([640, 400]);

  // The red box, the blue image and the label must be visible in the image, on the light background.
  await page.setContent(`<img src="data:image/png;base64,${Buffer.from(result.png!).toString('base64')}">`);
  const colors = await page.evaluate(async () => {
    const image = document.querySelector('img')!; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height); let red = 0, blue = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) red++; if (data[i] < 90 && data[i + 1] > 80 && data[i + 1] < 140 && data[i + 2] > 170) blue++; }
    return { red, blue, corner: Array.from(data.slice(0, 3)) };
  });
  expect(colors.red).toBeGreaterThan(200); expect(colors.blue).toBeGreaterThan(50); expect(colors.corner.every(value => value > 200)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('img')!.naturalWidth)).toBe(640);
});

test('applies settings and scale, and reports render errors such as a missing image', async () => {
  const light = await renderScene({ scene: { schemaVersion: 1, nodes: scene.nodes.slice(0, 3) }, width: 320, height: 200 });
  const midnight = await renderScene({ scene: { schemaVersion: 1, nodes: scene.nodes.slice(0, 3) }, width: 320, height: 200, scale: 2, settings: { theme: 'midnight', camera: { projection: 'perspective' } } });
  expect(pngSize(Buffer.from(midnight.png!))).toEqual([640, 400]); expect(midnight.diagnostics!.loaded).toBe(true);
  expect(pngSize(Buffer.from(light.png!))[0]).toBe(320); expect(Buffer.from(light.png!).equals(Buffer.from(midnight.png!))).toBe(false);
  const missing = await renderScene({ scene: { schemaVersion: 1, nodes: [{ ...scene.nodes[3], src: 'nowhere.png' }] }, baseDirectory: dir, width: 320, height: 200 });
  expect(missing.problems).toEqual([]); expect(missing.png).toBeDefined();
  expect(missing.errors.join('\n')).toContain('nowhere.png');
});

test('the render command writes the image next to the scene and prints JSON for agents', async () => {
  const file = path.join(dir, 'command.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, nodes: scene.nodes.slice(0, 3) }));
  const result = await run(['render', file, '--json', '--width', '320', '--height', '200']);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, out: path.join(dir, 'command.png'), problems: [], errors: [], diagnostics: { objects: 3, loaded: true } });
  expect(pngSize(fs.readFileSync(path.join(dir, 'command.png')))).toEqual([320, 200]);
});

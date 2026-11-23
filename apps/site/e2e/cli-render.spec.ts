import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The opsorama command renders scenes in its own headless Chromium; the page fixture only decodes the images it writes.
// The command runs from source through scripts/opsorama.mjs (pnpm opsorama), as a separate Node process.
test.describe.configure({ mode: 'serial' });
const command = path.resolve(process.cwd(), '../../scripts/opsorama.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-cli-render-'));
test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

interface RenderOutput { ok: boolean; out: string | null; problems: unknown[]; errors: string[]; diagnostics: { objects: number; loaded: boolean; drawCalls: number } | null }
const opsorama = (...args: string[]) => new Promise<{ code: number; output: RenderOutput }>((resolve, reject) => {
  execFile(process.execPath, [command, ...args], { encoding: 'utf8', timeout: 120_000 }, (error, stdout, stderr) => {
    const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
    try { resolve({ code, output: JSON.parse(stdout) as RenderOutput }); } catch { reject(new Error(`opsorama ${args.join(' ')} exited ${code}:\n${stdout}\n${stderr}`)); }
  });
});
const write = (name: string, value: unknown) => { const file = path.join(dir, name); fs.writeFileSync(file, JSON.stringify(value)); return file; };
const pngSize = (file: string) => { const png = fs.readFileSync(file); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };

const nodes = [
  { id: 'floor', kind: 'ground', size: [10, 6] },
  { id: 'lift', kind: 'asset', asset: 'forklift', label: 'Forklift 1', position: [-2, 0, 0] },
  { id: 'bar', kind: 'shape', shape: { type: 'box', size: [1, 2, 1] }, color: '#d03a2f', position: [2, 0, 0] },
];
const logo = { id: 'logo', kind: 'image', src: 'logo.png', size: [1.2, 1.2], position: [0, 1.5, -2], billboard: true };

test('renders a checked scene to a PNG with catalog models, primitives, labels and a relative image', async ({ page }) => {
  await page.setContent('<canvas width="8" height="8"></canvas>');
  const pixels = await page.evaluate(() => { const canvas = document.querySelector('canvas')!, context = canvas.getContext('2d')!; context.fillStyle = '#2f6fd0'; context.fillRect(0, 0, 8, 8); return canvas.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(path.join(dir, 'logo.png'), Buffer.from(pixels, 'base64'));
  const out = path.join(dir, 'images', 'scene.png');
  const { code, output } = await opsorama('render', write('scene.json', { schemaVersion: 1, nodes: [...nodes, logo] }), '-o', out, '--width', '640', '--height', '400', '--json');
  expect(output).toMatchObject({ ok: true, out, problems: [], errors: [], diagnostics: { objects: 4, loaded: true } }); expect(code).toBe(0);
  expect(output.diagnostics!.drawCalls).toBeGreaterThan(0); expect(pngSize(out)).toEqual([640, 400]);

  // The red box, the blue image and the label must be visible in the image, on the light background.
  await page.setContent(`<img src="data:image/png;base64,${fs.readFileSync(out).toString('base64')}">`);
  const colors = await page.evaluate(async () => {
    const image = document.querySelector('img')!; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height); let red = 0, blue = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] > 150 && data[i + 1] < 90 && data[i + 2] < 90) red++; if (data[i] < 90 && data[i + 1] > 80 && data[i + 1] < 140 && data[i + 2] > 170) blue++; }
    return { red, blue, corner: Array.from(data.slice(0, 3)) };
  });
  expect(colors.red).toBeGreaterThan(200); expect(colors.blue).toBeGreaterThan(50); expect(colors.corner.every(value => value > 200)).toBe(true);
});

test('applies settings and scale, and reports render errors such as a missing image', async () => {
  const scene = write('plain.json', { schemaVersion: 1, nodes });
  const light = path.join(dir, 'light.png'), midnight = path.join(dir, 'midnight.png');
  expect((await opsorama('render', scene, '-o', light, '--width', '320', '--height', '200', '--json')).code).toBe(0);
  const settings = write('settings.json', { theme: 'midnight', camera: { projection: 'perspective' } });
  const dark = await opsorama('render', scene, '-o', midnight, '--width', '320', '--height', '200', '--scale', '2', '--settings', settings, '--json');
  expect(dark.code).toBe(0); expect(dark.output.diagnostics!.loaded).toBe(true);
  expect(pngSize(light)).toEqual([320, 200]); expect(pngSize(midnight)).toEqual([640, 400]);
  const missing = await opsorama('render', write('missing.json', { schemaVersion: 1, nodes: [{ ...logo, src: 'nowhere.png' }] }), '--width', '320', '--height', '200', '--json');
  expect(missing.code).toBe(1); expect(missing.output.problems).toEqual([]); expect(missing.output.errors.join('\n')).toContain('nowhere.png');
  expect(fs.existsSync(path.join(dir, 'missing.png'))).toBe(true);
});

test('does not render a scene with errors', async () => {
  const bad = write('bad.json', { schemaVersion: 1, nodes: [{ id: 'lift', kind: 'asset', asset: 'forklif' }] });
  const { code, output } = await opsorama('render', bad, '--json');
  expect(code).toBe(1); expect(output).toMatchObject({ ok: false, out: null, errors: [], diagnostics: null, problems: [{ rule: 'asset-validator' }] });
  expect(fs.existsSync(path.join(dir, 'bad.png'))).toBe(false);
});

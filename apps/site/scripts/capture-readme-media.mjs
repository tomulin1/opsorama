/**
 * Captures the short README animations of the domain examples: a few screenshots of each running
 * example, a fixed time apart, joined into a small looping GIF in docs/media/.
 *
 * Requires a running website and ffmpeg on the PATH:
 *
 *   pnpm --filter @opsorama/site build
 *   pnpm --filter @opsorama/site exec next start --hostname 127.0.0.1 --port 3102
 *   node apps/site/scripts/capture-readme-media.mjs [--base-url http://127.0.0.1:3102] [--only warehouse,farm]
 *
 * The browser uses the GPU when one is available, so the frames match what a visitor sees.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outputDir = join(root, 'docs/media');

/** Frames per animation, milliseconds between frames (also the playback delay) and the output width in pixels. */
const FRAMES = 4, INTERVAL = 700, WIDTH = 640;
const VIEWPORT = { width: 1280, height: 800 };

/**
 * The examples with the most visible movement at this frame rate. `zoom` is the number of Zoom in clicks before
 * the first frame, so moving people, vehicles and animals are large enough to follow.
 */
const examples = [
  { name: 'ecommerce', path: '/examples/ecommerce', zoom: 2 },
  { name: 'restaurant', path: '/examples/restaurant', zoom: 2 },
  { name: 'aquatics', path: '/examples/aquatics', zoom: 2 },
  { name: 'farm', path: '/examples/farm', zoom: 2 },
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const baseUrl = option('--base-url') ?? 'http://127.0.0.1:3102';
const only = option('--only')?.split(',');
const selected = only ? examples.filter(example => only.includes(example.name)) : examples;

mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default'] });
try {
  for (const example of selected) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL(example.path, baseUrl).href, { waitUntil: 'load' });
    await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 60_000 });
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('.kit-scene-loading').waitFor({ state: 'detached', timeout: 120_000 });
    const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
    for (let click = 0; click < example.zoom; click++) { await zoomIn.click(); await page.waitForTimeout(400); }
    // Let the camera, labels and the first movements settle before the first frame.
    await page.waitForTimeout(3_000);
    if (errors.length) throw new Error(`${example.path}: ${errors.join('; ')}`);
    // Crop to the scene and its HUD: below the site header, above the viewport toolbar when the example has one.
    const canvas = (await page.locator('canvas').first().boundingBox());
    const toolbar = page.getByRole('region', { name: 'Viewport controls', exact: true });
    const bottom = await toolbar.count() ? (await toolbar.boundingBox()).y - 8 : canvas.y + canvas.height;
    const clip = { x: canvas.x, y: canvas.y, width: canvas.width, height: Math.min(bottom, VIEWPORT.height) - canvas.y };

    const frameDir = mkdtempSync(join(tmpdir(), `opsorama-${example.name}-`));
    try {
      for (let frame = 0; frame < FRAMES; frame++) {
        const started = Date.now();
        await page.screenshot({ path: join(frameDir, `frame-${frame}.png`), clip });
        if (frame < FRAMES - 1) await page.waitForTimeout(Math.max(0, INTERVAL - (Date.now() - started)));
      }
      const output = join(outputDir, `${example.name}.gif`);
      const fps = (1000 / INTERVAL).toFixed(4);
      // One shared palette for all frames keeps the colors stable between frames; no dithering keeps the file small.
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-framerate', fps, '-i', join(frameDir, 'frame-%d.png'),
        '-filter_complex', `scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none`,
        '-loop', '0', output,
      ]);
      console.log(`${example.name}.gif  ${(statSync(output).size / 1024).toFixed(0)} KiB`);
    } finally {
      rmSync(frameDir, { recursive: true, force: true });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

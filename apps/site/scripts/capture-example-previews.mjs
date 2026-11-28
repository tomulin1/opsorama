/**
 * Captures the examples gallery previews: the example's scene alone, without its HUD panels, controls or HTML labels,
 * cropped to 8:5 and scaled to 768 × 480 WebP in public/example-previews/<name>.webp (EXAMPLE_PREVIEW_SIZE).
 *
 * Requires a running website:
 *
 *   pnpm --filter @opsorama/site build
 *   pnpm --filter @opsorama/site exec next start --hostname 127.0.0.1 --port 3102
 *   node apps/site/scripts/capture-example-previews.mjs office [warehouse …] [--base-url http://127.0.0.1:3102]
 *
 * Each name is a preview file name, captured from /examples/<name>. The browser uses the GPU when one is available, so
 * the images match what a visitor sees.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const outputDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public/example-previews');
const VIEWPORT = { width: 1536, height: 1024 };
const SIZE = { width: 768, height: 480 }, QUALITY = .86;
/** Everything over the scene that a preview leaves out. */
const OVERLAYS = '.hud-top, .hud-side-panel, .hud-floating-panel, .hud-viewport-controls, .kit-scene-labels, .kit-scene-loading';

function option(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}
const baseUrl = option('--base-url') ?? 'http://127.0.0.1:3102';
const names = process.argv.slice(2).filter((value, index, all) => !value.startsWith('--') && all[index - 1] !== '--base-url');
if (!names.length) { console.error('Name at least one example, for example: office'); process.exit(1); }

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default'] });
try {
  for (const name of names) {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL(`/examples/${name}`, baseUrl).href, { waitUntil: 'load' });
    await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 60_000 });
    const surface = page.locator('.hud-scene-surface').first();
    await surface.locator('canvas').first().waitFor({ state: 'visible', timeout: 180_000 });
    await page.locator('.kit-scene-loading').waitFor({ state: 'detached', timeout: 240_000 });
    // Let the camera and the first movements settle.
    await page.waitForTimeout(2500);
    // Labels set their own visibility, so the overlays are taken out of the page rather than hidden.
    await page.addStyleTag({ content: `${OVERLAYS} { display: none !important; }` });
    const png = await surface.screenshot({ type: 'png' });
    // The browser crops the middle 8:5 of the scene, scales it and encodes the WebP.
    const webp = await page.evaluate(async ({ data, size, quality }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const ratio = size.width / size.height, width = Math.min(image.naturalWidth, image.naturalHeight * ratio), height = width / ratio;
      const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high';
      context.drawImage(image, (image.naturalWidth - width) / 2, (image.naturalHeight - height) / 2, width, height, 0, 0, size.width, size.height);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    }, { data: png.toString('base64'), size: SIZE, quality: QUALITY });
    const file = join(outputDir, `${name}.webp`);
    writeFileSync(file, Buffer.from(webp, 'base64'));
    console.log(`${name}: ${file}${errors.length ? ` (page errors: ${errors.join('; ')})` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}

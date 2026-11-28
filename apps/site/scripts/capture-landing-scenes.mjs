/**
 * Captures the images the home page shows behind each carousel slide's scene while that scene is built: the scene
 * alone, as the home page frames it, without the carousel, the panels or the zoom controls. One WebP per scene in
 * public/landing-scenes/.
 *
 * Requires a running website:
 *
 *   pnpm --filter @opsorama/site build
 *   pnpm --filter @opsorama/site exec next start --hostname 127.0.0.1 --port 3102
 *   node apps/site/scripts/capture-landing-scenes.mjs [--base-url http://127.0.0.1:3102] [--only shop,cutoff]
 *
 * The browser uses the GPU when one is available, so the images match what a visitor sees.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const outputDir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public/landing-scenes');
/** A common desktop window; the hero image covers other sizes. */
const VIEWPORT = { width: 1440, height: 900 };
/** WebP quality of the saved images. */
const QUALITY = 0.82;

/**
 * The scenes in carousel order, with the slide that shows each. `settle` is the wait after the scene is built, so the
 * camera, labels and first movements settle; the office is taken as soon as it is built, since its agent starts from
 * an empty floor.
 */
const scenes = [
  { id: 'shop', slide: 'Show slide 1: Introduction', settle: 2500 },
  { id: 'warehouse', slide: 'Show slide 2: Live operations boards', settle: 2500 },
  { id: 'datacenter', slide: 'Show slide 3: Facility overviews', settle: 2500 },
  { id: 'cutoff', slide: 'Show slide 4: Management games', settle: 2500 },
  { id: 'office', slide: 'Show slide 5: Built with AI coding agents', settle: 0 },
];
/** Everything over the scene that the image leaves out. */
const OVERLAYS = '.landing-intro, .landing-top, .landing-inspector, .landing-ring, .landing-agent-log, .hud-viewport-controls';

function option(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const baseUrl = option('--base-url') ?? 'http://127.0.0.1:3102';
const only = option('--only')?.split(',');
const selected = only ? scenes.filter(scene => only.includes(scene.id)) : scenes;

mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=default'] });
try {
  for (const scene of selected) {
    // A fresh page per scene, so each one is built from the start, as a visitor's first look at it.
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/', baseUrl).href, { waitUntil: 'load' });
    await page.locator('html[data-hydrated="true"]').waitFor({ state: 'attached', timeout: 60_000 });
    await page.getByRole('button', { name: scene.slide, exact: true }).click();
    // The hero names the scene's image once the slide's scene replaces the previous one.
    const hero = page.locator(`.landing-hero[style*="landing-scenes/${scene.id}.webp"]`);
    await hero.waitFor({ state: 'attached', timeout: 10_000 });
    await page.waitForTimeout(300);
    await hero.locator('.hud-scene-surface canvas').waitFor({ state: 'visible', timeout: 180_000 });
    await hero.locator('.kit-scene-loading').waitFor({ state: 'detached', timeout: 240_000 });
    await page.waitForTimeout(scene.settle);
    await page.addStyleTag({ content: `${OVERLAYS} { visibility: hidden !important; }` });
    const png = await hero.screenshot({ type: 'png' });
    // Playwright saves PNG or JPEG; the browser encodes the WebP, as for the HUD thumbnails.
    const webp = await page.evaluate(async ({ data, quality }) => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', quality).split(',')[1];
    }, { data: png.toString('base64'), quality: QUALITY });
    const file = join(outputDir, `${scene.id}.webp`);
    writeFileSync(file, Buffer.from(webp, 'base64'));
    console.log(`${scene.id}: ${file}${errors.length ? ` (page errors: ${errors.join('; ')})` : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}

/**
 * Render the catalog models used by the example HUDs to small static WebP files.
 * From the workspace root: node apps/site/scripts/capture-hud-thumbnails.mjs
 * Requires Playwright Chromium, or set OPSORAMA_THUMBNAIL_BROWSER to a Chromium executable.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDir = new URL('../public/hud-thumbnails/', import.meta.url);
const bundle = await build({
  stdin: {
    resolveDir: siteRoot,
    contents: `
      import { renderThumbnails } from './src/features/docs/object-rendering';
      import { catalogObjects } from './src/features/docs/objects';
      import { hudThumbnailModels, hudThumbnailVariants } from './src/features/hud-thumbnails';

      window.captureHudThumbnails = async () => {
        const models = [...hudThumbnailModels.map(asset => [asset, [asset]]), ...Object.entries(hudThumbnailVariants)];
        const items = models.map(([slug, [asset, variant]]) => {
          const item = catalogObjects.find(item => item.asset === asset);
          if (!item) throw new Error('No catalog model for ' + asset);
          return { ...item, slug, variants: variant ? [variant] : item.variants };
        });
        const images = new Map();
        await renderThumbnails(items, (slug, image) => images.set(slug, image), new AbortController().signal);
        const canvas = document.createElement('canvas');
        canvas.width = 112;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        return Promise.all(items.map(async ({ slug }) => {
          const image = new Image();
          image.src = images.get(slug);
          await image.decode();
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          return [slug, canvas.toDataURL('image/webp', 0.88).split(',')[1]];
        }));
      };
    `,
  },
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});

const browser = await chromium.launch({
  executablePath: process.env.OPSORAMA_THUMBNAIL_BROWSER,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const images = await page.evaluate(() => window.captureHudThumbnails());
  await mkdir(outputDir, { recursive: true });
  await Promise.all(images.map(([slug, base64]) => writeFile(new URL(`${slug}.webp`, outputDir), Buffer.from(base64, 'base64'))));
  console.log(`Captured ${images.length} HUD thumbnails.`);
} finally {
  await browser.close();
}

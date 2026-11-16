/**
 * Renders the static images that search engines and link previews read:
 *   public/social/opsorama.png        1200 × 630 Open Graph / X card (SOCIAL_IMAGE in src/features/seo/site.ts)
 *   public/brand/apple-touch-icon.png 180 × 180 home-screen icon (square; iOS rounds the corners)
 * The card combines the Flow mark, the headline and the landing city preview (public/example-previews/city.webp).
 * It needs no running website. From the workspace root: node apps/site/scripts/capture-social-image.mjs
 * Requires Playwright Chromium; the Inter font is used when installed, otherwise the site's fallback fonts.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const palette = JSON.parse(await readFile(new URL('../src/features/brand/palette.json', import.meta.url), 'utf8')).families;
const dataUri = async (path, type) => `data:${type};base64,${(await readFile(publicDir + path)).toString('base64')}`;
const mark = await dataUri('brand/opsorama-mark.svg', 'image/svg+xml');
const city = await dataUri('example-previews/city.webp', 'image/webp');
const font = "Inter, 'Segoe UI', Arial, sans-serif";

const socialCard = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;display:flex;align-items:center;gap:48px;padding:0 0 0 72px;background:${palette.blue[50]};font-family:${font};color:${palette.blue[900]};overflow:hidden">
  <div style="flex:0 0 470px">
    <div style="display:flex;align-items:center;gap:16px"><img src="${mark}" width="64" height="64" alt=""><span style="font-size:44px;font-weight:700;letter-spacing:-1.2px">Opsorama</span></div>
    <h1 style="margin:40px 0 0;font-size:50px;line-height:1.08;font-weight:700;letter-spacing:-1.6px">Animated 3D dashboards for your operations.</h1>
    <p style="margin:24px 0 0;font-size:24px;line-height:1.4;color:${palette.slate[600]}">Open-source toolkit for React, Vue and JavaScript.</p>
    <p style="margin:36px 0 0;font-size:22px;font-weight:600;color:${palette.blue[700]}">opsorama.dev</p>
  </div>
  <img src="${city}" alt="" style="width:768px;height:480px;border-radius:20px 0 0 20px;box-shadow:0 24px 60px rgba(38,60,89,.22);object-fit:cover">
</div></body></html>`;

const appleIcon = `<!doctype html><html><body style="margin:0">
<div style="width:180px;height:180px;background:${palette.blue[900]}"><img src="${mark}" width="180" height="180" alt="" style="display:block"></div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [html, width, height, path] of [[socialCard, 1200, 630, 'social/opsorama.png'], [appleIcon, 180, 180, 'brand/apple-touch-icon.png']]) {
    await page.setViewportSize({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await mkdir(publicDir + path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await page.screenshot({ path: publicDir + path, clip: { x: 0, y: 0, width, height } });
    console.log(`Wrote apps/site/public/${path}`);
  }
} finally { await browser.close(); }

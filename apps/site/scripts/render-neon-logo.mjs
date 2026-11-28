/**
 * Renders the neon Opsorama sign the office example hangs on its reception wall: the mark and the name as glowing
 * tubes on a dark backplate, to public/brand/opsorama-neon.webp. Image nodes are drawn unlit, so the glow stays bright
 * in every lighting preset.
 *
 *   node apps/site/scripts/render-neon-logo.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const output = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public/brand/opsorama-neon.webp');
/** The sign's design size in SVG units and the pixels per unit of the image. */
const WIDTH = 360, HEIGHT = 96, SCALE = 4;
const TUBE = '#7fe2ff', CORE = '#effcff', PLATE = '#142038';

// The mark's three shapes from opsorama-mark.svg, drawn as tubes: a wide blurred glow under a thin bright core.
const MARK = [
  'M36 9C39 7 42 8 45 10L63 20Q70 24 70 32V49Q70 56 64 60L36 76Q30 79 30 72V62Q30 58 34 56L49 47Q53 45 53 41V33L34 22Q29 19 31 14Q32 11 36 9Z',
  'M53 33L64 39Q70 43 70 49Q70 56 64 60L53 66V33Z',
  'M23 25L11 32Q7 34 7 40V58Q7 64 12 67L24 74V27Q24 25 23 25Z',
];
const tubes = content => `<g filter="url(#glow)">${content}</g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH * SCALE}" height="${HEIGHT * SCALE}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="wide" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="near" />
      <feMerge><feMergeNode in="wide" /><feMergeNode in="wide" /><feMergeNode in="near" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <rect x="2" y="2" width="${WIDTH - 4}" height="${HEIGHT - 4}" rx="16" fill="${PLATE}" fill-opacity=".94" stroke="#2b3d5c" stroke-width="2" />
  <g transform="translate(14 4) scale(.92)" fill="none" stroke-linejoin="round" stroke-linecap="round">
    ${tubes(MARK.map(d => `<path d="${d}" stroke="${TUBE}" stroke-width="3.4" />`).join(''))}
    ${MARK.map(d => `<path d="${d}" stroke="${CORE}" stroke-width="1.1" />`).join('')}
  </g>
  <g font-family="Segoe UI, Arial, sans-serif" font-size="46" font-weight="600" letter-spacing="1" fill="none" stroke-linejoin="round">
    ${tubes(`<text x="100" y="63" stroke="${TUBE}" stroke-width="3">Opsorama</text>`)}
    <text x="100" y="63" stroke="${CORE}" stroke-width="1">Opsorama</text>
  </g>
</svg>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH * SCALE, height: HEIGHT * SCALE } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.locator('svg').screenshot({ omitBackground: true, type: 'png' });
  // The browser encodes the WebP, which keeps the transparency at a fraction of the PNG's size.
  const webp = await page.evaluate(async data => {
    const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', .9).split(',')[1];
  }, png.toString('base64'));
  writeFileSync(output, Buffer.from(webp, 'base64'));
  console.log(output);
} finally {
  await browser.close();
}

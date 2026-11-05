/** Website palette generation and static project color audit; no browser or package changes. Paths are relative to apps/site; toolkit packages are inventoried from the workspace root as ../../packages. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const palette = JSON.parse(read('src/features/brand/palette.json'));
const managedFiles = [
  'src/app/brand.css', 'src/app/globals.css', 'src/app/toolkit.css', 'src/app/objects.css',
  'src/app/examples.css', 'src/app/measurements.css', 'src/app/motion.css',
  'src/app/examples/buildings/buildings.css', 'src/features/docs/panels.css', 'src/features/docs/zoom-control.css',
];
const values = { ...palette.base };
for (const [family, steps] of Object.entries(palette.families)) {
  for (const [step, hex] of Object.entries(steps)) values[`${family}-${step}`] = hex;
}
const errors = [];
for (const [name, hex] of Object.entries(values)) if (!/^#[\da-f]{6}$/i.test(hex)) errors.push(`Invalid color ${name}: use #RRGGBB.`);
for (const [role, target] of Object.entries(palette.roles)) if (!values[target]) errors.push(`Role ${role}: define target ${target}.`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const css = [
  '/* Generated from src/features/brand/palette.json by pnpm colors:generate. Do not edit directly. */',
  ':root {',
  ...Object.entries(values).map(([name, hex]) => `  --opsorama-${name}: ${hex.toLowerCase()};`),
  ...Object.entries(palette.roles).map(([role, target]) => `  --opsorama-${role}: var(--opsorama-${target});`),
  '}', '',
].join('\n');
if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'src/app/palette.css'), css);
if (read('src/app/palette.css').replace(/\r\n/g, '\n') !== css) errors.push('palette.css is stale. Run pnpm colors:generate.');

function luminance(hex) {
  const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
function contrast(a, b) { const [light, dark] = [luminance(a), luminance(b)].sort((a, b) => b - a); return (light + .05) / (dark + .05); }
for (const [family, steps] of Object.entries(palette.families)) {
  let previous = 2;
  for (const [step, hex] of Object.entries(steps)) {
    const next = luminance(hex);
    if (next >= previous) errors.push(`${family}-${step}: intensity must darken as the numeric step increases.`);
    previous = next;
  }
}
const pairs = palette.contrastPairs.map(pair => {
  const foreground = values[palette.roles[pair.foreground]];
  const background = values[palette.roles[pair.background]];
  const ratio = contrast(foreground, background);
  if (ratio < pair.minimum) errors.push(`${pair.label}: ${ratio.toFixed(2)}:1 is below ${pair.minimum}:1. Choose a darker foreground or lighter surface.`);
  return { ...pair, foreground, background, ratio: Number(ratio.toFixed(2)) };
});

const tokens = new Set([...Object.keys(values), ...Object.keys(palette.roles)]);
for (const file of managedFiles) {
  const content = read(file);
  for (const [, token] of content.matchAll(/var\(--opsorama-([\w-]+)/g)) if (!tokens.has(token)) errors.push(`${file}: undefined --opsorama-${token}.`);
  if (/#[\da-f]{3,8}\b/i.test(content)) errors.push(`${file}: replace literal website colors with palette tokens.`);
}
for (const name of ['mark', 'symbol', 'lockup', 'monochrome']) {
  const file = `public/brand/opsorama-${name}.svg`;
  for (const color of read(file).match(/#[\da-f]{6}\b/ig) || []) if (!Object.values(values).includes(color.toUpperCase())) errors.push(`${file}: ${color} is not in palette.json. Update the SVG with the selected palette.`);
}
const walk = directory => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
  const file = `${directory}/${entry.name}`;
  return entry.isDirectory() ? walk(file) : /\.(?:css|ts|tsx|svg)$/.test(file) ? [file] : [];
});
const inventory = ['src', '../../packages', 'examples', 'public'].flatMap(walk).map(file => {
  const colors = read(file).match(/#[\da-f]{3,8}\b/ig) || [];
  const scope = file === 'src/app/palette.css' ? 'palette source' : managedFiles.includes(file) ? 'managed website' : file.startsWith('public/brand/') ? 'brand asset' : file.startsWith('../../packages/ui/') ? 'portable UI defaults' : file.startsWith('../../packages/') ? 'renderer / core / adapter' : file.endsWith('.css') ? 'host example / preview' : 'host records / examples / documentation';
  return { file, scope, literals: colors.length, uniqueColors: [...new Set(colors.map(c => c.toUpperCase()))].length };
});
const report = { palette: palette.name, checks: pairs, managedFiles, limitations: 'Static color inventory and declared solid-color contrast pairs. Not a full rendered-page accessibility audit. Transparent overlays, dynamic model colors and dark-mode samples need separate contextual checks.', inventory };
fs.mkdirSync(path.join(root, 'artifacts/brand'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts/brand/color-audit.json'), JSON.stringify(report, null, 2) + '\n');
for (const pair of pairs) console.log(`${pair.ratio.toFixed(2)}:1  ${pair.label}`);
console.log(`Inventoried ${inventory.length} source files; ${managedFiles.length} managed website stylesheets. Report: artifacts/brand/color-audit.json`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }

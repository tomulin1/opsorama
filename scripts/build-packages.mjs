#!/usr/bin/env node
/**
 * Builds every publishable workspace package into its dist/ folder: ESM JavaScript with source maps and bundled
 * TypeScript declarations, one output per entry in the package's `exports` (source paths under src/). Dependencies and
 * peer dependencies stay external. Module directives such as 'use client' are preserved; CSS exports are copied unchanged, and @opsorama/objects also gets dist/catalog.json.
 * Workspace consumers keep importing src/ through `exports`; published tarballs use `publishConfig.exports` (dist/).
 * Usage: pnpm build:packages [package-name ...]   e.g. pnpm build:packages core three
 */
import { build } from 'tsup';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Build order follows the dependency graph. */
const PACKAGES = ['core', 'three', 'objects', 'ui', 'react', 'vue'];
const selected = process.argv.slice(2).length ? process.argv.slice(2) : PACKAGES;
for (const name of selected) if (!PACKAGES.includes(name)) throw new Error(`Unknown package ${name}. Choose from: ${PACKAGES.join(', ')}.`);

for (const name of PACKAGES.filter(name => selected.includes(name))) {
  const dir = path.join(root, 'packages', name);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const sources = Object.values(manifest.exports);
  const entry = Object.fromEntries(sources.filter(file => /\.tsx?$/.test(file)).map(file => [file.replace(/^\.\/src\//, '').replace(/\.tsx?$/, ''), path.join(dir, file)]));
  const external = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})].map(dep => new RegExp(`^${dep.replace('/', '\/')}(?:/|$)`));
  fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
  await build({
    entry, outDir: path.join(dir, 'dist'), format: ['esm'], target: 'es2022', platform: 'browser', splitting: true, sourcemap: true, clean: false,
    outExtension: () => ({ js: '.js' }), dts: { compilerOptions: { composite: false } }, tsconfig: path.join(root, 'tsconfig.build.json'), external, silent: true,
  });
  // tsup names declarations .d.mts and lets one entry's declarations import another's as './x.mjs'. The JavaScript is .js,
  // so rename them to .d.ts and point those imports at './x.js', which TypeScript resolves to the renamed declarations.
  const rename = folder => { for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) { rename(full); continue; }
    if (!item.name.endsWith('.d.mts')) continue;
    const text = fs.readFileSync(full, 'utf8').replace(/(['"])(\.\.?\/[^'"]+)\.mjs\1/g, '$1$2.js$1');
    fs.writeFileSync(full.replace(/\.d\.mts$/, '.d.ts'), text); fs.rmSync(full);
  } };
  rename(path.join(dir, 'dist'));
  for (const file of sources.filter(file => file.endsWith('.css'))) fs.copyFileSync(path.join(dir, file), path.join(dir, 'dist', path.basename(file)));
  if (name === 'objects') execFileSync(process.execPath, [path.join(root, 'scripts/build-catalog-json.mjs')], { stdio: 'inherit' });
  console.log(`built @opsorama/${name}: ${Object.keys(entry).length} entries`);
}

#!/usr/bin/env node
/**
 * Checks the publishable shape of every package as npm users would receive it. Run pnpm build:packages first.
 *
 * 1. Packs each package with pnpm, which applies publishConfig and replaces workspace: versions.
 * 2. Runs publint --strict on each tarball.
 * 3. Extracts the tarballs into a clean temporary project (outside this workspace, so no workspace links resolve), links the
 *    peer dependencies from this workspace, and type-checks one import of every export subpath with TypeScript, once with
 *    `moduleResolution: bundler` and once with `node16` (an ESM project), with library checking on; errors inside third-party declarations are counted but ignored.
 * 4. Imports every JavaScript entry point in Node from the packed files, and parses every JSON export (the scene schema).
 * Exit 1 when any check fails. Usage: pnpm check:packages
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packPackages, PACKAGES, root, run } from './lib/packages.mjs';

/** Peer and type packages the consumer project borrows from this workspace. */
const LINKED = ['three', '@types/three', 'react', 'react-dom', '@types/react', '@types/react-dom', 'vue'];
const bin = name => path.join(root, 'node_modules/.bin', process.platform === 'win32' ? `${name}.cmd` : name);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-packages-'));
const consumer = path.join(temp, 'consumer'), modules = path.join(consumer, 'node_modules');
fs.mkdirSync(path.join(modules, '@opsorama'), { recursive: true }); fs.mkdirSync(path.join(modules, '@types'), { recursive: true });
const tarballs = packPackages(path.join(temp, 'packs'));
let failed = false;
const imports = [];
for (const name of PACKAGES) {
  const file = tarballs[name];
  const publint = run(bin('publint'), [file, '--strict'], root);
  console.log(`@opsorama/${name} (${(fs.statSync(file).size / 1024).toFixed(1)} KiB packed): publint ${publint.ok ? 'ok' : 'FAILED'}`);
  if (!publint.ok) { console.log(publint.output.trim()); failed = true; }
  const target = path.join(modules, '@opsorama', name);
  // Relative paths: GNU tar on Windows reads a drive letter (C:) as a remote host.
  fs.mkdirSync(target); execFileSync('tar', ['-xzf', path.relative(target, file).split(path.sep).join('/'), '--strip-components=1'], { cwd: target });
  const manifest = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
  for (const [key, value] of Object.entries(manifest.exports)) if (typeof value === 'object') imports.push(`@opsorama/${name}${key === '.' ? '' : key.slice(1)}`);
  // JSON exports (the scene schema) must be packed and parse as JSON.
  for (const [key, value] of Object.entries(manifest.exports)) if (typeof value === 'string' && value.endsWith('.json')) {
    let ok = false; try { JSON.parse(fs.readFileSync(path.join(target, value), 'utf8')); ok = true; } catch { /* reported below */ }
    console.log(`@opsorama/${name}${key.slice(1)}: ${ok ? 'ok' : `FAILED (${value} is missing from the tarball or is not JSON)`}`);
    if (!ok) failed = true;
  }
}
for (const dep of LINKED) {
  const source = fs.realpathSync(path.join(root, 'node_modules', dep));
  fs.symlinkSync(source, path.join(modules, dep), 'junction');
}
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'opsorama-consumer-check', private: true, type: 'module' }));
fs.writeFileSync(path.join(consumer, 'index.ts'), [
  ...imports.map((specifier, index) => `import * as m${index} from '${specifier}';`),
  `export const loaded = [${imports.map((_, index) => `m${index}`).join(', ')}];`,
  `import { createAssetRegistry, type AssetRegistry } from '@opsorama/three';`,
  `import { vehiclesKit } from '@opsorama/objects/vehicles';`,
  `import { catalogAssets } from '@opsorama/objects';`,
  `export const registry: AssetRegistry = createAssetRegistry(vehiclesKit, { custom: catalogAssets.parcel });`,
  // The catalog's AssetOptions augmentation must reach consumers: without it, options.forks is unknown and this fails.
  `import type { AssetNode } from '@opsorama/core';`,
  `const truck: AssetNode = { id: 'truck', kind: 'asset', asset: 'forklift', options: { forks: { height: 1 } } };`,
  `export const forkHeight: number | undefined = truck.options?.forks?.height;`,
  // The handling subpath's ItemPlace augmentation must reach consumers: without it, a receptacle position in putOn is an excess property.
  `import { handlingItemPolicy, type HandlingState } from '@opsorama/objects/handling';`,
  `import type { BehaviorStep, ItemPolicy } from '@opsorama/core';`,
  `export const policyOf = (state: HandlingState): ItemPolicy => handlingItemPolicy(state);`,
  `export const putOnDeck: BehaviorStep = { kind: 'interact', node: 'rack', seconds: 1, putDown: 'all', putOn: { receptacle: 'level-0', position: 1 } };`,
].join('\n'));
for (const resolution of ['bundler', 'node16']) {
  const options = { strict: true, noEmit: true, skipLibCheck: false, types: [], lib: ['dom', 'esnext'], target: 'es2022', jsx: 'react-jsx', module: resolution === 'bundler' ? 'esnext' : 'node16', moduleResolution: resolution };
  fs.writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: options, files: ['index.ts'] }));
  const result = run(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", consumer], consumer, { shell: false });
  // Only errors in the packed packages or the consumer file count; third-party declarations (for example @types/three
  // expecting WebGPU types) are reported as a count but are not this repository's to fix.
  const lines = result.output.trim().split('\n').filter(Boolean);
  const own = lines.filter(line => line.startsWith('node_modules/@opsorama/') || line.startsWith('index.ts'));
  const ignored = lines.length - own.length;
  console.log(`types (${resolution}, ${imports.length} entry points): ${own.length ? 'FAILED' : 'ok'}${ignored ? ` (${ignored} third-party declaration errors ignored)` : ''}`);
  if (own.length) { console.log(own.slice(0, 30).join('\n')); failed = true; }
}
// Runtime: every JavaScript entry point must load in Node from the packed files alone (no DOM is touched at import time).
const loader = imports.map(specifier => `await import(${JSON.stringify(specifier)});`).join(' ');
const runtime = run(process.execPath, ["--input-type=module", "-e", loader], consumer, { shell: false });
console.log(`runtime imports (node, ${imports.length} entry points): ${runtime.ok ? 'ok' : 'FAILED'}`);
if (!runtime.ok) { console.log(runtime.output.trim().split('\n').slice(0, 20).join('\n')); failed = true; }
fs.rmSync(temp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/**
 * Installation smoke test: proves that the starters in examples/ install and build from the packed packages alone, outside this
 * workspace, the way a user's project would after `npm install @opsorama/...`. Run pnpm build:packages first.
 *
 * For each starter: copy it to a temporary folder, point every @opsorama/* dependency (direct and transitive) at the packed
 * tarball through pnpm overrides, run `pnpm install` and the starter's `build` script (type check + production build).
 * Third-party dependencies come from the registry or the local pnpm store.
 *
 * Usage: pnpm smoke:starters [starter ...] [--keep]
 *   starter  limit the run, for example `vite-react next`
 *   --keep   keep the temporary folder and print its path, for example to preview a build
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packPackages, PACKAGES, root, run } from './lib/packages.mjs';

const args = process.argv.slice(2), keep = args.includes('--keep');
const examples = path.join(root, 'examples');
const available = fs.readdirSync(examples).filter(name => fs.existsSync(path.join(examples, name, 'package.json')));
const selected = args.filter(arg => !arg.startsWith('--'));
for (const name of selected) if (!available.includes(name)) throw new Error(`Unknown starter ${name}. Choose from: ${available.join(', ')}.`);
const starters = selected.length ? selected : available;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-starters-'));
const tarballs = packPackages(path.join(temp, 'packs'));
const fileSpec = name => `file:${tarballs[name].split(path.sep).join('/')}`;
/** Build artifacts and installs a copied starter must not carry over. */
const SKIP = new Set(['node_modules', 'dist', '.next', 'next-env.d.ts', 'tsconfig.tsbuildinfo']);
const copy = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const item of fs.readdirSync(from, { withFileTypes: true })) { if (SKIP.has(item.name)) continue; const source = path.join(from, item.name), target = path.join(to, item.name); if (item.isDirectory()) copy(source, target); else fs.copyFileSync(source, target); } };

let failed = false;
for (const name of starters) {
  const dir = path.join(temp, 'starters', name);
  copy(path.join(examples, name), dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  for (const section of ['dependencies', 'devDependencies']) for (const dep of Object.keys(manifest[section] ?? {})) {
    const pkg = dep.replace(/^@opsorama\//, '');
    if (dep.startsWith('@opsorama/') && PACKAGES.includes(pkg)) manifest[section][dep] = fileSpec(pkg);
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest, null, 2));
  // A workspace file of the copied starter's own: overrides make transitive @opsorama/* dependencies use the tarballs too.
  const overrides = PACKAGES.map(pkg => `  '@opsorama/${pkg}': '${fileSpec(pkg)}'`).join('\n');
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), `overrides:\n${overrides}\nallowBuilds:\n  esbuild: true\n  sharp: true\n  '@parcel/watcher': true\n  unrs-resolver: true\n`);
  const started = Date.now();
  const install = run('pnpm', ['install', '--prefer-offline', '--no-frozen-lockfile'], dir, { env: { CI: 'true' } });
  const build = install.ok ? run('pnpm', ['run', 'build'], dir, { env: { NEXT_TELEMETRY_DISABLED: '1' } }) : { ok: false, output: '' };
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`${name.padEnd(12)} install ${install.ok ? 'ok' : 'FAILED'}, build ${install.ok ? (build.ok ? 'ok' : 'FAILED') : 'skipped'} (${seconds} s)`);
  if (!install.ok) console.log(install.output.trim().split('\n').slice(-25).join('\n'));
  if (install.ok && !build.ok) console.log(build.output.trim().split('\n').slice(-40).join('\n'));
  failed ||= !install.ok || !build.ok;
}
if (keep) console.log(`Kept ${temp}`); else fs.rmSync(temp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

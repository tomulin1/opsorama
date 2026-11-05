/**
 * Shared helpers for scripts that work with the publishable packages as npm users receive them.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Publishable packages in dependency order; each lives in packages/<name> as @opsorama/<name>. */
export const PACKAGES = ['core', 'three', 'objects', 'ui', 'react', 'vue'];

/**
 * Runs a command and returns `{ ok, output }` instead of throwing. Windows needs a shell for .cmd shims (pnpm, publint);
 * pass `shell: false` for node itself so paths with spaces stay intact.
 */
export function run(command, args, cwd, { shell = process.platform === 'win32', env } = {}) {
  try { return { ok: true, output: execFileSync(command, args, { cwd, encoding: 'utf8', shell, env: env ? { ...process.env, ...env } : process.env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) }; }
  catch (error) { return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }; }
}

/**
 * Packs every built package with pnpm into `destination` (pnpm applies publishConfig and replaces workspace: versions).
 * Returns `{ name -> absolute tarball path }`. Throws with the fix when dist/ is missing or packing fails.
 */
export function packPackages(destination) {
  fs.mkdirSync(destination, { recursive: true });
  const tarballs = {};
  for (const name of PACKAGES) {
    const dir = path.join(root, 'packages', name);
    if (!fs.existsSync(path.join(dir, 'dist'))) throw new Error(`@opsorama/${name}: dist/ is missing. Run pnpm build:packages first.`);
    const before = new Set(fs.readdirSync(destination));
    const pack = run('pnpm', ['pack', '--pack-destination', destination], dir);
    const tarball = fs.readdirSync(destination).find(file => !before.has(file) && file.endsWith('.tgz'));
    if (!pack.ok || !tarball) throw new Error(`@opsorama/${name}: pnpm pack failed.\n${pack.output}`);
    tarballs[name] = path.join(destination, tarball);
  }
  return tarballs;
}

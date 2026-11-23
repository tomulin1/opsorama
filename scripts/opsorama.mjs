#!/usr/bin/env node
/**
 * Runs the `opsorama` command from source in this repository. Workspace packages export TypeScript sources, which Node
 * cannot import directly, so esbuild bundles packages/cli/src/bin.ts first. The bundle sits in packages/cli/.dev/ (git-ignored)
 * so the command resolves its packages and package.json from the CLI package, as the installed command does from dist/.
 * Usage: pnpm opsorama check scene.json   |   pnpm opsorama render scene.json -o scene.png
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'packages/cli/.dev/bin.mjs');
await esbuild.build({
  entryPoints: [path.join(root, 'packages/cli/src/bin.ts')], bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile, logLevel: 'error',
  // Kept external: esbuild and playwright-core load native or browser binaries; the page bundle resolves the rest itself.
  external: ['esbuild', 'playwright-core'],
});
await import(pathToFileURL(outfile).href);

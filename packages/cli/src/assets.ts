import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { catalogAssets } from '@opsorama/objects';
import { createAssetRegistry, type AssetRegistry } from '@opsorama/three';

/** Directory the CLI resolves its own packages from (src/ in the workspace, dist/ when installed). */
export const cliDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * Packages a host's asset module shares with the CLI. They always resolve from the CLI's own dependencies, so the host's
 * factories and the renderer use one copy of three.js and of the Opsorama packages.
 */
const SHARED = /^(?:three|@opsorama\/(?:core|three|objects))(?:\/.*)?$/;
export function sharedPackages(): esbuild.Plugin {
  return {
    name: 'opsorama-shared-packages',
    setup(build) {
      build.onResolve({ filter: SHARED }, async args => {
        if (args.pluginData === 'shared') return undefined;
        const resolved = await build.resolve(args.path, { kind: args.kind, resolveDir: cliDirectory, pluginData: 'shared' });
        return resolved.errors.length ? { errors: resolved.errors } : { path: resolved.path, sideEffects: resolved.sideEffects };
      });
    },
  };
}

/** An asset module's registry: its default export or its `assets` export, an object of asset factory functions. */
export function moduleRegistry(module: Record<string, unknown>, file: string): AssetRegistry {
  const registry = module.default ?? module.assets;
  const fix = `Export the factories as the module's default export or as \`export const assets\`, for example \`export default createAssetRegistry({ 'my-model': myModelFactory })\`.`;
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) throw new Error(`${file} exports no asset registry. ${fix}`);
  const entries = Object.entries(registry);
  if (!entries.length) throw new Error(`${file} exports an empty asset registry. ${fix}`);
  for (const [name, factory] of entries) if (typeof factory !== 'function') throw new Error(`${file}: asset ${name} is not a factory function. ${fix}`);
  return registry as AssetRegistry;
}

/**
 * Loads a host's asset module (JavaScript or TypeScript, ESM) in Node: esbuild bundles it with the CLI's own copies of
 * three.js and the Opsorama packages, so it may import them, kits included. Returns its registry, not merged with the catalog.
 */
export async function loadAssetModule(file: string): Promise<AssetRegistry> {
  const entry = path.resolve(file);
  if (!fs.existsSync(entry)) throw new Error(`Asset module not found: ${file}.`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opsorama-assets-')), outfile = path.join(directory, 'assets.mjs');
  try {
    await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', target: 'node22', outfile, logLevel: 'silent', plugins: [sharedPackages()] })
      .catch((error: esbuild.BuildFailure) => { throw new Error(`Could not bundle the asset module ${file}:\n${error.errors?.map(item => `  ${item.location ? `${item.location.file}:${item.location.line}: ` : ''}${item.text}`).join('\n') ?? error.message}`); });
    return moduleRegistry(await import(pathToFileURL(outfile).href) as Record<string, unknown>, file);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

/** The registry a scene is checked and rendered with: the whole catalog, plus the host's factories when given. Names must not repeat. */
export function sceneRegistry(custom?: AssetRegistry): AssetRegistry {
  return custom ? createAssetRegistry(catalogAssets, custom) : catalogAssets;
}

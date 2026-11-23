import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createSceneStore, type SceneProblem, type SceneSettingsPatch } from '@opsorama/core';
import { cliDirectory, loadAssetModule, sceneRegistry, sharedPackages } from './assets';
import { checkScene } from './check';

/** Options of `renderScene`. */
export interface RenderOptions {
  /** The scene: a parsed `SceneDefinition`. It is checked first; a scene with errors is not rendered. */
  scene: unknown;
  /** Scene settings such as `theme`, `camera` or `zoom`. `motion` defaults to false here, so models and routes hold still and repeated renders match. */
  settings?: SceneSettingsPatch;
  /** Path of a module that exports more asset factories (see `loadAssetModule`); they are added to the catalog. */
  assetsModule?: string;
  /** Directory that relative image `src` values resolve against, usually the scene file's directory. Default: the working directory. */
  baseDirectory?: string;
  /** Image size in CSS pixels. Default 1280 × 800. */
  width?: number;
  height?: number;
  /** Device pixel ratio of the image: 2 doubles its pixel size. Default 1. */
  scale?: number;
  /** Write the PNG to this path; its directory is created. */
  out?: string;
  /** Browser: Playwright's Chromium (default; install it with `npx playwright install chromium`), or a Chrome or Edge channel such as `chrome`. */
  channel?: string;
  /** Path of a Chromium-based browser executable, instead of `channel`. */
  executablePath?: string;
  /** Milliseconds to wait for the scene to load. Default 60000. */
  timeout?: number;
  /**
   * Paths of stylesheets the page loads after its default label style, for example the host application's CSS for
   * `.kit-node-label`. The renderer draws node labels as HTML buttons and leaves their look to the host.
   */
  stylesheets?: readonly string[];
}

/** What the renderer reported while drawing, from `SceneRenderer.getDiagnostics`. */
export interface RenderDiagnostics { objects: number; loaded: boolean; drawCalls: number; geometries: number; textures: number; instanceBatches: number; instances: number }

/** The result of `renderScene`. `png` is set when the scene passed the check, even if it did not finish loading (see `diagnostics.loaded`). */
export interface RenderResult {
  /** Problems of the scene check, errors and warnings. Any error stops before rendering. */
  problems: SceneProblem[];
  /** Errors the page reported while rendering: node build and image load errors from `RendererOptions.onError`, uncaught page errors and failed requests. */
  errors: string[];
  png?: Uint8Array;
  /** Where the PNG was written, with `out`. */
  out?: string;
  diagnostics?: RenderDiagnostics;
}

const PAGE_ORIGIN = 'http://opsorama.localhost';
/**
 * Default look of the renderer's HTML node labels (`.kit-node-label` buttons), matching the documentation website's light
 * theme, so labels read clearly in images. Host stylesheets passed as `stylesheets` load after it and win.
 */
const LABEL_STYLE = [
  '.kit-node-label{position:absolute;top:0;left:0;border-radius:5px;background:rgb(255 255 255/.93);border:1px solid rgb(255 255 255/.85);box-shadow:0 2px 5px rgb(38 60 89/.09);font:600 9px "Segoe UI",Arial,sans-serif;color:#4d688c;padding:4px 7px;white-space:nowrap;line-height:13px}',
  '.kit-zone-label{background:rgb(255 255 255/.73);box-shadow:none;border:0;font-size:8px;letter-spacing:1.2px;color:#263c59;padding:6px 10px}',
  '.kit-node-warning{background:#faf2df;color:#705018;border-color:#f2dfb0}',
  '.kit-node-selected{background:#4c70a6;color:#fff;border-color:#4c70a6}',
  '.kit-node-selected.kit-node-warning{background:#705018;color:#fff;border-color:#705018}',
].join('');
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2' };

/** The browser page script: the renderer, the catalog and the host's factories in one bundle with one copy of three.js. */
async function pageScript(assetsModule?: string): Promise<string> {
  const contents = [
    `import { createSceneStore } from '@opsorama/core';`,
    `import { assetLoadsSettled, createAssetRegistry, createSceneRenderer } from '@opsorama/three';`,
    `import { catalogAssets } from '@opsorama/objects';`,
    assetsModule ? `import * as custom from ${JSON.stringify(path.resolve(assetsModule))};` : 'const custom = undefined;',
    `const assets = custom ? createAssetRegistry(catalogAssets, custom.default ?? custom.assets) : catalogAssets;`,
    `const frames = count => new Promise(resolve => { const step = () => (count-- <= 0 ? resolve() : requestAnimationFrame(step)); requestAnimationFrame(step); });`,
    `window.opsoramaRender = async (scene, settings) => {`,
    `  const errors = [], container = document.getElementById('scene');`,
    `  const store = createSceneStore(scene, settings);`,
    `  const renderer = createSceneRenderer(container, store, { assets, onError: error => errors.push(error.message) });`,
    `  try { await renderer.loaded; } catch (error) { errors.push(error.message); }`,
    // Models that load asynchronously (glTF) are built again when they arrive; their frames follow.
    `  await assetLoadsSettled();`,
    `  await frames(3);`,
    `  const { objects, loaded, drawCalls, geometries, textures, instanceBatches, instances } = renderer.getDiagnostics();`,
    `  return { errors, diagnostics: { objects, loaded, drawCalls, geometries, textures, instanceBatches, instances } };`,
    `};`,
  ].join('\n');
  const result = await esbuild.build({ stdin: { contents, resolveDir: cliDirectory, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent', plugins: [sharedPackages()] })
    .catch((error: esbuild.BuildFailure) => { throw new Error(`Could not bundle the scene page:\n${error.errors?.map(item => `  ${item.location ? `${item.location.file}:${item.location.line}: ` : ''}${item.text}`).join('\n') ?? error.message}`); });
  return result.outputFiles[0].text;
}

async function loadPlaywright(): Promise<typeof import('playwright-core')> {
  try { return await import('playwright-core'); }
  catch { throw new Error('Rendering needs playwright-core, an optional peer dependency of @opsorama/cli. Install it and a browser: npm install --save-dev playwright-core && npx playwright install chromium'); }
}

/**
 * Renders a scene to a PNG image in headless Chromium, so people and agents can check how a scene looks without opening it.
 * The scene is checked first with the catalog and the optional asset module. Errors during rendering (a node that fails to
 * build, an image that fails to load) are returned in `errors`; the image is still taken.
 */
export async function renderScene(options: RenderOptions): Promise<RenderResult> {
  const { scene, assetsModule, baseDirectory = process.cwd(), width = 1280, height = 800, scale = 1, timeout = 60000 } = options;
  const settings: SceneSettingsPatch = { motion: false, ...options.settings };
  for (const [name, value] of Object.entries({ width, height })) if (!Number.isInteger(value) || value < 16 || value > 4096) throw new Error(`${name} must be a whole number of pixels from 16 to 4096; received ${value}.`);
  if (!(scale > 0 && scale <= 4)) throw new Error(`scale must be greater than 0 and at most 4; received ${scale}.`);
  const hostStyles = (options.stylesheets ?? []).map(file => {
    try { return fs.readFileSync(file, 'utf8'); } catch (error) { throw new Error(`Cannot read the stylesheet ${file}: ${(error as Error).message}`); }
  });
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff;font-family:system-ui,sans-serif}#scene{position:relative;width:100vw;height:100vh;overflow:hidden}${LABEL_STYLE}</style>${hostStyles.map(css => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`).join('')}<div id="scene"></div>`;
  const custom = assetsModule ? await loadAssetModule(assetsModule) : undefined;
  const problems = checkScene(scene, sceneRegistry(custom));
  if (problems.some(problem => problem.severity === 'error')) return { problems, errors: [] };
  // Settings are checked in Node too, so invalid settings fail before a browser starts.
  createSceneStore(scene as Parameters<typeof createSceneStore>[0], settings).dispose();

  const script = await pageScript(assetsModule), { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ channel: options.channel, executablePath: options.executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    .catch((error: Error) => { throw new Error(`Could not start the browser: ${error.message.split('\n')[0]}\nInstall Playwright's Chromium with: npx playwright install chromium (or pass --channel chrome to use an installed Chrome).`); });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`Request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`));
    const root = path.resolve(baseDirectory);
    await page.route(`${PAGE_ORIGIN}/**`, async route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      if (pathname === '/opsorama-render.js') return route.fulfill({ contentType: 'text/javascript', body: script });
      // Relative image and model URLs resolve against the scene's directory; nothing outside it is served.
      const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ contentType: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', body: fs.readFileSync(file) });
    });
    page.setDefaultTimeout(timeout);
    await page.goto(`${PAGE_ORIGIN}/`);
    await page.addScriptTag({ url: `${PAGE_ORIGIN}/opsorama-render.js` });
    const outcome = await page.evaluate(({ scene, settings }) => (window as unknown as { opsoramaRender(scene: unknown, settings: unknown): Promise<{ errors: string[]; diagnostics: RenderDiagnostics }> }).opsoramaRender(scene, settings), { scene, settings });
    // Finished CSS transitions, so labels appear at full opacity.
    const png = await page.locator('#scene').screenshot({ type: 'png', animations: 'disabled' });
    let out: string | undefined;
    if (options.out) { out = path.resolve(options.out); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, png); }
    return { problems, errors: [...outcome.errors, ...errors], png, out, diagnostics: outcome.diagnostics };
  } finally { await browser.close(); }
}

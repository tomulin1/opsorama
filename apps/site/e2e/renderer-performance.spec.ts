import path from 'node:path';
import { build } from 'esbuild';
import { ciScaled, expect, test, type Page } from './fixtures';

/*
 * Renderer work in a real browser, read from `getDiagnostics().work`: hover, selection and zoom do no per-node work, a
 * theme change signs and builds each node once, pointer moves cost at most one scene raycast per frame, a static view
 * lays out and measures no labels, and an off-screen canvas keeps simulating without drawing. Like
 * renderer-lifecycle.spec.ts, each test loads the renderer and the core store, bundled from the workspace sources, into a
 * blank page.
 */

type Three = typeof import('@opsorama/three');
type Core = typeof import('@opsorama/core');
type HarnessWindow = Window & { opsorama: { THREE: typeof import('three'); core: Core; three: Three } };
type Work = import('@opsorama/three').RendererWork;
/** What a test keeps in the page between steps. */
type Probe = {
  store: import('@opsorama/core').SceneStore; renderer: import('@opsorama/three').SceneRenderer;
  /** Animation frames seen by a per-frame listener, and `move` events reported to `onPointer`. */
  frames: number; moves: number;
  /** The plugin context, for reading node objects. */
  context: import('@opsorama/three').RendererPluginContext | null;
};
type ProbeWindow = Window & { probe: Probe };

let bundle: Promise<string> | null = null;
/** The harness module, bundled once per worker from the workspace sources. */
function harnessCode(): Promise<string> {
  bundle ??= build({
    stdin: {
      contents: "import * as THREE from 'three'; import * as core from '@opsorama/core'; import * as three from '@opsorama/three'; window.opsorama = { THREE, core, three };",
      resolveDir: path.resolve(__dirname, '../../..'), loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent',
  }).then(result => result.outputFiles[0].text);
  return bundle;
}

const LABEL_STYLES = '.kit-node-label{position:absolute;top:0;left:0;pointer-events:auto;white-space:nowrap;font:600 9px Arial,sans-serif;padding:4px 7px}.kit-node-selected{font-weight:800}';

/** A blank page with a 640 × 400 host at the top (and `below` px of page after it) and the harness loaded; page errors are collected. */
async function openHarness(page: Page, below = 0): Promise<string[]> {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const host = `<div id="host" style="position:relative;width:640px;height:400px"></div><div style="height:${below}px"></div>`;
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(`<!doctype html><html><head><style>${LABEL_STYLES}</style></head><body style="margin:0">${host}</body></html>`);
  await page.addScriptTag({ content: await harnessCode(), type: 'module' });
  await page.waitForFunction(() => 'opsorama' in window);
  return errors;
}

/**
 * Mounts a scene of `count` labelled, selectable boxes in a grid (with motion off, so nothing moves by itself) plus a
 * floor and an asset on a looping route, with a per-frame listener and an `onPointer` handler that count.
 */
async function mountScene(page: Page, count: number): Promise<void> {
  await page.evaluate(async count => {
    const { THREE, core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    const nodes: import('@opsorama/core').SceneNode[] = [{ id: 'floor', kind: 'ground', size: [40, 40] }];
    for (let index = 0; index < count; index++) nodes.push({ id: `box-${index}`, kind: 'shape', shape: { type: 'box', size: [.6, .6, .6] }, position: [index % 20 * 1.6 - 15, 0, Math.floor(index / 20) * 1.6 - 12], label: `Box ${index}`, selectable: true });
    nodes.push({ id: 'cart', kind: 'asset', asset: 'cart', position: [-6, 0, 14], route: { points: [[-6, 0, 14], [6, 0, 14]], speed: 2, loop: true } });
    const store = core.createSceneStore({ schemaVersion: 1, nodes }, { motion: false });
    const assets = { cart: () => new THREE.Mesh(new THREE.BoxGeometry(1, .5, 1), new THREE.MeshStandardMaterial({ color: '#d98c2b' })) };
    const probe = { store, frames: 0, moves: 0, context: null } as Probe;
    probe.renderer = three.createSceneRenderer(host, store, { assets, onPointer: event => { if (event.type === 'move') probe.moves++; }, plugins: [{ name: 'probe', setup: context => { probe.context = context; } }] });
    probe.renderer.onFrame(() => { probe.frames++; });
    (window as unknown as ProbeWindow).probe = probe;
    await probe.renderer.loaded;
  }, count);
}

/** Waits `count` animation frames in the page. */
const frames = (page: Page, count: number) => page.evaluate(count => new Promise<void>(resolve => {
  let seen = 0; const tick = () => { if (++seen >= count) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}), count);
const read = (page: Page) => page.evaluate(() => { const { renderer, frames, moves } = (window as unknown as ProbeWindow).probe, diagnostics = renderer.getDiagnostics(); return { work: diagnostics.work, renderedFrames: diagnostics.renderedFrames, frames, moves }; });
const delta = (after: Work, before: Work) => Object.fromEntries(Object.keys(after).map(key => [key, after[key as keyof Work] - before[key as keyof Work]])) as unknown as Work;

test('hover, selection and zoom do no per-node work; a theme change signs and builds each themed node once', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors = await openHarness(page);
  await mountScene(page, 400);
  await frames(page, 3);
  const start = await read(page);
  // Hover across the boxes and their labels.
  for (let step = 0; step < 30; step++) { await page.mouse.move(60 + step * 17, 120 + (step % 5) * 30); await frames(page, 1); }
  const hovered = await read(page);
  expect(delta(hovered.work, start.work)).toMatchObject({ syncs: 0, nodeSyncs: 0, nodeSignatures: 0, nodeUpdates: 0, nodeBuilds: 0 });
  // Selection and zoom are store changes that keep the node list.
  await page.evaluate(async () => { const { store } = (window as unknown as ProbeWindow).probe; store.select('box-12'); store.configure({ zoom: 1.6 }); store.select('box-40'); store.configure({ zoom: .9 }); });
  await frames(page, 3);
  const zoomed = await read(page);
  expect(delta(zoomed.work, hovered.work)).toMatchObject({ syncs: 4, nodeSyncs: 0, nodeSignatures: 0, nodeUpdates: 0, nodeBuilds: 0 });
  // One upsert signs and updates one node.
  await page.evaluate(() => { const { store } = (window as unknown as ProbeWindow).probe, node = store.getSnapshot().nodes.find(node => node.id === 'box-3')!; store.upsert({ ...node, position: [0, 0, 0] } as typeof node); });
  const moved = await read(page);
  expect(delta(moved.work, zoomed.work)).toMatchObject({ nodeSyncs: 1, nodeSignatures: 1, nodeUpdates: 1, nodeBuilds: 0 });
  // A theme change signs every node once and rebuilds the themed ones (400 shapes and the cart), not the ground.
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.store.configure({ theme: 'midnight' }));
  const themed = await read(page);
  expect(delta(themed.work, moved.work)).toMatchObject({ nodeSyncs: 1, nodeSignatures: 402, nodeUpdates: 402, nodeBuilds: 401 });
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.renderer.dispose());
  expect(errors).toEqual([]);
});

test('pointer moves cost at most one scene raycast per frame, and a resting pointer none until the camera moves', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors = await openHarness(page);
  await mountScene(page, 200);
  await page.mouse.move(320, 200); await frames(page, 3);
  const start = await read(page);
  // Bursts of moves between frames: the latest move of each frame is resolved once for hover, peek and onPointer.
  for (let burst = 0; burst < 12; burst++) {
    await page.evaluate(burst => {
      const canvas = document.querySelector('#host canvas')!;
      for (let index = 0; index < 15; index++) canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, isPrimary: true, pointerType: 'mouse', clientX: 100 + burst * 30 + index, clientY: 150 + index, pointerId: 1 }));
    }, burst);
    await frames(page, 1);
  }
  const moved = await read(page), frameCount = moved.frames - start.frames;
  const raycasts = moved.work.sceneRaycasts - start.work.sceneRaycasts;
  expect(raycasts).toBeGreaterThan(0);
  expect(raycasts).toBeLessThanOrEqual(frameCount);
  expect(moved.moves - start.moves).toBeLessThanOrEqual(frameCount);
  // A resting pointer over a still camera casts nothing.
  await frames(page, 2);
  const resting = await read(page); await frames(page, 15);
  const still = await read(page);
  expect(still.work.sceneRaycasts - resting.work.sceneRaycasts).toBe(0);
  // A camera move under the resting pointer casts it again, still at most once per frame.
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.store.configure({ zoom: 1.8 }));
  await frames(page, 30);
  const zoomed = await read(page), recasts = zoomed.work.sceneRaycasts - still.work.sceneRaycasts;
  expect(recasts).toBeGreaterThan(0);
  expect(recasts).toBeLessThanOrEqual(zoomed.frames - still.frames);
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.renderer.dispose());
  expect(errors).toEqual([]);
});

test('a static view lays out no labels and reads no label widths; a changed label is measured once', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors = await openHarness(page);
  await mountScene(page, 120);
  // Let the first frames place every label.
  await frames(page, 10);
  const settled = await read(page); await frames(page, 20);
  const still = await read(page);
  expect(still.renderedFrames - settled.renderedFrames).toBeGreaterThanOrEqual(20);
  expect(delta(still.work, settled.work)).toMatchObject({ labelLayouts: 0, labelMeasures: 0 });
  // Zoom moves every label but changes none: layouts run, no width is read again.
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.store.configure({ zoom: 1.3 }));
  await frames(page, 10);
  const zoomed = await read(page);
  expect(zoomed.work.labelLayouts - still.work.labelLayouts).toBeGreaterThan(0);
  expect(zoomed.work.labelMeasures - still.work.labelMeasures).toBe(0);
  // Selecting a node changes its label's class: that label alone is measured again (when it is in view).
  await page.evaluate(() => { const { store } = (window as unknown as ProbeWindow).probe; store.configure({ camera: { frameOnSelect: false } }); });
  await frames(page, 5);
  const before = await read(page);
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.store.select('box-50'));
  await frames(page, 5);
  const selected = await read(page);
  expect(selected.work.labelMeasures - before.work.labelMeasures).toBeLessThanOrEqual(1);
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.renderer.dispose());
  expect(errors).toEqual([]);
});

test('an off-screen canvas keeps motion and frame listeners running without drawing, and draws again on return', async ({ page }) => {
  test.setTimeout(ciScaled(90000));
  const errors = await openHarness(page, 3000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mountScene(page, 20);
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.store.configure({ motion: true }));
  await frames(page, 5);
  const cartX = () => page.evaluate(() => (window as unknown as ProbeWindow).probe.context!.nodeObject('cart')!.position.x);
  const visible = await read(page);
  // Scrolled out of view.
  await page.evaluate(() => window.scrollTo(0, 2500));
  await frames(page, 5);
  const leaving = await read(page), leavingX = await cartX(); await frames(page, 30);
  const away = await read(page), awayX = await cartX();
  expect(away.renderedFrames - leaving.renderedFrames).toBe(0);
  expect(away.work.offscreenFrames - leaving.work.offscreenFrames).toBeGreaterThanOrEqual(25);
  expect(away.frames - leaving.frames).toBeGreaterThanOrEqual(25);
  expect(away.work.labelLayouts - leaving.work.labelLayouts).toBe(0);
  // The route keeps advancing off-screen.
  expect(Math.abs(awayX - leavingX)).toBeGreaterThan(.2);
  // Back in view: frames are drawn again.
  await page.evaluate(() => window.scrollTo(0, 0));
  await frames(page, 10);
  const back = await read(page);
  expect(back.renderedFrames - away.renderedFrames).toBeGreaterThan(0);
  // A panel hidden with display: none counts as off-screen too.
  await page.evaluate(() => { document.getElementById('host')!.style.display = 'none'; });
  await frames(page, 5);
  const hiding = await read(page); await frames(page, 20);
  const hidden = await read(page);
  expect(hidden.renderedFrames - hiding.renderedFrames).toBe(0);
  expect(hidden.frames - hiding.frames).toBeGreaterThanOrEqual(15);
  expect(visible.work.offscreenFrames).toBe(0);
  await page.evaluate(() => (window as unknown as ProbeWindow).probe.renderer.dispose());
  expect(errors).toEqual([]);
});

import path from 'node:path';
import { build } from 'esbuild';
import { ciScaled, expect, test, type Page } from './fixtures';

/*
 * Renderer lifecycle in a real browser, without a website page: each test loads the renderer and the core store, bundled
 * from the workspace sources, into a blank page and drives them from page scripts. It covers what needs WebGL and the DOM:
 * a failing node during the sliced initial load, host content after a failed mount, label placement in the frame that moved
 * the node, label clicks, group brackets that follow their contents and a lost graphics context.
 */

type HarnessWindow = Window & { opsorama: { THREE: typeof import('three'); core: typeof import('@opsorama/core'); three: typeof import('@opsorama/three') } };

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

/** Label styles a host supplies (the website's are in toolkit.css): placed by their transform and clickable. */
const LABEL_STYLES = '.kit-node-label{position:absolute;top:0;left:0;pointer-events:auto;white-space:nowrap;font:600 9px Arial,sans-serif;padding:4px 7px}';

/** A blank page with a 640 × 400 host element and the harness loaded; page errors are collected. */
async function openHarness(page: Page): Promise<string[]> {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const host = '<div id="host" style="position:relative;width:640px;height:400px"></div>';
  await page.setContent(`<!doctype html><html><head><style>${LABEL_STYLES}</style></head><body style="margin:0">${host}</body></html>`);
  await page.addScriptTag({ content: await harnessCode(), type: 'module' });
  await page.waitForFunction(() => 'opsorama' in window);
  return errors;
}

test('a node that fails to build is reported once while the rest of the sliced load renders, and a change retries it', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  const errors = await openHarness(page);
  const result = await page.evaluate(async () => {
    const { THREE, core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    const crate = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#5b8def' }));
    const assets = {
      crate,
      flaky: (node: { options?: Record<string, unknown> }) => {
        if (node.options?.broken) throw new Error('flaky factory failed');
        const mesh = crate(), anchor = new THREE.Group(); anchor.name = 'anchor-top'; anchor.position.y = 1; mesh.add(anchor); return mesh;
      },
    };
    const flaky = { id: 'flaky', kind: 'asset' as const, asset: 'flaky', position: [8, 0, 8] as [number, number, number], options: { broken: true } };
    const nodes: import('@opsorama/core').SceneNode[] = [{ id: 'floor', kind: 'ground', size: [30, 30] }];
    for (let index = 0; index < 24; index++) nodes.push({ id: `crate-${index}`, kind: 'asset', asset: 'crate', position: [index % 6 * 2 - 5, 0, Math.floor(index / 6) * 2 - 3] });
    // The failing node sits mid-scene, carries a node, and another node uses an anchor its owner's model lacks.
    nodes.splice(8, 0, flaky, { id: 'rider', kind: 'asset', asset: 'crate', attachment: { nodeId: 'flaky', anchor: 'top' } },
      { id: 'stray', kind: 'asset', asset: 'crate', attachment: { nodeId: 'crate-0', anchor: 'roof' } });
    const store = core.createSceneStore({ schemaVersion: 1, nodes }), reported: string[] = [], phases: string[] = [];
    let context: import('@opsorama/three').RendererPluginContext | null = null;
    // A budget of 0 builds one node per slice, so the failing node is built in a later slice of the load.
    const renderer = three.createSceneRenderer(host, store, {
      assets, buildBudget: 0, onError: error => reported.push(error.message), onLoad: state => phases.push(state.phase),
      plugins: [{ name: 'probe', setup: value => { context = value; } }],
    });
    const timeout = new Promise(resolve => setTimeout(() => resolve('pending'), 20000));
    const settled = await Promise.race([renderer.loaded.then(() => 'loaded'), timeout]);
    const object = (id: string) => context!.nodeObject(id)!;
    const afterLoad = {
      settled, phases: [...new Set(phases)], reported: [...reported], objects: renderer.getDiagnostics().objects,
      opacity: host.querySelector('canvas')!.style.opacity, riderOnFlaky: object('rider').parent === object('flaky'),
      strayOnCrate: object('stray').parent === object('crate-0'),
    };
    // Unrelated changes neither rebuild nor report the failing node again.
    const moved = store.getSnapshot().nodes.find(node => node.id === 'crate-3')!;
    store.upsert({ ...moved, position: [0, 0, 9] } as typeof moved); store.configure({ zoom: 1.2 });
    const afterUnrelated = reported.length;
    // A change of the node retries it: still failing is reported again, fixed is built and carries its rider on the anchor.
    store.upsert({ ...flaky, options: { broken: true, attempt: 2 } }); const afterRetry = reported.length;
    store.upsert({ ...flaky, options: {} }); const afterFix = reported.length;
    const fixed = { isMesh: object('flaky') instanceof THREE.Mesh, riderOnAnchor: object('rider').parent?.name === 'anchor-top' };
    renderer.dispose();
    return { afterLoad, afterUnrelated, afterRetry, afterFix, fixed };
  });
  expect(result.afterLoad.settled).toBe('loaded');
  expect(result.afterLoad.phases).toEqual(['building', 'compiling', 'loaded']);
  expect(result.afterLoad.reported).toHaveLength(2);
  expect(result.afterLoad.reported).toContainEqual(expect.stringContaining('Scene node "flaky" could not be built: flaky factory failed'));
  expect(result.afterLoad.reported).toContainEqual(expect.stringContaining('"stray" is attached to anchor "roof" of "crate-0"'));
  expect(result.afterLoad.objects).toBe(28);
  expect(result.afterLoad.opacity).toBe('');
  expect(result.afterLoad.riderOnFlaky).toBe(true);
  expect(result.afterLoad.strayOnCrate).toBe(true);
  expect(result.afterUnrelated).toBe(2);
  expect(result.afterRetry).toBe(3);
  expect(result.afterFix).toBe(3);
  expect(result.fixed).toEqual({ isMesh: true, riderOnAnchor: true });
  expect(errors).toEqual([]);
});

test('a failed mount removes only what the renderer added and keeps the host fallback content', async ({ page }) => {
  const errors = await openHarness(page);
  const result = await page.evaluate(() => {
    const { core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    host.innerHTML = '<p class="fallback">Records stay available here.</p>';
    const store = core.createSceneStore({ schemaVersion: 1, nodes: [{ id: 'floor', kind: 'ground', size: [10, 10] }] });
    let thrown = '';
    try { three.createSceneRenderer(host, store, { assets: {}, plugins: [{ name: 'boom', setup() { throw new Error('setup failed'); } }] }); }
    catch (error) { thrown = (error as Error).message; }
    return { thrown, children: [...host.children].map(child => child.className) };
  });
  expect(result.thrown).toContain('boom');
  expect(result.children).toEqual(['fallback']);
  expect(errors).toEqual([]);
});

test('labels are placed from the node pose of the frame that moved it', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  const errors = await openHarness(page);
  const offsets = await page.evaluate(async () => {
    const { THREE, core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    const store = core.createSceneStore({ schemaVersion: 1, nodes: [
      { id: 'floor', kind: 'ground', size: [20, 20] },
      { id: 'mover', kind: 'shape', shape: { type: 'box', size: [1, 1, 1] }, label: 'Mover', selectable: true },
    ] }, { motion: false });
    let context: import('@opsorama/three').RendererPluginContext | null = null, step = 0;
    const renderer = three.createSceneRenderer(host, store, { assets: {}, plugins: [{ name: 'probe', setup: value => { context = value; } }] });
    await renderer.loaded;
    // A frame listener moves the node 0.25 m per frame; its label must show where the node is drawn in the same frame.
    renderer.onFrame(() => { step++; context!.nodeObject('mover')!.position.x = (step % 24) * .25 - 3; });
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const label = host.querySelector<HTMLElement>('[data-node-id="mover"]')!, offsets: number[] = [];
    for (let sample = 0; sample < 6; sample++) {
      await nextFrame();
      const object = context!.nodeObject('mover')!, rect = host.getBoundingClientRect();
      const height = typeof object.userData.labelHeight === 'number' ? object.userData.labelHeight : 1.65;
      object.updateWorldMatrix(true, false);
      const point = object.localToWorld(new THREE.Vector3(0, height, 0)).project(context!.camera());
      const shown = Number(/translate\(([-\d.]+)px/.exec(label.style.transform)![1]);
      offsets.push(Math.abs(shown - (point.x + 1) * rect.width / 2));
    }
    renderer.dispose();
    return offsets;
  });
  for (const offset of offsets) expect(offset).toBeLessThan(.5);
  expect(errors).toEqual([]);
});

test('label clicks select only after the first frame, with the origin of the input', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  const errors = await openHarness(page);
  await page.evaluate(() => {
    const { core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    // Labels 3 m apart never overlap; the floor comes last, so the first slice builds a labelled box.
    const nodes: import('@opsorama/core').SceneNode[] = [];
    for (let index = 0; index < 6; index++) {
      nodes.push({ id: `box-${index}`, kind: 'shape', shape: { type: 'box', size: [1, 1, 1] }, position: [index * 3 - 7.5, 0, 0], label: `Box ${index}`, selectable: true });
    }
    nodes.push({ id: 'floor', kind: 'ground', size: [20, 20] });
    const store = core.createSceneStore({ schemaVersion: 1, nodes }), origins: string[] = [];
    const renderer = three.createSceneRenderer(host, store, { assets: {}, buildBudget: 0, onSelect: selection => origins.push(selection?.origin ?? 'none') });
    // The first slice is built synchronously; its label exists but the scene is not drawn yet.
    host.querySelector<HTMLElement>('[data-node-id="box-0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    Object.assign(window, { lifecycle: { store, renderer, origins, selectedDuringLoad: store.getSnapshot().selection } });
  });
  expect(await page.evaluate(() => (window as unknown as { lifecycle: { selectedDuringLoad: unknown } }).lifecycle.selectedDuringLoad)).toBeNull();
  await page.evaluate(() => (window as unknown as { lifecycle: { renderer: { loaded: Promise<void> } } }).lifecycle.renderer.loaded);
  const label = page.getByRole('button', { name: 'Select Box 3' });
  await label.click();
  await label.focus(); await page.keyboard.press('Enter');
  const origins = await page.evaluate(() => (window as unknown as { lifecycle: { origins: string[] } }).lifecycle.origins);
  expect(origins).toEqual(['pointer', 'keyboard']);
  expect(errors).toEqual([]);
});

test('the brackets of a selected group follow its contents as they move', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  const errors = await openHarness(page);
  const centre = await page.evaluate(async () => {
    const { core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    const store = core.createSceneStore({ schemaVersion: 1, nodes: [
      { id: 'floor', kind: 'ground', size: [20, 20] },
      { id: 'series', kind: 'group', selectable: true },
      { id: 'bar', kind: 'shape', parentId: 'series', shape: { type: 'box', size: [1, 2, 1] } },
    ] }, { motion: false, selectionStyle: 'corners' });
    let context: import('@opsorama/three').RendererPluginContext | null = null;
    const renderer = three.createSceneRenderer(host, store, { assets: {}, plugins: [{ name: 'probe', setup: value => { context = value; } }] });
    await renderer.loaded; store.select('series');
    // The bar moves inside the group without a store change; the brackets are measured again from its new place.
    renderer.onFrame(() => { context!.nodeObject('bar')!.position.x = 3; });
    for (let frame = 0; frame < 5; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
    const corners = context!.nodeObject('series')!.getObjectByName('selection-corners')!;
    const x = corners.position.x; renderer.dispose();
    return x;
  });
  expect(centre).toBeCloseTo(3, 2);
  expect(errors).toEqual([]);
});

test('a graphics context lost during the load ends it in the error phase and the renderer stays stopped after a restore', async ({ page }) => {
  test.setTimeout(ciScaled(60000));
  const errors = await openHarness(page);
  const result = await page.evaluate(async () => {
    const { core, three } = (window as unknown as HarnessWindow).opsorama, host = document.getElementById('host')!;
    const nodes: import('@opsorama/core').SceneNode[] = [{ id: 'floor', kind: 'ground', size: [20, 20] }];
    for (let index = 0; index < 40; index++) {
      nodes.push({ id: `box-${index}`, kind: 'shape', shape: { type: 'box', size: [.5, .5, .5] }, position: [index % 8 - 4, 0, Math.floor(index / 8) - 2] });
    }
    const store = core.createSceneStore({ schemaVersion: 1, nodes }), reported: string[] = [], phases: string[] = [];
    let context: import('@opsorama/three').RendererPluginContext | null = null;
    const renderer = three.createSceneRenderer(host, store, {
      assets: {}, buildBudget: 0, onError: error => reported.push(error.message), onLoad: state => phases.push(state.phase),
      plugins: [{ name: 'probe', setup: value => { context = value; } }],
    });
    const lose = context!.renderer.getContext().getExtension('WEBGL_lose_context')!;
    lose.loseContext();
    const timeout = new Promise(resolve => setTimeout(() => resolve('pending'), 10000));
    const outcome = await Promise.race([renderer.loaded.then(() => 'resolved', (error: Error) => `rejected: ${error.message}`), timeout]);
    const state = renderer.getLoadState();
    lose.restoreContext();
    await new Promise(resolve => setTimeout(resolve, 500));
    const framesAfterRestore = renderer.getDiagnostics().renderedFrames;
    renderer.dispose();
    return { outcome, phase: state.phase, phases: [...new Set(phases)], reported, framesAfterRestore };
  });
  expect(result.outcome).toContain('rejected: Graphics context lost.');
  expect(result.phase).toBe('error');
  expect(result.phases).toContain('error'); expect(result.phases).not.toContain('loaded');
  expect(result.reported).toEqual([expect.stringContaining('Graphics context lost.')]);
  expect(result.framesAfterRestore).toBe(0);
  expect(errors).toEqual([]);
});

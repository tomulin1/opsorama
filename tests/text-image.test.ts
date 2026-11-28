import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { createSceneStore, DEFAULT_TEXT_SIZE, IMAGE_SRC_PATTERN, MAX_TEXT_LENGTH, TEXT_ALIGNS, validateScene, type ImageNode, type SceneNode, type SceneStore, type TextNode } from '@opsorama/core';
import { applyShadowPolicy, createGlowHighlight, createInstanceBatcher, disposeObject, IMAGE_LOAD_ERROR, mergeStaticParts, nearestNodeHit } from '@opsorama/three';
import * as ReactAdapter from '@opsorama/react';
import * as VueAdapter from '@opsorama/vue';
import { buildNodeObject, contentBounds, createNodeTextures, IMAGE_PLACEHOLDER_COLORS, TEXT_COLORS, textColor, type NodeBuildContext } from '../packages/three/src/nodes';
import { createImageTextureCache, createTextTextureCache, drawTextTexture, MAX_TEXT_TEXTURE_SIZE, TEXT_CAP_PIXELS, TEXT_LINE_SPACING, textLines, type ImageLoadCallbacks, type TextCanvas, type TextCanvasContext } from '../packages/three/src/text-texture';
import { brandImage, chartValues, primitivesDefinition, valueLabel, SERIES } from '../apps/site/examples/primitives-data';

/**
 * A canvas stand-in for Node: characters are 0.6 of the font size wide and capitals 0.7 of it tall. It records what is
 * drawn, so tests can check the layout without a browser.
 */
function fakeCanvas() {
  const drawn: { text: string; x: number; y: number; font: string; fill: unknown; align: string }[] = [];
  const context: TextCanvasContext = {
    font: '10px sans-serif', fillStyle: '#000', textAlign: 'start', textBaseline: 'alphabetic',
    measureText(text) { const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)![1]); return { width: text.length * size * .6, actualBoundingBoxAscent: size * .7 }; },
    clearRect() {}, fillText(text, x, y) { drawn.push({ text, x, y, font: this.font, fill: this.fillStyle, align: this.textAlign }); },
  };
  const canvas: TextCanvas & { drawn: typeof drawn } = { width: 300, height: 150, getContext: () => context, drawn };
  return canvas;
}
const canvases: ReturnType<typeof fakeCanvas>[] = [];
const createCanvas = () => { const canvas = fakeCanvas(); canvases.push(canvas); return canvas; };

/** An image loader under test control: each load waits until `finish` or `fail` is called for its src. */
function manualLoader() {
  const pending = new Map<string, ImageLoadCallbacks[]>(), cancelled: string[] = [], started: string[] = [];
  const loader = (src: string, callbacks: ImageLoadCallbacks) => {
    started.push(src); pending.set(src, [...pending.get(src) ?? [], callbacks]);
    return () => { cancelled.push(src); pending.set(src, (pending.get(src) ?? []).filter(item => item !== callbacks)); };
  };
  const image = { width: 4, height: 4 } as unknown as TexImageSource;
  return {
    loader, started, cancelled,
    finish(src: string) { const list = pending.get(src) ?? []; pending.delete(src); list.forEach(callbacks => callbacks.load(image)); },
    fail(src: string) { const list = pending.get(src) ?? []; pending.delete(src); list.forEach(callbacks => callbacks.error()); },
  };
}
/** Whether `texture` has been disposed, through the event Three.js sends. */
function watchDisposal(texture: THREE.Texture) { let disposed = false; texture.addEventListener('dispose', () => { disposed = true; }); return () => disposed; }

const text = (id: string, extra: Partial<TextNode> = {}): TextNode => ({ id, kind: 'text', text: 'Dock 4', ...extra });
const image = (id: string, extra: Partial<ImageNode> = {}): ImageNode => ({ id, kind: 'image', src: '/logo.png', size: [2, 1], ...extra });
function buildContext(extra: Partial<NodeBuildContext> = {}) {
  const loads = manualLoader(), errors: Error[] = [], textures = createNodeTextures({ createCanvas, loadImage: loads.loader });
  return { loads, errors, textures, context: { assets: {}, theme: 'light' as const, textures, onError: (error: Error) => errors.push(error), ...extra } };
}
const partOf = (object: THREE.Object3D) => object.children[0] as THREE.Mesh | THREE.Sprite;

describe('text and image nodes in the store and validateScene', () => {
  it('accepts both kinds and freezes the image size', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'g', kind: 'group' }, text('t', { parentId: 'g', size: 1, billboard: true, align: 'left', color: '#123456' }), image('i', { parentId: 'g', billboard: true })] });
    const stored = store.getSnapshot().nodes[2] as ImageNode;
    expect(Object.isFrozen(stored) && Object.isFrozen(stored.size)).toBe(true);
    expect(validateScene({ schemaVersion: 1, nodes: store.getSnapshot().nodes })).toEqual([]);
  });

  it('reports each problem with a path, a rule and a fix', () => {
    const problems = validateScene({ schemaVersion: 1, nodes: [
      { id: 't', kind: 'text', text: 7, size: 30, align: 'justify' },
      { id: 'e', kind: 'text', text: '😀'.repeat(MAX_TEXT_LENGTH) },
      { id: 'i', kind: 'image', src: 'FILE:///C:/logo.png', size: [0, 1], controller: { kind: 'approach' } },
      { id: 'c', kind: 'image', src: 'C:\\images\\logo.png', size: [1, 1] },
    ] });
    const at = (path: string) => problems.find(problem => problem.path === path);
    expect(at('/nodes/0/text')).toMatchObject({ rule: 'text', nodeId: 't', message: expect.stringContaining('requires a text string') });
    expect(at('/nodes/0/size')).toMatchObject({ rule: 'text-size', fix: expect.stringContaining('height of capital letters') });
    expect(at('/nodes/0/align')).toMatchObject({ rule: 'allowed-value', fix: expect.stringContaining('left, center, right') });
    // Characters are code points: 500 emoji are 500 characters, as in the JSON Schema.
    expect(at('/nodes/1/text')).toBeUndefined();
    expect(at('/nodes/2/src')).toMatchObject({ rule: 'image-src', message: expect.stringContaining('uses the file: scheme') });
    expect(at('/nodes/2/size')).toMatchObject({ rule: 'image-size' });
    expect(at('/nodes/2/controller')).toMatchObject({ rule: 'motion-owner', fix: expect.stringContaining('a group moves everything inside it') });
    expect(at('/nodes/3/src')).toMatchObject({ rule: 'image-src', message: expect.stringContaining('uses the c: scheme') });
  });

  it('accepts relative, http(s), blob and data:image URLs and rejects every other form, as the schema does', () => {
    const accepted = ['/brand/logo.png', 'logo.png', './a/b.png', '../b.webp', '//cdn.example.com/a.png', 'images/a:b.png', 'https://example.com/a.png?v=1', 'HTTP://example.com/a.png', 'blob:https://example.com/1234', 'data:image/png;base64,iVBORw0KGgo=', 'Data:Image/svg+xml,<svg/>', 'logo with space.png'];
    const rejected = ['javascript:alert(1)', 'JavaScript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', ' javascript:alert(1)', 'logo.png ', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com/a.png', 'vbscript:x', 'C:\\logo.png', '\u0000logo.png'];
    const valid = (src: string) => validateScene({ schemaVersion: 1, nodes: [image('i', { src })] }).length === 0;
    for (const src of accepted) { expect(IMAGE_SRC_PATTERN.test(src), src).toBe(true); expect(valid(src), src).toBe(true); }
    for (const src of rejected) { expect(IMAGE_SRC_PATTERN.test(src), src).toBe(false); expect(valid(src), src).toBe(false); }
    const schema = JSON.parse(readFileSync('packages/core/schema/scene-definition.schema.json', 'utf8'));
    expect(new RegExp(schema.definitions.ImageNode.properties.src.pattern, 'u').source).toBe(IMAGE_SRC_PATTERN.source);
    expect(schema.definitions.TextAlign.enum).toEqual([...TEXT_ALIGNS]);
  });
});

describe('text textures', () => {
  it('lays out lines in capital-letter heights, anchored by the alignment', () => {
    const one = drawTextTexture({ text: 'Dock', color: '#ff0000', align: 'center' }, createCanvas), canvas = canvases.at(-1)!;
    expect(canvas.width).toBe(Math.ceil(one.width * TEXT_CAP_PIXELS)); expect(one.anchor).toBe(.5);
    expect(canvas.drawn).toEqual([expect.objectContaining({ text: 'Dock', fill: '#ff0000', align: 'center', x: canvas.width / 2 })]);
    expect(canvas.drawn[0].font).toMatch(/^600 .*px system-ui/);
    const two = drawTextTexture({ text: 'Dock\r\nNorth', color: '#000000', align: 'right' }, createCanvas);
    expect(two.height - one.height).toBeCloseTo(TEXT_LINE_SPACING, 1); expect(two.anchor).toBe(1);
    expect(drawTextTexture({ text: 'a', color: '#000', align: 'left' }, createCanvas).anchor).toBe(0);
    expect(textLines('a\nb\rc\r\nd')).toEqual(['a', 'b', 'c', 'd']);
    // Long text is drawn at a lower resolution so its texture stays within the size limit; its size in metres does not change.
    const long = drawTextTexture({ text: 'W'.repeat(MAX_TEXT_LENGTH), color: '#000', align: 'center' }, createCanvas);
    expect(canvases.at(-1)!.width).toBeLessThanOrEqual(MAX_TEXT_TEXTURE_SIZE); expect(long.width).toBeGreaterThan(300);
  });

  it('shares one texture per text, color and alignment and disposes it with its last user', () => {
    const cache = createTextTextureCache(createCanvas), style = { text: '42', color: '#000000', align: 'center' as const };
    const a = cache.acquire(style), b = cache.acquire(style), c = cache.acquire({ ...style, color: '#ffffff' });
    expect(a.value.texture).toBe(b.value.texture); expect(c.value.texture).not.toBe(a.value.texture); expect(cache.size).toBe(2);
    const disposed = watchDisposal(a.value.texture);
    a.release(); a.release(); expect(disposed()).toBe(false);
    b.release(); expect(disposed()).toBe(true); expect(cache.size).toBe(1);
    // A new use after release draws a fresh texture.
    expect(cache.acquire(style).value.texture).not.toBe(a.value.texture);
    cache.dispose(); expect(cache.size).toBe(0);
  });
});

describe('image textures', () => {
  it('share one load per src, apply it when it arrives and dispose it with the last user', () => {
    const loads = manualLoader(), cache = createImageTextureCache(loads.loader), seen: THREE.Texture[] = [];
    const releaseA = cache.acquire('/a.png', { load: texture => seen.push(texture), error: () => undefined });
    const releaseB = cache.acquire('/a.png', { load: texture => seen.push(texture), error: () => undefined });
    expect(loads.started).toEqual(['/a.png']); expect(seen).toEqual([]);
    loads.finish('/a.png');
    expect(seen).toHaveLength(2); expect(seen[0]).toBe(seen[1]); expect(seen[0].colorSpace).toBe(THREE.SRGBColorSpace); expect(seen[0].anisotropy).toBe(8);
    // A later user gets the loaded texture at once.
    const late: THREE.Texture[] = [], releaseC = cache.acquire('/a.png', { load: texture => late.push(texture), error: () => undefined });
    expect(late).toEqual([seen[0]]);
    const disposed = watchDisposal(seen[0]);
    releaseA(); releaseB(); expect(disposed()).toBe(false); releaseC(); expect(disposed()).toBe(true); expect(cache.size).toBe(0);
  });

  it('cancel a load whose users all left, and never call them back', () => {
    const loads = manualLoader(), cache = createImageTextureCache(loads.loader), calls: string[] = [];
    const release = cache.acquire('/slow.png', { load: () => calls.push('load'), error: () => calls.push('error') });
    release(); expect(loads.cancelled).toEqual(['/slow.png']);
    loads.finish('/slow.png'); expect(calls).toEqual([]); expect(cache.size).toBe(0);
  });

  it('report a failed load to every user, and load again once it is no longer used', () => {
    const loads = manualLoader(), cache = createImageTextureCache(loads.loader), calls: string[] = [];
    const release = cache.acquire('/missing.png', { load: () => calls.push('load'), error: () => calls.push('a') });
    loads.fail('/missing.png');
    const releaseLate = cache.acquire('/missing.png', { load: () => calls.push('load'), error: () => calls.push('b') });
    expect(calls).toEqual(['a', 'b']); expect(loads.started).toHaveLength(1);
    release(); releaseLate(); cache.acquire('/missing.png', { load: () => undefined, error: () => undefined });
    expect(loads.started).toHaveLength(2);
    cache.dispose(); expect(loads.cancelled).toEqual(['/missing.png']);
  });
});

describe('building text nodes', () => {
  it('draws a flat plane standing on the origin, or a billboard sprite, sized by the capital height', () => {
    const { context } = buildContext();
    const flat = buildNodeObject(text('t', { size: .5, align: 'left' }), context), plane = partOf(flat) as THREE.Mesh;
    expect(plane).toBeInstanceOf(THREE.Mesh); expect(plane.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    const material = plane.material as THREE.MeshBasicMaterial;
    expect(material.transparent && material.side === THREE.DoubleSide && !material.toneMapped && material.map !== null).toBe(true);
    const bounds = new THREE.Box3().setFromObject(flat);
    expect(bounds.min.x).toBeCloseTo(0); expect(bounds.min.y).toBeCloseTo(0); expect(plane.castShadow).toBe(false);
    expect(flat.userData.labelHeight).toBeCloseTo(bounds.max.y + .3);
    const sprite = partOf(buildNodeObject(text('b', { billboard: true, align: 'right' }), context)) as THREE.Sprite;
    expect(sprite).toBeInstanceOf(THREE.Sprite); expect(sprite.center.x).toBe(1);
    expect(sprite.scale.y / DEFAULT_TEXT_SIZE).toBeCloseTo(sprite.position.y * 2 / DEFAULT_TEXT_SIZE);
  });

  it('takes its color from the node, then the palette text role, then the theme', () => {
    expect(textColor(text('t'), { theme: 'light' })).toBe(TEXT_COLORS.light);
    expect(textColor(text('t'), { theme: 'midnight', palette: { text: '#abcdef' } })).toBe('#abcdef');
    expect(textColor(text('t', { color: '#010203' }), { theme: 'midnight' })).toBe('#010203');
  });

  it('shares textures between equal text, is never merged, instanced or glowed, and releases its texture on disposal', () => {
    const { context, textures } = buildContext(), scene = new THREE.Scene(), batcher = createInstanceBatcher(scene);
    const objects = ['a', 'b', 'c', 'd'].map((id, index) => {
      const object = buildNodeObject(text(id, { text: '42' }), context); applyShadowPolicy(object, { interior: false });
      expect(mergeStaticParts(object)).toEqual({ meshesBefore: 1, meshesAfter: 1 });
      object.position.x = index; object.traverse(child => { child.userData.nodeId = id; }); scene.add(object); return object;
    });
    scene.updateMatrixWorld(true); objects.forEach(object => batcher.add(object)); batcher.update();
    expect(batcher.stats()).toEqual({ batches: 0, instances: 0 }); expect(textures.text.size).toBe(1);
    const glow = createGlowHighlight(scene, () => true); glow.show('selected', objects[0], '#4779ed');
    expect(scene.getObjectByName('selection-glow')!.children).toHaveLength(0); glow.dispose();
    const texture = ((partOf(objects[0]) as THREE.Mesh).material as THREE.MeshBasicMaterial).map!, disposed = watchDisposal(texture);
    const material = (partOf(objects[0]) as THREE.Mesh).material as THREE.Material; let materialDisposed = false; material.addEventListener('dispose', () => { materialDisposed = true; });
    objects.slice(0, 3).forEach(object => { batcher.remove(object); disposeObject(object); });
    expect(disposed()).toBe(false); expect(materialDisposed).toBe(true);
    disposeObject(objects[3]); expect(disposed()).toBe(true); expect(textures.text.size).toBe(0);
  });

  it('disposes a sprite material but never the geometry every sprite shares', () => {
    const { context } = buildContext(), object = buildNodeObject(text('t', { billboard: true }), context), sprite = partOf(object) as THREE.Sprite;
    let geometryDisposed = false, materialDisposed = false;
    sprite.geometry.addEventListener('dispose', () => { geometryDisposed = true; }); sprite.material.addEventListener('dispose', () => { materialDisposed = true; });
    disposeObject(object);
    expect(materialDisposed).toBe(true); expect(geometryDisposed).toBe(false);
  });

  it('owns its texture without shared caches', () => {
    const fallback = createNodeTextures({ createCanvas }), object = buildNodeObject(text('t'), { assets: {}, theme: 'light', textures: fallback });
    expect(fallback.text.size).toBe(1); disposeObject(object); expect(fallback.text.size).toBe(0);
  });
});

describe('building image nodes', () => {
  it('shows a placeholder until the image arrives, then the picture, and redraws on-demand renderers', () => {
    let redraws = 0;
    const { context, loads } = buildContext({ onTextureLoad: () => { redraws++; } });
    const object = buildNodeObject(image('i', { size: [3, 2] }), context), plane = partOf(object) as THREE.Mesh, material = plane.material as THREE.MeshBasicMaterial;
    expect(material.map).toBeNull(); expect(material.color.getHexString()).toBe(new THREE.Color(IMAGE_PLACEHOLDER_COLORS.light).getHexString());
    expect(material.transparent).toBe(true);
    const bounds = new THREE.Box3().setFromObject(object);
    expect(bounds.min.toArray()).toEqual([-1.5, 0, 0]); expect(bounds.max.toArray()).toEqual([1.5, 2, 0]); expect(object.userData.labelHeight).toBeCloseTo(2.3);
    loads.finish('/logo.png');
    expect(material.map).toBeInstanceOf(THREE.Texture); expect(material.color.getHexString()).toBe('ffffff'); expect(redraws).toBe(1);
    // A second node with the same src gets the loaded texture while it is built, without a redraw request.
    const second = buildNodeObject(image('j', { billboard: true }), context), sprite = partOf(second) as THREE.Sprite;
    expect(sprite.material.map).toBe(material.map); expect(redraws).toBe(1); expect(loads.started).toEqual(['/logo.png']);
  });

  it('never applies a late image to a node that was removed or rebuilt, and cancels a load nobody needs', () => {
    const { context, loads, textures } = buildContext();
    const removed = buildNodeObject(image('i', { src: '/old.png' }), context), material = (partOf(removed) as THREE.Mesh).material as THREE.MeshBasicMaterial;
    disposeObject(removed);
    expect(loads.cancelled).toEqual(['/old.png']); expect(textures.images.size).toBe(0);
    loads.finish('/old.png'); expect(material.map).toBeNull();
    // A rebuild with a new src keeps the old load only while another node uses it.
    const keeper = buildNodeObject(image('k', { src: '/shared.png' }), context), changing = buildNodeObject(image('c', { src: '/shared.png' }), context);
    disposeObject(changing); const rebuilt = buildNodeObject(image('c', { src: '/new.png' }), context);
    expect(loads.cancelled).toEqual(['/old.png']); expect(textures.images.size).toBe(2);
    loads.finish('/shared.png');
    expect(((partOf(changing) as THREE.Mesh).material as THREE.MeshBasicMaterial).map).toBeNull();
    expect(((partOf(keeper) as THREE.Mesh).material as THREE.MeshBasicMaterial).map).not.toBeNull();
    expect(((partOf(rebuilt) as THREE.Mesh).material as THREE.MeshBasicMaterial).map).toBeNull();
  });

  it('reports a failed load with the node, the URL and the CORS hint, keeping the placeholder', () => {
    const { context, loads, errors } = buildContext(), object = buildNodeObject(image('logo', { src: 'https://cdn.example.com/logo.png' }), context);
    loads.fail('https://cdn.example.com/logo.png');
    expect(errors).toHaveLength(1); expect(errors[0].name).toBe(IMAGE_LOAD_ERROR);
    expect(errors[0].message).toMatch(/^Image node logo could not load "https:\/\/cdn\.example\.com\/logo\.png"\./);
    expect(errors[0].message).toContain('Access-Control-Allow-Origin');
    expect(((partOf(object) as THREE.Mesh).material as THREE.MeshBasicMaterial).map).toBeNull();
    // Long data URLs are shortened in the message.
    buildNodeObject(image('inline', { src: `data:image/png;base64,${'A'.repeat(500)}` }), context); loads.fail(`data:image/png;base64,${'A'.repeat(500)}`);
    expect(errors[1].message.length).toBeLessThan(600); expect(errors[1].message).toContain('…');
  });

  it('releases every texture when the renderer disposes its caches', () => {
    const { context, loads, textures } = buildContext();
    buildNodeObject(text('t'), context); buildNodeObject(image('i'), context); loads.finish('/logo.png');
    const texture = ((partOf(buildNodeObject(image('j'), context)) as THREE.Mesh).material as THREE.MeshBasicMaterial).map!, disposed = watchDisposal(texture);
    textures.dispose();
    expect(disposed()).toBe(true); expect(textures.text.size).toBe(0); expect(textures.images.size).toBe(0);
  });
});

describe('picking text and images', () => {
  it('hits billboard sprites with a camera ray and resolves their node, and bounds include them', () => {
    const { context } = buildContext(), scene = new THREE.Scene();
    const root = buildNodeObject({ id: 'g', kind: 'group' }, context); root.userData.nodeId = 'g'; scene.add(root);
    const label = buildNodeObject(text('value', { billboard: true, size: 1 }), context); label.position.set(2, 0, 0); label.traverse(child => { child.userData.nodeId = 'value'; }); root.add(label);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 100); camera.position.set(2, 1, 10); camera.lookAt(2, 1, 0); camera.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    expect(hits[0]?.object).toBeInstanceOf(THREE.Sprite);
    expect(nearestNodeHit(hits, id => id === 'value')?.nodeId).toBe('value');
    const bounds = contentBounds(root);
    expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.x).toBeGreaterThan(2);
  });
});

describe('SceneText and SceneImage components', () => {
  it('exist in both adapters and render nothing on the server', () => {
    for (const name of ['SceneText', 'SceneImage'] as const) { expect(ReactAdapter).toHaveProperty(name); expect(VueAdapter).toHaveProperty(name); }
    const store = createSceneStore(), Provider = ReactAdapter.DashboardProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>;
    const html = renderReact(createElement(Provider, { store }, createElement(ReactAdapter.SceneText, { key: 't', id: 't', text: 'Dock' }), createElement(ReactAdapter.SceneImage, { key: 'i', id: 'i', src: '/logo.png', size: [1, 1] })));
    expect(html).toBe('');
  });

  it('pass text, size, billboard, align and src through the Vue props without defaults', async () => {
    const store = createSceneStore();
    const app = createSSRApp({ render: () => h(VueAdapter.DashboardProvider, { store }, { default: () => [
      h(VueAdapter.SceneText, { id: 't', text: 'Dock 4', size: .5, billboard: true, align: 'left' }),
      h(VueAdapter.SceneText, { id: 'plain', text: 'Plain' }),
      h(VueAdapter.SceneImage, { id: 'i', src: '/logo.png', size: [2, 1] }),
    ] }) });
    await renderVue(app);
    const nodes = new Map(store.getSnapshot().nodes.map(node => [node.id, node]));
    expect(nodes.get('t')).toMatchObject({ kind: 'text', text: 'Dock 4', size: .5, billboard: true, align: 'left' });
    expect((nodes.get('plain') as TextNode).billboard).toBeUndefined();
    expect(nodes.get('i')).toMatchObject({ kind: 'image', src: '/logo.png', size: [2, 1] });
    expect(validateScene({ schemaVersion: 1, nodes: [...nodes.values()] as SceneNode[] }).filter(problem => problem.severity === 'error')).toEqual([]);
  });
});

describe('primitives example text and image', () => {
  it('adds value labels, flat titles and a same-origin image, and drops only the value labels when they are off', () => {
    const values = chartValues(2), withLabels = primitivesDefinition(values), without = primitivesDefinition(values, false);
    expect(validateScene(withLabels)).toEqual([]); expect(validateScene(without)).toEqual([]);
    const texts = (nodes: readonly SceneNode[]) => nodes.filter(node => node.kind === 'text');
    expect(texts(withLabels.nodes).length - texts(without.nodes).length).toBe(SERIES.length * values[0].length);
    expect(valueLabel(SERIES[0], 0, 42)).toMatchObject({ text: '42', billboard: true, parentId: 'series-north' });
    expect(brandImage.src.startsWith('/brand/')).toBe(true);
    expect(readFileSync(`apps/site/public${brandImage.src}`).subarray(1, 4).toString()).toBe('PNG');
  });
});

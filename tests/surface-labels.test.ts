import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ts from 'typescript';
import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc';
import { createSceneStore, validateSurfaceLabel, type AssetNode, type SurfaceLabel } from '@opsorama/core';
import { assetLabelSurfaces, basicAssets, disposeObject } from '@opsorama/renderer-three';
import { catalogObjects, objectNode, objectSnippet } from '../src/features/docs/objects';

const text: SurfaceLabel = { kind: 'text', text: 'North', color: '#243650', background: '#fffaf2' };
const node: AssetNode = { id: 'parcels', kind: 'asset', asset: 'parcel-base', count: 27, multiplier: 1000, label: '27,000 parcels', surfaceLabel: text };
function mockCanvas() {
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), measureText: () => ({ width: 90 }), fillText: vi.fn(), drawImage: vi.fn() };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  return context;
}
function stickers(object: THREE.Object3D) {
  const result: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  object.traverse(part => { if (part.name === 'surface-label') result.push(part as typeof result[number]); });
  return result;
}
afterEach(() => vi.unstubAllGlobals());

describe('static surface labels', () => {
  it('validates content without DOM imports and rejects malformed input atomically', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [node] }); store.select(node.id);
    const copied = store.getSnapshot().nodes[0] as AssetNode;
    expect(copied.surfaceLabel).not.toBe(text); expect(Object.isFrozen(copied.surfaceLabel)).toBe(true);
    const snapshot = store.getSnapshot();
    for (const invalid of [{ kind: 'html', text: 'X' }, { kind: 'text', text: '' }, { kind: 'text', text: 'X'.repeat(81) }, { kind: 'text', text: 'Two\nlines' }, { kind: 'text', text: 'X', color: 'url(example)' }, { kind: 'svg', svg: '<svg/>', alt: '' }, { kind: 'svg', svg: 'X'.repeat(20001), alt: 'X' }]) {
      expect(() => store.upsert({ ...node, surfaceLabel: invalid as SurfaceLabel })).toThrow(); expect(store.getSnapshot()).toBe(snapshot);
    }
    expect(() => validateSurfaceLabel({ kind: 'svg', svg: '<svg/>', alt: 'Logo' })).not.toThrow(); // XML validation belongs to the renderer.
    store.upsert({ ...node, surfaceLabel: undefined });
    expect(store.getSnapshot().selection?.nodeId).toBe(node.id);
    expect(store.getSnapshot().nodes[0]).toMatchObject({ count: 27, multiplier: 1000, label: '27,000 parcels' }); store.dispose();
  });

  it('repeats parcel artwork without identities and disposes the shared owned texture once', () => {
    const context = mockCanvas(), object = basicAssets['parcel-base'](node), labels = stickers(object);
    expect(labels).toHaveLength(27); expect(new Set(labels.map(label => label.material.map)).size).toBe(1);
    expect(context.fillText).toHaveBeenCalledWith('North', 512, expect.any(Number));
    const texture = labels[0].material.map!; expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    const released = vi.spyOn(texture, 'dispose'), geometry = vi.spyOn(labels[0].geometry, 'dispose'), material = vi.spyOn(labels[0].material, 'dispose');
    expect(labels.every(label => label.userData.entityId === undefined)).toBe(true);
    const barcode = object.getObjectByName('parcel-barcode'); expect(barcode?.visible).toBe(false);
    disposeObject(object); expect(released).toHaveBeenCalledTimes(1); expect(geometry).toHaveBeenCalledTimes(1); expect(material).toHaveBeenCalledTimes(1);
    disposeObject(object); expect(released).toHaveBeenCalledTimes(1);
  });

  it('declares surfaces only for suitable portable models with bounded, static and independent resources', () => {
    mockCanvas();
    for (const [key, surface] of Object.entries(assetLabelSurfaces)) {
      const item = catalogObjects.find(item => item.asset === key)!;
      expect(item.asset).toBeDefined(); expect(surface.size.every(value => value > 0)).toBe(true);
      const definition = objectNode(item, { surfaceLabel: text }) as AssetNode;
      const a = basicAssets[key](definition), b = basicAssets[key](definition);
      const label = stickers(a)[0], other = stickers(b)[0]; expect(label).toBeDefined();
      expect(label.material.map).not.toBe(other.material.map); expect(label.position.toArray()).toEqual([...surface.position]);
      expect(label.geometry.parameters).toMatchObject({ width: surface.size[0], height: surface.size[1] });
      if (a.userData.displayBounds) expect(a.userData.displayBounds.equals(new THREE.Box3().setFromObject(a))).toBe(true);
      expect(Math.max(label.material.map!.image.width, label.material.map!.image.height)).toBe(surface.resolution ?? 1024);
      disposeObject(a); disposeObject(b);
    }
    expect(() => basicAssets['tree-pine']({ ...node, asset: 'tree-pine' })).toThrow('no surface label configuration');
  });

  it('renders bounded multiline monitor text at 2048 pixels and releases its texture', () => {
    const context = mockCanvas();
    const label: SurfaceLabel = { kind: 'text', layout: 'multiline', text: 'TEST\n2 workflow attempts\n1 failed | 1 cancelled' };
    expect(() => validateSurfaceLabel(label)).not.toThrow();
    for (const value of [{ ...label, text: 'x'.repeat(81) }, { ...label, text: Array(7).fill('row').join('\n') }, { ...label, text: 'x'.repeat(481) }, { ...label, layout: 'invalid' }]) expect(() => validateSurfaceLabel(value as SurfaceLabel)).toThrow();
    const object = basicAssets.monitor({ id: 'screen', kind: 'asset', asset: 'monitor', surfaceLabel: label });
    const texture = stickers(object)[0].material.map!;
    expect(texture.image.width).toBe(2048); expect(texture.image.height).toBe(Math.round(2048 * 1.2 / 2.2));
    expect(texture.anisotropy).toBe(8); expect(texture.magFilter).toBe(THREE.LinearFilter); expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(context.fillText.mock.calls.map(call => call[0])).toEqual(['TEST', '2 workflow attempts', '1 failed | 1 cancelled']);
    expect(context.fillText.mock.calls[0][2]).toBeLessThan(context.fillText.mock.calls[1][2]);
    const dispose = vi.spyOn(texture, 'dispose'); disposeObject(object); expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('exports matching JS/React/Vue definitions with a valid Vue object binding', () => {
    const item = catalogObjects.find(item => item.asset === 'storefront')!;
    const definition = objectNode(item, { surfaceLabel: { kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"/>', alt: 'North logo' } });
    expect(objectSnippet(definition, 'React')).toContain('surfaceLabel={{"kind":"svg"');
    expect(objectSnippet(definition, 'Vue')).toContain(':surfaceLabel="surfaceLabel"');
    expect(objectSnippet(definition, 'Vue')).toContain('const surfaceLabel: SurfaceLabel =');
    expect(objectSnippet(definition, 'JavaScript')).toContain('"surfaceLabel":');
    for (const label of [definition.kind === 'asset' ? definition.surfaceLabel! : text, { kind: 'text' as const, layout: 'multiline' as const, text: 'TEST\n2 attempts' }, { ...text, text: '<Alpha> & "Beta" \\ </script>' }]) {
      const configured = objectNode(item, { surfaceLabel: label });
      const { descriptor, errors } = parse(objectSnippet(configured, 'Vue'), { filename: 'LabelExample.vue' });
      expect(errors).toEqual([]); expect(() => compileScript(descriptor, { id: 'label-example' })).not.toThrow();
      expect(compileTemplate({ source: descriptor.template!.content, filename: 'LabelExample.vue', id: 'label-example' }).errors).toEqual([]);
      for (const framework of ['React', 'JavaScript'] as const) {
        const result = ts.transpileModule(objectSnippet(configured, framework), { fileName: framework === 'React' ? 'LabelExample.tsx' : 'label-example.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
        expect(result.diagnostics).toEqual([]);
      }
    }
  });

  it('cancels pending SVG decode, revokes Blob URLs, and ignores late callbacks after disposal', () => {
    const context = mockCanvas();
    const root = { localName: 'svg', namespaceURI: 'http://www.w3.org/2000/svg', querySelectorAll: () => [], attributes: [], getAttribute: () => '0 0 240 60', setAttribute: vi.fn() };
    vi.stubGlobal('DOMParser', class { parseFromString() { return { documentElement: root, querySelector: () => null }; } });
    vi.stubGlobal('XMLSerializer', class { serializeToString() { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"/>'; } });
    const pending: { onload: (() => void) | null; onerror: (() => void) | null; src: string }[] = [];
    vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; src = ''; constructor() { pending.push(this); } });
    const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: () => 'blob:label', revokeObjectURL: revoke });
    const make = () => basicAssets.storefront({ ...node, asset: 'storefront', surfaceLabel: { kind: 'svg', svg: '<svg/>', alt: 'North logo' } });
    const a = make(), texture = stickers(a)[0].material.map!, release = vi.spyOn(texture, 'dispose'), lateLoad = pending[0].onload!;
    expect(root.setAttribute).toHaveBeenCalledWith('width', '1024'); expect(root.setAttribute).toHaveBeenCalledWith('height', '256');
    disposeObject(a); expect(release).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledTimes(1);
    expect(pending[0].onload).toBeNull(); expect(pending[0].onerror).toBeNull(); expect(pending[0].src).toBe('');
    lateLoad(); expect(context.drawImage).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledTimes(1);
    const b = make(); pending[1].onload!(); expect(context.drawImage).toHaveBeenCalledTimes(1); expect(revoke).toHaveBeenCalledTimes(2);
    disposeObject(b); expect(revoke).toHaveBeenCalledTimes(2);
    const c = make(); pending[2].onerror!(); expect(revoke).toHaveBeenCalledTimes(3); disposeObject(c); expect(revoke).toHaveBeenCalledTimes(3);
  });
});

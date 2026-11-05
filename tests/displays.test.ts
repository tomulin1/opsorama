import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, formatDisplay, validateDisplay, type AssetNode, type DisplayReading } from '@opsorama/core';
import { assetDisplayDefinitions, basicAssets, disposeObject } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';

const node = (asset: string, display?: DisplayReading, variant?: string): AssetNode => ({ id: 'readout', kind: 'asset', asset, display, variant, selectable: true });
function lit(object: THREE.Object3D) { const names: string[] = []; object.traverse(part => { if (part.name.startsWith('digit-') && part.visible) names.push(part.name); }); return names; }
function color(object: THREE.Object3D, name: string) { return (object.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHexString(); }

describe('portable displays and time readings', () => {
  it('validates finite bounded inputs and snapshots readings atomically without source mutation', () => {
    const input: DisplayReading = { kind: 'clock', seconds: 36630, running: true }, store = createSceneStore({ schemaVersion: 1, nodes: [node('digital-clock', input)] });
    expect(Object.isFrozen((store.getSnapshot().nodes[0] as AssetNode).display)).toBe(true);
    input.seconds = 0; expect((store.getSnapshot().nodes[0] as AssetNode).display).toMatchObject({ seconds: 36630 });
    const before = store.getSnapshot();
    for (const invalid of [{ kind: 'clock', seconds: -1 }, { kind: 'clock', seconds: 86400 }, { kind: 'clock', seconds: .5 }, { kind: 'stopwatch', seconds: 360000 }, { kind: 'countdown', seconds: NaN }, { kind: 'clock', seconds: 0, running: 'yes' }, { kind: 'number', value: Infinity }, { kind: 'number', value: 10000 }, { kind: 'number', value: 1, decimals: 3 }, { kind: 'other', seconds: 0 }]) {
      expect(() => store.upsert(node('digital-clock', invalid as DisplayReading))).toThrow(); expect(store.getSnapshot()).toBe(before);
    }
    for (const extra of [{ count: 1 }, { multiplier: 2 }, { measurement: { value: 1 } }, { surfaceLabel: { kind: 'text' as const, text: 'X' } }]) expect(() => store.upsert({ ...node('digital-clock', { kind: 'clock', seconds: 0 }), ...extra })).toThrow();
    expect(() => basicAssets.monitor(node('monitor', { kind: 'clock', seconds: 0 }))).toThrow('no display configuration');
    expect(() => basicAssets['digital-clock'](node('digital-clock', { kind: 'countdown', seconds: 0 }))).toThrow('requires a clock');
    store.dispose();
  });
  it('formats exact host inputs, unknown numbers and duration boundaries', () => {
    expect(formatDisplay({ kind: 'number', value: null })).toBe('----');
    expect(formatDisplay({ kind: 'number', value: -1234.5, decimals: 2 })).toBe('-1234.50');
    expect(formatDisplay({ kind: 'clock', seconds: 86399 })).toBe('23:59:59');
    expect(formatDisplay({ kind: 'clock', seconds: 36630 }, false)).toBe('10:10');
    expect(formatDisplay({ kind: 'stopwatch', seconds: 359999 })).toBe('99:59:59');
    expect(formatDisplay({ kind: 'countdown', seconds: 0 })).toBe('00:00:00');
    expect(() => validateDisplay(null as unknown as DisplayReading)).toThrow();
  });
  it('resolves semantic palette inheritance, partial overrides and neutral alert metadata without cross-instance changes', () => {
    const a = basicAssets['led-display']({ ...node('led-display'), color: '#123456', materials: { text: '#aabbcc' } }, { theme: 'midnight', palette: { structure: '#102030', text: '#456789' } });
    expect(color(a, 'readout-frame')).toBe('102030'); expect(color(a, 'readout-accent')).toBe('123456'); expect(color(a, 'digit-0-a')).toBe('aabbcc');
    const b = basicAssets['led-display']({ ...node('led-display'), state: 'critical', materials: { critical: '#aa0000' } });
    expect(color(b, 'digit-0-a')).toBe('d3eff6'); expect(color(a, 'digit-0-a')).toBe('aabbcc');
    const clock = basicAssets['analog-clock']({ ...node('analog-clock'), state: 'warning', materials: { text: '#aabbcc', warning: '#aabbcc', accent: '#123456' } });
    expect(color(clock, 'second-hand-pointer')).toBe('123456'); disposeObject(clock);
    disposeObject(a); disposeObject(b);
  });
  it('keeps all variants bounded, declares local anchors and releases every instance-owned resource and animator', () => {
    const costs: Record<string, number> = {};
    for (const [asset, definition] of Object.entries(assetDisplayDefinitions)) for (const variant of definition.variants) {
      const object = basicAssets[asset](node(asset, definition.default, variant)), bounds = object.userData.displayBounds as THREE.Box3;
      expect(bounds.isEmpty()).toBe(false); expect(bounds.min.y).toBeGreaterThanOrEqual(-.000001);
      for (const name of ['base', 'screen', 'mount']) expect(object.getObjectByName(`anchor-${name}`)).toBeDefined();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      object.traverse(part => { if (part instanceof THREE.Mesh) { geometries.add(part.geometry); materials.add(part.material); } });
      expect(geometries.size).toBeLessThan(90); costs[`${asset}/${variant}`] = geometries.size;
      const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
      const before = lit(object); disposeObject(object); animateAsset(object, { time: 100, delta: 100 }); expect(lit(object)).toEqual(before);
      expect(spies.every(spy => spy.mock.calls.length === 1)).toBe(true);
    }
    console.log('Display variant mesh/resource counts:', JSON.stringify(costs));
  });
  it('renders decimals, negative values and unknown values within eight slots', () => {
    for (const value of [null, 0, -9999.99, 9999.99]) {
      const object = basicAssets['led-display'](node('led-display', { kind: 'number', value, decimals: 2 }));
      expect(lit(object).length).toBeGreaterThan(0); expect(lit(object).length).toBeLessThanOrEqual(58); disposeObject(object);
    }
  });
  it('advances only visual delta, wraps/saturates/stops and resets to supplied host inputs', () => {
    for (const [asset, kind, seconds, delta, end] of [['digital-clock', 'clock', 86399, 1, 0], ['stopwatch', 'stopwatch', 359998, 20, 359999], ['countdown-timer', 'countdown', 1, 10, 0]] as const) {
      const object = basicAssets[asset](node(asset, { kind, seconds, running: true }));
      animateAsset(object, { time: 100000, delta });
      const expected = basicAssets[asset](node(asset, { kind, seconds: end })); expect(lit(object)).toEqual(lit(expected));
      const reset = basicAssets[asset](node(asset, { kind, seconds })); expect(lit(reset)).not.toEqual(lit(expected));
      disposeObject(object); disposeObject(expected); disposeObject(reset);
    }
    for (const running of [false, true]) {
      const object = basicAssets['analog-clock']({ ...node('analog-clock', { kind: 'clock', seconds: 36630, running }), state: 'inactive' });
      const before = object.getObjectByName('second-hand')!.rotation.z; animateAsset(object, { time: 1, delta: 1 }); expect(object.getObjectByName('second-hand')!.rotation.z).toBeCloseTo(before - (running ? Math.PI / 30 : 0)); disposeObject(object);
    }
    const staticClock = basicAssets['analog-clock'](node('analog-clock', { kind: 'clock', seconds: 0, running: false }));
    animateAsset(staticClock, { time: 500, delta: 500 }); expect(staticClock.getObjectByName('second-hand')!.rotation.z).toBe(-0); disposeObject(staticClock);
  });
});

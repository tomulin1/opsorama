import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveInteractionSlots, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions, assetInteractionSlots, assetLabelSurfaces, basicAssets, disposeObject, SOLAR_ARRAY } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof basicAssets[string]>[1]) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const parts = (object: THREE.Object3D) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (child.name.startsWith('count-part-')) list.push(child); }); return list; };
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()])); return values; };
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!.getWorldPosition(new THREE.Vector3()); };

const VARIANTS: Readonly<Record<string, readonly (string | undefined)[]>> = {
  'mobile-robot': ['deck', 'tote'], 'robot-arm': ['ready', 'reach'], 'machine-tool': [undefined], 'security-camera': ['wall', 'pole'],
  'ev-charger': [undefined], 'solar-array': [undefined], 'wind-turbine': [undefined], 'storage-tank': ['vertical', 'horizontal'], 'pump-unit': [undefined],
  'fence-segment': ['mesh', 'gate'], 'waste-bin': ['general', 'recycling', 'organic'], 'traffic-cone': [undefined],
};
/** Body parts that `color` changes; every other part keeps its palette role. */
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  'mobile-robot': ['robot-body'], 'robot-arm': ['arm-base', 'arm-link'], 'machine-tool': ['machine-enclosure', 'machine-door'], 'security-camera': ['camera-body', 'camera-shield'],
  'ev-charger': ['charger-body'], 'solar-array': ['solar-cell'], 'wind-turbine': ['turbine-tower', 'turbine-nacelle', 'turbine-spinner', 'turbine-blade'], 'storage-tank': ['tank-shell'],
  'pump-unit': ['pump-motor', 'pump-motor-fin', 'pump-terminal-box'], 'fence-segment': ['fence-post', 'fence-foot', 'fence-rail'], 'waste-bin': ['bin-body'], 'traffic-cone': ['cone-body'],
};

describe('site, energy and automation objects', () => {
  for (const [asset, variants] of Object.entries(VARIANTS)) for (const variant of variants) it(`${asset}${variant ? ` (${variant})` : ''} is grounded, finite, owns its resources and keeps its pose`, () => {
    const options = variant ? { variant } : {}, first = build(asset, options), second = build(asset, options);
    const bounds = new THREE.Box3().setFromObject(first);
    // The wall camera hangs from its plate; its pivot is the floor point below the wall face.
    if (asset === 'security-camera' && variant === 'wall') expect(bounds.min.y).toBeGreaterThan(2.3); else expect(bounds.min.y, asset).toBeCloseTo(0, 5);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = transforms(first); animateAsset(first, { time: 3, delta: 1 });
    if (asset === 'wind-turbine') expect(transforms(first)).not.toEqual(before); else expect(transforms(first), asset).toEqual(before);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('rejects unknown variants', () => {
    for (const asset of Object.keys(VARIANTS).filter(key => VARIANTS[key][0] !== undefined)) expect(() => build(asset, { variant: 'unknown' }), asset).toThrow(/Unknown/);
  });

  it('applies color to the documented body parts only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'midnight', palette: { structure: '#abcdef', trim: '#abcdef', screen: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('shows state on robot bands, charger strip and the machine stack light; camera has no status LED', () => {
    const robot = build('mobile-robot', { state: 'critical' }, { theme: 'light', palette: { critical: '#fedcba' } });
    expect(meshes(robot).filter(mesh => mesh.name === 'robot-status').every(mesh => hex(mesh) === 'fedcba')).toBe(true); disposeObject(robot);
    const charger = build('ev-charger', { state: 'warning' }, { theme: 'light', palette: { warning: '#fedcba' } });
    expect(hex(charger.getObjectByName('charger-status') as THREE.Mesh)).toBe('fedcba'); disposeObject(charger);
    const camera = build('security-camera', { state: 'inactive' }); expect(camera.getObjectByName('camera-status')).toBeUndefined(); disposeObject(camera);
    for (const [state, lamp] of [[undefined, 'normal'], ['busy', 'normal'], ['warning', 'warning'], ['critical', 'critical'], ['inactive', undefined]] as const) {
      const machine = build('machine-tool', state ? { state } : {});
      const lit = meshes(machine).filter(mesh => mesh.name.startsWith('machine-lamp-') && (mesh.material as THREE.MeshStandardMaterial).emissive.getHex() !== 0).map(mesh => mesh.name);
      expect(lit, String(state)).toEqual(lamp ? [`machine-lamp-${lamp}`] : []); disposeObject(machine);
    }
  });

  it('keeps traffic-cone slots fixed while count changes', () => {
    const definition = assetCountDefinitions['traffic-cone']; if (definition.kind !== 'range') throw new Error('range expected');
    const full = build('traffic-cone', { count: definition.max }), slots = parts(full).map(part => part.position.toArray().join(','));
    expect(new Set(slots).size).toBe(definition.max);
    for (let count = definition.min; count <= definition.max; count++) { const model = build('traffic-cone', { count }); expect(parts(model).map(part => part.position.toArray().join(','))).toEqual(slots.slice(0, count)); disposeObject(model); }
    for (const count of [definition.min - 1, definition.max + 1, 1.5]) expect(() => build('traffic-cone', { count })).toThrow();
    disposeObject(full);
  });

  it('ends the solar racking with the last module and stands every post under a rail', () => {
    const definition = assetCountDefinitions['solar-array']; if (definition.kind !== 'range') throw new Error('range expected');
    const box = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object);
    for (let count = definition.min; count <= definition.max; count++) {
      const model = build('solar-array', { count }); model.updateMatrixWorld(true);
      const named = (name: string) => meshes(model).filter(mesh => mesh.name === name);
      const modules = new THREE.Box3(); named('solar-frame').forEach(frame => modules.union(box(frame)));
      expect(parts(model)).toHaveLength(count);
      // Rails span exactly the modules, the row is centred, and the anchors sit on the row ends.
      for (const rail of named('solar-rail')) { const span = box(rail); expect(span.min.x).toBeCloseTo(modules.min.x, 6); expect(span.max.x).toBeCloseTo(modules.max.x, 6); }
      expect(modules.min.x).toBeCloseTo(-(count * SOLAR_ARRAY.pitch - (SOLAR_ARRAY.pitch - SOLAR_ARRAY.width)) / 2, 6); expect(modules.max.x).toBeCloseTo(-modules.min.x, 6);
      expect(worldAnchor(model, 'start').x).toBeCloseTo(-count * SOLAR_ARRAY.pitch / 2, 6); expect(worldAnchor(model, 'end').x).toBeCloseTo(count * SOLAR_ARRAY.pitch / 2, 6);
      const total = box(model); expect(total.min.x).toBeCloseTo(-total.max.x, 6); expect(total.max.x).toBeCloseTo(modules.max.x, 6);
      // Each post top lies inside a rail: on its centre line in z and between the rail's tilted faces in y.
      const rails = named('solar-rail').map(rail => rail.getWorldPosition(new THREE.Vector3()));
      const posts = named('solar-post'); expect(posts.length).toBe(2 * Math.max(2, Math.ceil(count / 2) + 1));
      for (const post of posts) {
        const top = box(post), centre = top.getCenter(new THREE.Vector3()), rail = rails.find(rail => Math.abs(rail.z - centre.z) < 1e-6);
        expect(rail, `post at z ${centre.z}`).toBeDefined(); expect(top.max.y).toBeCloseTo(rail!.y, 6);
        expect(top.min.x).toBeGreaterThanOrEqual(modules.min.x); expect(top.max.x).toBeLessThanOrEqual(modules.max.x);
      }
      const xs = [...new Set(posts.map(post => post.position.x.toFixed(6)))].map(Number); expect(xs.reduce((sum, x) => sum + x, 0)).toBeCloseTo(0, 6);
      disposeObject(model);
    }
    for (const count of [definition.min - 1, definition.max + 1, 1.5]) expect(() => build('solar-array', { count })).toThrow();
  });

  it('stops the turbine rotor with localMotion and moves only the rotor otherwise', () => {
    const stopped = build('wind-turbine', { localMotion: false }), before = transforms(stopped);
    animateAsset(stopped, { time: 5, delta: 1 }); expect(transforms(stopped)).toEqual(before); disposeObject(stopped);
    const turbine = build('wind-turbine'), rotor = turbine.getObjectByName('turbine-rotor')!, tower = turbine.getObjectByName('turbine-tower')!.position.clone();
    animateAsset(turbine, { time: 2, delta: 1 }); expect(rotor.rotation.z).not.toBe(0); expect(turbine.getObjectByName('turbine-tower')!.position.equals(tower)).toBe(true);
    expect(new THREE.Box3().setFromObject(turbine).max.y).toBeGreaterThan(17); disposeObject(turbine);
  });

  it('exposes anchors that follow the geometry', () => {
    const ready = build('robot-arm'), reach = build('robot-arm', { variant: 'reach' });
    expect(worldAnchor(reach, 'tool').z).toBeGreaterThan(worldAnchor(ready, 'tool').z + .5); expect(worldAnchor(reach, 'tool').y).toBeGreaterThan(.5); [ready, reach].forEach(disposeObject);
    const charger = build('ev-charger'); expect(worldAnchor(charger, 'bay').z).toBeGreaterThan(2.5); expect(worldAnchor(charger, 'plug').y).toBeGreaterThan(.8); disposeObject(charger);
    for (const variant of ['mesh', 'gate']) {
      const fence = build('fence-segment', { variant }); expect(worldAnchor(fence, 'start').x).toBe(-1.5); expect(worldAnchor(fence, 'end').x).toBe(1.5);
      expect(Boolean(fence.getObjectByName('anchor-opening'))).toBe(variant === 'gate'); disposeObject(fence);
    }
    for (const variant of ['vertical', 'horizontal']) { const tank = build('storage-tank', { variant }); expect(worldAnchor(tank, 'inlet').y).toBeGreaterThan(worldAnchor(tank, 'outlet').y); disposeObject(tank); }
    const pump = build('pump-unit'); expect(worldAnchor(pump, 'outlet').y).toBeGreaterThan(worldAnchor(pump, 'inlet').y); expect(worldAnchor(pump, 'inlet').x).toBeGreaterThan(.7); disposeObject(pump);
    const robot = build('mobile-robot'); expect(worldAnchor(robot, 'load').y).toBeCloseTo(.3); expect(worldAnchor(robot, 'front').z).toBeGreaterThan(.43); disposeObject(robot);
  });

  it('declares interaction slots and label surfaces for the charger and machine tool', () => {
    const operate = resolveInteractionSlots({ id: 'cnc', kind: 'asset', asset: 'machine-tool' }, assetInteractionSlots['machine-tool']);
    expect(operate.map(slot => slot.name)).toEqual(['operate']); expect(operate[0].position[2]).toBeGreaterThan(.75);
    const plug = resolveInteractionSlots({ id: 'ev', kind: 'asset', asset: 'ev-charger' }, assetInteractionSlots['ev-charger']);
    expect(plug.map(slot => slot.name)).toEqual(['plug']);
    expect(assetLabelSurfaces['ev-charger'].position[2]).toBeGreaterThan(.131); expect(assetLabelSurfaces['machine-tool'].position[2]).toBeGreaterThan(.862);
  });
});

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveInteractionSlots, type AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { assetCountDefinitions, assetInteractionSlots, assetLabelSurfaces, catalogAssets } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof catalogAssets[string]>[1]) => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const parts = (object: THREE.Object3D) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (child.name.startsWith('count-part-')) list.push(child); }); return list; };
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => { values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()]); if (child instanceof THREE.Mesh) values.push([(child.material as THREE.MeshStandardMaterial).emissiveIntensity, (child.material as THREE.MeshStandardMaterial).opacity]); }); return values; };
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!.getWorldPosition(new THREE.Vector3()); };
const named = (object: THREE.Object3D, name: string) => meshes(object).filter(mesh => mesh.name === name);

const VARIANTS: Readonly<Record<string, readonly (string | undefined)[]>> = {
  'dining-table': ['square', 'round'], 'booth-seating': [undefined], 'bar-counter': [undefined], 'bar-stool': [undefined], 'espresso-machine': [undefined], 'pizza-oven': [undefined],
  'walk-in-cooler': [undefined], 'heated-pass': [undefined], 'pickup-shelf': [undefined], 'host-stand': [undefined], 'menu-board': [undefined], 'dish-machine': [undefined], 'patio-umbrella': ['open', 'closed'], 'serving-plates': ['full', 'empty'],
};
const ANIMATED = new Set(['espresso-machine', 'pizza-oven']);
/** Parts that `color` changes; every other part keeps its palette role or fixed natural material. */
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  'dining-table': ['chair-seat', 'chair-back'], 'booth-seating': ['booth-cushion', 'booth-back'], 'bar-counter': ['bar-front'], 'bar-stool': ['stool-cushion'], 'espresso-machine': ['espresso-body'],
  'pizza-oven': ['oven-dome', 'oven-vault'], 'walk-in-cooler': ['cooler-panel', 'cooler-door'], 'heated-pass': ['pass-lamp-hood'], 'pickup-shelf': ['pickup-upright', 'pickup-lip'], 'host-stand': ['host-body'],
  'menu-board': ['menu-frame', 'menu-chalk-tray'], 'dish-machine': ['dish-rack-frame'], 'patio-umbrella': ['umbrella-canopy'], 'serving-plates': [],
};
const COUNTED = ['dining-table', 'booth-seating', 'heated-pass', 'pickup-shelf'];

describe('restaurant objects', () => {
  for (const [asset, variants] of Object.entries(VARIANTS)) for (const variant of variants) it(`${asset}${variant ? ` (${variant})` : ''} is grounded, finite and owns its resources`, () => {
    const options = variant ? { variant } : {}, first = build(asset, options), second = build(asset, options);
    expect(new THREE.Box3().setFromObject(first).min.y, asset).toBeCloseTo(0, 5);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = transforms(first); animateAsset(first, { time: 1.3, delta: 1 });
    if (ANIMATED.has(asset)) expect(transforms(first), asset).not.toEqual(before); else expect(transforms(first), asset).toEqual(before);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('rejects unknown variants', () => {
    for (const asset of ['dining-table', 'patio-umbrella', 'serving-plates']) expect(() => build(asset, { variant: 'unknown' }), asset).toThrow(/Unknown/);
  });

  it('applies color to the documented parts only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'midnight', palette: { structure: '#abcdef', trim: '#abcdef', screen: '#abcdef', accent: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('fills fixed count slots without moving existing parts or resizing the furniture', () => {
    for (const asset of COUNTED) {
      const definition = assetCountDefinitions[asset]; if (definition.kind !== 'range') throw new Error('range expected');
      const full = build(asset, { count: definition.max }); full.updateMatrixWorld(true);
      const key = (part: THREE.Object3D) => part.getWorldPosition(new THREE.Vector3()).toArray().map(value => value.toFixed(4)).join(',');
      const slots = parts(full).map(key); expect(new Set(slots).size, asset).toBe(definition.max);
      for (let count = definition.min; count <= definition.max; count++) {
        const model = build(asset, { count }); model.updateMatrixWorld(true);
        expect(parts(model).map(key), `${asset} ${count}`).toEqual(slots.slice(0, count)); disposeObject(model);
      }
      for (const count of [definition.min - 1, definition.max + 1, 1.5]) expect(() => build(asset, { count }), asset).toThrow();
      const empty = build(asset, { count: 0 }), a = new THREE.Box3().setFromObject(empty), b = new THREE.Box3().setFromObject(full);
      expect(b.getSize(new THREE.Vector3()).distanceTo(a.getSize(new THREE.Vector3())), asset).toBeLessThan(.15); disposeObject(empty); disposeObject(full);
    }
    // Chairs are capacity, independent of the laid covers.
    const bare = build('dining-table', { count: 0 }); expect(named(bare, 'chair-seat')).toHaveLength(4); expect(named(bare, 'setting-plate')).toHaveLength(0); disposeObject(bare);
  });

  it('serves full plates with food and clears empty plates with leftovers and cutlery', () => {
    const full = build('serving-plates'), empty = build('serving-plates', { variant: 'empty' });
    for (const model of [full, empty]) expect(named(model, 'plates-plate')).toHaveLength(2);
    expect(named(full, 'plates-food')).toHaveLength(2); expect(named(full, 'plates-cutlery')).toHaveLength(0);
    expect(named(empty, 'plates-food')).toHaveLength(0); expect(named(empty, 'plates-cutlery')).toHaveLength(4); expect(named(empty, 'plates-scrap').length).toBeGreaterThan(0);
    // Both plates fit between a server's hands and stay low enough to read as held, not stacked.
    const size = new THREE.Box3().setFromObject(full).getSize(new THREE.Vector3()); expect(size.x).toBeLessThan(.6); expect(size.y).toBeLessThan(.1);
    disposeObject(full); disposeObject(empty);
  });

  it('lights pickup bays only while they hold a bag', () => {
    const shelf = build('pickup-shelf', { count: 4 }), lit = named(shelf, 'pickup-led').filter(mesh => (mesh.material as THREE.MeshStandardMaterial).emissive.getHex() !== 0);
    expect(lit).toHaveLength(4); disposeObject(shelf);
  });

  it('places seat anchors at the seated-worker height, facing the table', () => {
    for (const [asset, variant] of [['dining-table', 'square'], ['dining-table', 'round'], ['booth-seating', undefined]] as const) {
      const model = build(asset, variant ? { variant } : {}); model.updateMatrixWorld(true);
      const slots = assetInteractionSlots[asset]({ id: asset, kind: 'asset', asset, ...(variant ? { variant } : {}) });
      expect(slots, asset).toHaveLength(4);
      for (const slot of slots) {
        const seat = model.getObjectByName(`anchor-${slot.anchor}`)!, facing = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.quaternion);
        expect(seat.position.y).toBeCloseTo(.52); expect(facing.dot(asset === 'booth-seating' ? new THREE.Vector3(0, 0, -Math.sign(seat.position.z)) : seat.position.clone().setY(0).negate().normalize()), `${asset}/${slot.name}`).toBeGreaterThan(.95);
        expect(slot.position[0]).toBeCloseTo(seat.position.x); expect(slot.position[2]).toBeCloseTo(seat.position.z); expect(Math.cos(slot.yaw - seat.rotation.y)).toBeCloseTo(1);
        expect(Math.hypot(slot.approach[0] - slot.position[0], slot.approach[2] - slot.position[2])).toBeGreaterThan(.5);
      }
      const seats = new THREE.Box3(); named(model, asset === 'booth-seating' ? 'booth-cushion' : 'chair-seat').forEach(mesh => seats.expandByObject(mesh));
      expect(seats.max.y).toBeCloseTo(.52, 2); disposeObject(model);
    }
  });

  it('exposes anchors that follow the geometry', () => {
    const bar = build('bar-counter'); expect(worldAnchor(bar, 'top').y).toBeCloseTo(1.11); expect(worldAnchor(bar, 'guest-0').z).toBeGreaterThan(.5); expect(worldAnchor(bar, 'bartender').z).toBeLessThan(-.5); disposeObject(bar);
    const stool = build('bar-stool'), cushion = new THREE.Box3().setFromObject(named(stool, 'stool-cushion')[0]); expect(worldAnchor(stool, 'seat').y).toBeCloseTo(cushion.max.y, 2); disposeObject(stool);
    const pass = build('heated-pass'); expect(worldAnchor(pass, 'cook').z).toBeLessThan(0); expect(worldAnchor(pass, 'server').z).toBeGreaterThan(0); expect(worldAnchor(pass, 'slot-5').x).toBeCloseTo(.75); disposeObject(pass);
    const oven = build('pizza-oven'); expect(worldAnchor(oven, 'mouth').z).toBeGreaterThan(.7); disposeObject(oven);
    const cooler = build('walk-in-cooler'); expect(worldAnchor(cooler, 'door').z).toBeGreaterThan(1); disposeObject(cooler);
  });

  it('omits status parts and controls glow, fire and steam with heatEnabled', () => {
    for (const [asset] of [['espresso-machine', 'espresso-status'], ['pizza-oven', 'oven-status'], ['walk-in-cooler', 'cooler-status'], ['dish-machine', 'dish-status']] as const) {
      const model = build(asset, { state: 'critical' }, { theme: 'light', palette: { critical: '#fedcba' } });
      expect(colored(model, 'fedcba'), asset).toEqual(new Set()); disposeObject(model);
    }
    const cold = build('pizza-oven', { heatEnabled: false }); expect(named(cold, 'oven-fire')).toHaveLength(0); expect(named(cold, 'oven-flame')).toHaveLength(0);
    const before = transforms(cold); animateAsset(cold, { time: 2, delta: 1 }); expect(transforms(cold)).toEqual(before); disposeObject(cold);
    const idle = build('espresso-machine', { heatEnabled: false }); expect(named(idle, 'espresso-steam')).toHaveLength(0); disposeObject(idle);
    const off = build('heated-pass', { heatEnabled: false }); expect(named(off, 'pass-heat-lamp').every(mesh => (mesh.material as THREE.MeshStandardMaterial).emissive.getHex() === 0)).toBe(true); disposeObject(off);
  });

  it('declares interaction slots and label surfaces on the matching faces', () => {
    const names = (asset: string) => resolveInteractionSlots({ id: asset, kind: 'asset', asset }, assetInteractionSlots[asset]).map(slot => slot.name);
    expect(names('heated-pass')).toEqual(['plate', 'pickup']); expect(names('bar-counter')).toEqual(['bartender']); expect(names('pickup-shelf')).toEqual(['collect']);
    for (const asset of ['host-stand', 'pizza-oven', 'walk-in-cooler', 'dish-machine']) expect(names(asset), asset).toHaveLength(1);
    const board = build('menu-board'); board.updateMatrixWorld(true);
    const face = new THREE.Box3(); named(board, 'menu-chalkboard').forEach(mesh => { if (mesh.parent!.name === 'menu-front') face.expandByObject(mesh); });
    const surface = assetLabelSurfaces['menu-board'], center = new THREE.Vector3(...surface.position);
    expect(center.y).toBeGreaterThan(face.min.y); expect(center.y).toBeLessThan(face.max.y); expect(center.z).toBeGreaterThan(face.getCenter(new THREE.Vector3()).z); disposeObject(board);
    expect(assetLabelSurfaces['walk-in-cooler'].replaceParts).toEqual(['cooler-digits']); expect(assetLabelSurfaces['pickup-shelf'].position[2]).toBeGreaterThan(.235);
  });
});

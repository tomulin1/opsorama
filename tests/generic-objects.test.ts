import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TRUCK, assetHandling, basicAssets, checkAssetHandling, disposeObject } from '@opsorama/renderer-three';
import { PALLET } from '../packages/renderer-three/src/parcels';
import type { AssetNode, VisualState } from '@opsorama/core';
import { animateAsset } from '../packages/renderer-three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options });
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const named = (object: THREE.Object3D, name: string) => object.getObjectByName(name) as THREE.Mesh;
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()])); return values; };

/** Shared expectations: ground pivot, finite geometry, independent resources and complete disposal. */
function expectOwnedGroundedModel(asset: string, options: Partial<AssetNode> = {}) {
  const first = build(asset, options), second = build(asset, options);
  const bounds = new THREE.Box3().setFromObject(first);
  expect(bounds.min.y, asset).toBeCloseTo(0, 5);
  expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
  const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material]));
  expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
  const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
  disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  return bounds;
}

describe('status beacon', () => {
  it('is grounded, about two meters tall and releases its resources', () => {
    const bounds = expectOwnedGroundedModel('status-beacon');
    expect(bounds.max.y).toBeGreaterThan(1.9); expect(bounds.max.y).toBeLessThan(2.1);
  });
  it('lights exactly one semantic lamp per state and keeps housing customization separate', () => {
    const expected: Record<VisualState, string | null> = { normal: 'normal', busy: 'normal', warning: 'warning', critical: 'critical', inactive: null };
    for (const [state, lamp] of Object.entries(expected) as [VisualState, string | null][]) {
      const model = build('status-beacon', { state, color: '#123456' });
      const lit = meshes(model).filter(mesh => mesh.name.startsWith('lamp-') && (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity > 0 && !(mesh.material as THREE.MeshStandardMaterial).emissive.equals(new THREE.Color(0)));
      expect(lit.map(mesh => mesh.name), state).toEqual(lamp ? [`lamp-${lamp}`] : []);
      expect(hex(named(model, 'housing-pole'))).toBe('123456');
      expect(hex(named(model, 'lamp-critical'))).not.toBe('123456');
      disposeObject(model);
    }
  });
  it('pulses only the halo of a lit lamp and stays static when inactive', () => {
    const model = build('status-beacon', { state: 'critical' }), lamp = named(model, 'lamp-critical').scale.clone();
    animateAsset(model, { time: .3, delta: .3 });
    expect(named(model, 'lamp-halo').scale.x).toBeGreaterThan(1); expect(named(model, 'lamp-critical').scale).toEqual(lamp);
    disposeObject(model);
    const dark = build('status-beacon', { state: 'inactive' }), before = transforms(dark);
    expect(dark.getObjectByName('lamp-halo')).toBeUndefined();
    animateAsset(dark, { time: 2, delta: 1 }); expect(transforms(dark)).toEqual(before); disposeObject(dark);
  });
});

describe('capacity gauge', () => {
  const lit = (object: THREE.Object3D) => meshes(object).filter(mesh => mesh.name.startsWith('count-part-'));
  it('lights a bounded number of whole segments from the bottom without changing its frame', () => {
    const empty = build('capacity-gauge', { count: 0 }), full = build('capacity-gauge', { count: 10 });
    expect(lit(empty)).toHaveLength(0); expect(lit(full)).toHaveLength(10);
    expect(new THREE.Box3().setFromObject(empty).equals(new THREE.Box3().setFromObject(full))).toBe(true);
    const partial = build('capacity-gauge', { count: 4 }), heights = lit(partial).map(mesh => mesh.position.y);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(Math.max(...heights)).toBeLessThan(Math.min(...meshes(partial).filter(mesh => mesh.name.startsWith('gauge-empty-')).map(mesh => mesh.position.y)));
    [empty, full, partial].forEach(disposeObject);
    for (const count of [-1, 11, 2.5]) expect(() => build('capacity-gauge', { count })).toThrow();
    expect(lit(build('capacity-gauge'))).toHaveLength(6);
  });
  it('preserves fill styling under host status metadata and owns its resources', () => {
    expect(lit(build('capacity-gauge', { color: '#123456' })).every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(lit(build('capacity-gauge', { color: '#123456', state: 'critical' })).every(mesh => hex(mesh) === '123456')).toBe(true);
    const bounds = expectOwnedGroundedModel('capacity-gauge', { count: 10 }); expect(bounds.max.y).toBeCloseTo(2.2, 1);
  });
});

describe('tote', () => {
  const items = (object: THREE.Object3D) => meshes(object).filter(mesh => mesh.name.startsWith('count-part-'));
  it('fills distinct slots inside its walls and validates the bounded range', () => {
    for (const count of [0, 1, 3, 4, 9]) {
      const model = build('tote', { count }), list = items(model), walls = new THREE.Box3();
      meshes(model).filter(mesh => mesh.name === 'tote-wall').forEach(mesh => walls.expandByObject(mesh));
      expect(list).toHaveLength(count);
      expect(new Set(list.map(mesh => `${mesh.position.x},${mesh.position.z}`)).size).toBe(count);
      list.forEach(mesh => { const box = new THREE.Box3().setFromObject(mesh); expect(walls.containsBox(box)).toBe(true); });
      disposeObject(model);
    }
    for (const count of [-1, 10, .5]) expect(() => build('tote', { count })).toThrow();
    expect(items(build('tote'))).toHaveLength(4);
  });
  it('colors the body, keeps item tones, exposes a top anchor and owns resources', () => {
    const model = build('tote', { color: '#123456', count: 3 });
    expect(meshes(model).filter(mesh => mesh.name.startsWith('tote-wall')).every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(items(model).some(mesh => hex(mesh) === '123456')).toBe(false);
    expect(model.getObjectByName('anchor-top')?.position.y).toBeCloseTo(.59); disposeObject(model);
    const bounds = expectOwnedGroundedModel('tote', { count: 9 }); expect(bounds.max.y).toBeLessThan(.7);
  });
});

describe('conveyor', () => {
  const markerPositions = (object: THREE.Object3D) => object.children.filter(child => child.name.startsWith('conveyor-marker-')).map(child => child.position.clone());
  it('declares entry and exit anchors that match the documented footprint', () => {
    const straight = build('conveyor'), curve = build('conveyor', { variant: 'curve' });
    expect(straight.getObjectByName('anchor-entry')?.position.toArray()).toEqual([0, .83, -2]);
    expect(straight.getObjectByName('anchor-exit')?.position.toArray()).toEqual([0, .83, 2]);
    const entry = curve.getObjectByName('anchor-entry')!.position, exit = curve.getObjectByName('anchor-exit')!.position;
    expect([entry.x, entry.z]).toEqual([.25, -.75]); expect(exit.x).toBeCloseTo(-.75); expect(exit.z).toBeCloseTo(.25);
    const bounds = new THREE.Box3().setFromObject(curve);
    expect(bounds.min.x).toBeGreaterThan(-.85); expect(bounds.max.x).toBeLessThan(.85); expect(bounds.max.z).toBeLessThan(.85);
    disposeObject(straight); disposeObject(curve);
    expect(() => build('conveyor', { variant: 'spiral' })).toThrow('Unknown conveyor variant');
  });
  it('moves markers along the flow direction, stays on the belt and stops when inactive', () => {
    for (const variant of ['straight', 'curve']) {
      const model = build('conveyor', { variant }), before = markerPositions(model);
      animateAsset(model, { time: 1, delta: 1 });
      const after = markerPositions(model);
      expect(after.some((point, i) => !point.equals(before[i])), variant).toBe(true);
      const footprint = new THREE.Box3().setFromObject(model.getObjectByName('conveyor-belt')!).expandByScalar(.05);
      after.forEach(point => expect(footprint.containsPoint(point), variant).toBe(true));
      disposeObject(model);
    }
    const straight = build('conveyor'); animateAsset(straight, { time: .5, delta: .5 });
    const [first] = markerPositions(straight); expect(first.z).toBeGreaterThan(-1.7); disposeObject(straight);
    const stopped = build('conveyor', { state: 'inactive' }), before = transforms(stopped);
    animateAsset(stopped, { time: 3, delta: 1 }); expect(transforms(stopped)).toEqual(before); disposeObject(stopped);
  });
  it('colors the frames, owns resources and is grounded in both variants', () => {
    const model = build('conveyor', { color: '#123456' });
    expect(meshes(model).filter(mesh => mesh.name === 'conveyor-frame').every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(hex(named(model, 'conveyor-belt'))).not.toBe('123456'); disposeObject(model);
    for (const variant of ['straight', 'curve']) expect(expectOwnedGroundedModel('conveyor', { variant }).max.y).toBeLessThan(1);
  });
});

describe('gate', () => {
  it('blocks the passage when closed and raises the boom clear of it when open', () => {
    const closed = build('gate'), open = build('gate', { variant: 'open' });
    const arm = (model: THREE.Object3D) => { model.updateMatrixWorld(true); return new THREE.Box3().setFromObject(named(model, 'gate-arm')); };
    expect(arm(closed).min.x).toBeLessThan(-1.4); expect(arm(closed).max.x).toBeGreaterThan(1.6); expect(arm(closed).max.y).toBeLessThan(1);
    expect(arm(open).max.x).toBeLessThan(-.7); expect(arm(open).max.y).toBeGreaterThan(3.5);
    expect(hex(named(closed, 'gate-lamp'))).toBe('e35d5d'); expect(hex(named(open, 'gate-lamp'))).toBe('3fb38c');
    expect(closed.getObjectByName('anchor-entry')?.position.z).toBe(-1); expect(closed.getObjectByName('anchor-exit')?.position.z).toBe(1);
    disposeObject(closed); disposeObject(open);
    expect(() => build('gate', { variant: 'ajar' })).toThrow('Unknown gate variant');
  });
  it('lets states override the lamp, colors the housing, owns resources and has no local animation', () => {
    const model = build('gate', { variant: 'open', state: 'warning', color: '#123456' }), before = transforms(model);
    expect(hex(named(model, 'gate-lamp'))).toBe('e8b553'); expect(hex(named(model, 'gate-housing'))).toBe('123456');
    animateAsset(model, { time: 4, delta: 1 }); expect(transforms(model)).toEqual(before); disposeObject(model);
    for (const variant of ['closed', 'open']) expectOwnedGroundedModel('gate', { variant });
  });
});

describe('wall segment', () => {
  const ray = (model: THREE.Object3D, x: number, y: number) => {
    model.updateMatrixWorld(true);
    return new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1)).intersectObject(model, true).filter(hit => hit.object.name === 'wall-panel').map(hit => hit.object.position.toArray().join(','));
  };
  it('spans a chainable 4 m footprint and leaves documented openings clear', () => {
    for (const variant of ['solid', 'door', 'window']) {
      const model = build('wall-segment', { variant }), bounds = new THREE.Box3().setFromObject(model);
      expect(bounds.min.x).toBeCloseTo(-2.01); expect(bounds.max.x).toBeCloseTo(2.01); expect(bounds.max.y).toBeCloseTo(2.65);
      expect(model.getObjectByName('anchor-start')?.position.x).toBe(-2); expect(model.getObjectByName('anchor-end')?.position.x).toBe(2);
      expect(ray(model, -1.5, 1.5), variant).toHaveLength(1);
      expect(ray(model, .13, 1.47), variant).toHaveLength(variant === 'solid' ? 1 : 0);
      expect(ray(model, .13, .37), variant).toHaveLength(variant === 'door' ? 0 : 1);
      expect(Boolean(model.getObjectByName('anchor-opening')), variant).toBe(variant !== 'solid');
      disposeObject(model);
    }
    expect(() => build('wall-segment', { variant: 'arch' })).toThrow('Unknown wall variant');
  });
  it('colors only wall panels and owns resources', () => {
    const model = build('wall-segment', { variant: 'window', color: '#123456' });
    expect(meshes(model).filter(mesh => mesh.name === 'wall-panel').every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(hex(named(model, 'wall-glass'))).not.toBe('123456'); disposeObject(model);
    for (const variant of ['solid', 'door', 'window']) expectOwnedGroundedModel('wall-segment', { variant });
  });
});

describe('equipment cabinet', () => {
  const units = (object: THREE.Object3D) => object.children.filter(child => child.name.startsWith('count-part-'));
  it('mounts bounded units bottom-up inside the frame without changing its footprint', () => {
    const empty = build('equipment-cabinet', { count: 0 }), full = build('equipment-cabinet', { count: 12 }); full.updateMatrixWorld(true);
    expect(units(empty)).toHaveLength(0); expect(units(full)).toHaveLength(12);
    const heights = units(full).map(unit => unit.position.y); expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new THREE.Box3().setFromObject(empty).equals(new THREE.Box3().setFromObject(full))).toBe(true);
    units(full).forEach(unit => expect(new THREE.Box3().setFromObject(unit).max.y).toBeLessThan(2.1));
    [empty, full].forEach(disposeObject);
    for (const count of [-1, 13, 1.5]) expect(() => build('equipment-cabinet', { count })).toThrow();
    expect(units(build('equipment-cabinet'))).toHaveLength(8);
  });
  it('omits status LEDs, colors the frame and owns resources', () => {
    const model = build('equipment-cabinet', { count: 3, state: 'critical', color: '#123456' });
    expect(meshes(model).filter(mesh => mesh.name === 'cabinet-led').map(hex)).toEqual([]);
    expect(meshes(model).filter(mesh => mesh.name === 'cabinet-side').every(mesh => hex(mesh) === '123456')).toBe(true); disposeObject(model);
    expect(expectOwnedGroundedModel('equipment-cabinet', { count: 12 }).max.y).toBeCloseTo(2.16, 2);
  });
});

describe('map pin', () => {
  it('marks the ground point, colors its body and bobs only upward', () => {
    const model = build('map-pin', { color: '#123456' });
    expect(model.getObjectByName('anchor-point')?.position.toArray()).toEqual([0, 0, 0]);
    expect(meshes(model).filter(mesh => mesh.name === 'pin-body').every(mesh => hex(mesh) === '123456')).toBe(true);
    const head = model.getObjectByName('pin-head')!, heights = [0, .7, 1.4, 2.1].map(time => { animateAsset(model, { time, delta: .7 }); return head.position.y; });
    expect(heights.every(y => y >= 0 && y <= .12)).toBe(true); expect(Math.max(...heights)).toBeGreaterThan(0);
    expect(named(model, 'pin-stem').position.y).toBeCloseTo(.27); disposeObject(model);
    expect(hex(named(build('map-pin', { state: 'critical', color: '#123456' }), 'pin-body'))).toBe('dc6868');
  });
  it('stays still when inactive and owns resources', () => {
    const model = build('map-pin', { state: 'inactive' }), before = transforms(model);
    animateAsset(model, { time: 1, delta: 1 }); expect(transforms(model)).toEqual(before); disposeObject(model);
    const bounds = expectOwnedGroundedModel('map-pin'); expect(bounds.max.y).toBeCloseTo(1.57, 2);
  });
});

describe('shared wheel parts', () => {
  it('take the radius and width each vehicle passes', () => {
    const truck = build('truck'), tire = named(truck, 'wheel-tire'), hub = named(truck, 'wheel-hub');
    // The rounded tread is a lathe profile; its outer envelope is the 0.46 m radius and 0.3 m width of the front tire.
    const size = new THREE.Box3().setFromObject(tire).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(.3); expect(size.y).toBeCloseTo(.92); expect(size.z).toBeCloseTo(.92, 1);
    expect((hub.geometry as THREE.CylinderGeometry).parameters.radiusTop).toBeLessThan(.46); expect((hub.geometry as THREE.CylinderGeometry).parameters.height).toBeLessThan(.3);
    disposeObject(truck);
  });
});

describe('delivery truck', () => {
  it('has real rigid-truck proportions, grounded on its tires', () => {
    const bounds = expectOwnedGroundedModel('truck'), size = bounds.getSize(new THREE.Vector3());
    expect(size.z).toBeCloseTo(TRUCK.length, 1); expect(size.y).toBeCloseTo(TRUCK.height, 2);
    const truck = build('truck'), body = new THREE.Box3().setFromObject(named(truck, 'truck-body'));
    expect(body.max.x - body.min.x).toBeCloseTo(TRUCK.width, 2);
    expect(meshes(truck).filter(mesh => mesh.name === 'wheel-tire')).toHaveLength(6);
    disposeObject(truck);
  });
  it('holds two pallets across and a forklift inside the cargo body, with the floor at dock height', () => {
    const truck = build('truck'), body = new THREE.Box3().setFromObject(named(truck, 'truck-body')), { cargo, floorTop } = TRUCK;
    const forklift = new THREE.Box3().setFromObject(build('forklift')).getSize(new THREE.Vector3());
    expect(cargo.width).toBeGreaterThanOrEqual(PALLET.width * 2); expect(cargo.height).toBeGreaterThan(forklift.y); expect(cargo.width).toBeGreaterThan(forklift.x);
    expect(body.max.x - body.min.x).toBeGreaterThan(cargo.width); expect(body.max.z - body.min.z).toBeGreaterThan(cargo.length); expect(body.max.y).toBeGreaterThanOrEqual(floorTop + cargo.height);
    expect(body.min.y).toBeLessThan(floorTop);
    const load = truck.getObjectByName('anchor-load')!.position, entrance = truck.getObjectByName('anchor-entrance')!.position;
    expect(load.y).toBeCloseTo(floorTop); expect(load.z + cargo.length / 2).toBeLessThan(body.max.z); expect(load.z - cargo.length / 2).toBeGreaterThan(body.min.z);
    expect(entrance.y).toBeCloseTo(floorTop); expect(entrance.z).toBeCloseTo(body.min.z);
    disposeObject(truck);
  });
  it('colors only the cab and bands, is static and declares its cargo floor', () => {
    const truck = build('truck', { color: '#123456' }), before = transforms(truck);
    expect(meshes(truck).filter(mesh => mesh.name === 'truck-cab' || mesh.name === 'truck-band').every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(hex(named(truck, 'truck-body'))).not.toBe('123456');
    animateAsset(truck, { time: 2, delta: 1 }); expect(transforms(truck)).toEqual(before); disposeObject(truck);
    expect(checkAssetHandling('truck', assetHandling.truck, basicAssets.truck).ok).toBe(true);
  });
});

describe('delivery van', () => {
  it('faces +z on four grounded wheels with a rear load anchor', () => {
    const van = build('delivery-van'), bounds = new THREE.Box3().setFromObject(van);
    expect(bounds.max.z).toBeCloseTo(2.68, 1); expect(bounds.min.z).toBeLessThan(-2.6); expect(bounds.max.y).toBeCloseTo(2.45, 2);
    expect(meshes(van).filter(mesh => mesh.name === 'wheel-tire')).toHaveLength(4);
    expect(meshes(van).filter(mesh => mesh.name === 'van-light' && mesh.position.z > 0)).toHaveLength(2);
    expect(van.getObjectByName('anchor-load')?.position.z).toBeLessThan(bounds.min.z + .01); disposeObject(van);
  });
  it('colors only accents, is static and owns resources', () => {
    const van = build('delivery-van', { color: '#123456' }), before = transforms(van);
    expect(meshes(van).filter(mesh => mesh.name === 'van-stripe' || mesh.name === 'van-bumper').every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(hex(named(van, 'van-body'))).not.toBe('123456');
    animateAsset(van, { time: 2, delta: 1 }); expect(transforms(van)).toEqual(before); disposeObject(van);
    expectOwnedGroundedModel('delivery-van');
  });
});

describe('cargo bike', () => {
  it('stands on two wheels facing +z with a cargo anchor above the box', () => {
    const bike = build('cargo-bike'), bounds = new THREE.Box3().setFromObject(bike);
    const tires = meshes(bike).filter(mesh => mesh.name === 'bike-tire').map(mesh => mesh.position.z).sort((a, b) => a - b);
    expect(tires).toEqual([-.75, .95]);
    const cargo = new THREE.Box3().setFromObject(named(bike, 'bike-cargo'));
    expect(cargo.min.z).toBeGreaterThan(tires[0]); expect(cargo.max.z).toBeLessThan(tires[1]);
    expect(bike.getObjectByName('anchor-cargo')!.position.y).toBeGreaterThanOrEqual(cargo.max.y);
    expect(bounds.max.y).toBeLessThan(1.15); expect(bounds.max.x - bounds.min.x).toBeLessThan(.65); disposeObject(bike);
  });
  it('colors only the cargo box and owns resources', () => {
    const bike = build('cargo-bike', { color: '#123456' });
    expect(meshes(bike).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name)).toEqual(['bike-cargo']); disposeObject(bike);
    expectOwnedGroundedModel('cargo-bike');
  });
});

describe('pallet jack', () => {
  it('extends forks toward −z under a load anchor and tilts the handle toward +z', () => {
    const jack = build('pallet-jack'); jack.updateMatrixWorld(true);
    const forks = new THREE.Box3(); meshes(jack).filter(mesh => mesh.name === 'jack-fork').forEach(mesh => forks.expandByObject(mesh));
    expect(forks.min.z).toBeLessThan(-1.1); expect(forks.max.y).toBeLessThan(.13);
    const load = jack.getObjectByName('anchor-load')!.position; expect(forks.containsPoint(load.clone().setY(.1))).toBe(true);
    const grip = new THREE.Box3().setFromObject(named(jack, 'jack-grip'));
    expect(grip.min.z).toBeGreaterThan(.3); expect(grip.max.y).toBeGreaterThan(1.3); disposeObject(jack);
  });
  it('colors the chassis and pump, is static and owns resources', () => {
    const jack = build('pallet-jack', { color: '#123456' }), before = transforms(jack);
    expect(new Set(meshes(jack).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['jack-chassis', 'jack-pump']));
    animateAsset(jack, { time: 1, delta: 1 }); expect(transforms(jack)).toEqual(before); disposeObject(jack);
    expectOwnedGroundedModel('pallet-jack');
  });
});

describe('shopping cart', () => {
  const items = (object: THREE.Object3D) => meshes(object).filter(mesh => mesh.name.startsWith('count-part-'));
  it('places bounded items inside the basket', () => {
    for (const count of [0, 1, 3, 6]) {
      const cart = build('shopping-cart', { count }), basket = new THREE.Box3();
      meshes(cart).filter(mesh => mesh.name === 'cart-mesh' || mesh.name === 'cart-floor').forEach(mesh => basket.expandByObject(mesh));
      expect(items(cart)).toHaveLength(count);
      expect(new Set(items(cart).map(mesh => `${mesh.position.x},${mesh.position.z}`)).size).toBe(count);
      items(cart).forEach(mesh => expect(basket.containsBox(new THREE.Box3().setFromObject(mesh))).toBe(true));
      disposeObject(cart);
    }
    for (const count of [-1, 7, 2.5]) expect(() => build('shopping-cart', { count })).toThrow();
    expect(items(build('shopping-cart'))).toHaveLength(3);
  });
  it('colors the frame, keeps the handle at the back and owns resources', () => {
    const cart = build('shopping-cart', { color: '#123456' });
    expect(meshes(cart).filter(mesh => mesh.name === 'cart-rail' || mesh.name === 'cart-frame').every(mesh => hex(mesh) === '123456')).toBe(true);
    expect(hex(named(cart, 'cart-handle'))).not.toBe('123456'); expect(cart.getObjectByName('anchor-handle')!.position.z).toBeLessThan(-.45); disposeObject(cart);
    expectOwnedGroundedModel('shopping-cart', { count: 6 });
  });
});

describe('parcel locker', () => {
  const occupied = (object: THREE.Object3D) => object.children.filter(child => child.name.startsWith('count-part-'));
  it('marks bounded compartments bottom row first without changing the wall', () => {
    const empty = build('parcel-locker', { count: 0 }), full = build('parcel-locker', { count: 16 }), five = build('parcel-locker', { count: 5 });
    expect(occupied(empty)).toHaveLength(0); expect(occupied(full)).toHaveLength(16);
    expect(occupied(five).map(door => door.position.y)).toEqual([.38, .38, .38, .38, .86]);
    expect(new THREE.Box3().setFromObject(empty).equals(new THREE.Box3().setFromObject(full))).toBe(true);
    expect(meshes(five).filter(mesh => mesh.name === 'locker-occupied')).toHaveLength(5); expect(meshes(five).filter(mesh => mesh.name === 'locker-free')).toHaveLength(11);
    [empty, full, five].forEach(disposeObject);
    for (const count of [-1, 17, .5]) expect(() => build('parcel-locker', { count })).toThrow();
    expect(occupied(build('parcel-locker'))).toHaveLength(10);
  });
  it('colors only the housing and owns resources', () => {
    const locker = build('parcel-locker', { color: '#123456' });
    expect(new Set(meshes(locker).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['locker-housing'])); disposeObject(locker);
    expect(expectOwnedGroundedModel('parcel-locker').max.y).toBeCloseTo(2.38, 2);
  });
});

describe('returns drop box', () => {
  it('has a rounded top, a front slot anchor and a body-colored return arrow', () => {
    const box = build('returns-drop-box', { color: '#123456' }), bounds = new THREE.Box3().setFromObject(box);
    expect(bounds.max.y).toBeCloseTo(1.46, 2); expect(bounds.max.z).toBeLessThan(.4);
    const slot = box.getObjectByName('anchor-slot')!.position; expect(slot.z).toBeGreaterThan(.35); expect(slot.y).toBeGreaterThan(1.01);
    expect(new Set(meshes(box).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['dropbox-body', 'dropbox-arrow']));
    const before = transforms(box); animateAsset(box, { time: 1, delta: 1 }); expect(transforms(box)).toEqual(before); disposeObject(box);
    expectOwnedGroundedModel('returns-drop-box');
  });
});

describe('storefront', () => {
  it('faces +z with an awning over the entrance anchor', () => {
    const shop = build('storefront', { color: '#123456' }); shop.updateMatrixWorld(true);
    const awning = new THREE.Box3(); meshes(shop).filter(mesh => mesh.name.startsWith('shop-awning')).forEach(mesh => awning.expandByObject(mesh));
    const entrance = shop.getObjectByName('anchor-entrance')!.position, door = new THREE.Box3().setFromObject(named(shop, 'shop-door'));
    expect(awning.min.z).toBeGreaterThan(1.4); expect(awning.min.y).toBeGreaterThan(door.max.y);
    expect(entrance.x).toBeCloseTo((door.min.x + door.max.x) / 2); expect(entrance.z).toBeGreaterThan(door.max.z);
    expect(new Set(meshes(shop).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['shop-awning', 'shop-sign']));
    const bounds = new THREE.Box3().setFromObject(shop); expect(bounds.max.y).toBeCloseTo(3.15, 2); expect(bounds.max.z).toBeLessThan(2.4); disposeObject(shop);
    expectOwnedGroundedModel('storefront');
  });
});

describe('seated worker', () => {
  it('keeps shoes on the floor, hips at seat height and a typing motion', () => {
    const person = build('worker', { variant: 'seated' }); person.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(person); expect(bounds.min.y).toBeCloseTo(0, 5); expect(bounds.max.y).toBeLessThan(1.6);
    const torso = new THREE.Box3().setFromObject(meshes(person).find(mesh => mesh.position.y === 1.01)!);
    expect(torso.min.y).toBeCloseTo(.5, 2);
    const arm = person.getObjectByName('worker-left-arm')!, before = arm.rotation.x;
    animateAsset(person, { time: .3, delta: .3 }); expect(arm.rotation.x).not.toBe(before);
    disposeObject(person); expect(() => build('worker', { variant: 'lying' })).toThrow('Unknown worker variant');
  });
});

describe('desk pod', () => {
  const stations = (object: THREE.Object3D) => object.children.filter(child => child.name.startsWith('count-part-'));
  it('arranges exact workstation variants with seat anchors facing their desks', () => {
    for (const count of [1, 2, 4, 6, 8]) {
      const pod = build('desk-pod', { count }); pod.updateMatrixWorld(true);
      expect(stations(pod)).toHaveLength(count);
      expect(meshes(pod).filter(mesh => mesh.name === 'chair-seat')).toHaveLength(count);
      expect(Boolean(pod.getObjectByName('pod-screen'))).toBe(count > 1);
      for (let i = 0; i < count; i++) {
        const seat = pod.getObjectByName(`anchor-seat-${i}`)!, monitor = new THREE.Box3();
        stations(pod)[i].traverse(child => { if (child.name === 'desk-screen') monitor.expandByObject(child); });
        const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.quaternion), toDesk = monitor.getCenter(new THREE.Vector3()).sub(seat.position).setY(0).normalize();
        expect(facing.dot(toDesk), `${count}/${i}`).toBeGreaterThan(.95); expect(seat.position.y).toBeCloseTo(.52);
      }
      disposeObject(pod);
    }
    for (const count of [0, 3, 10]) expect(() => build('desk-pod', { count })).toThrow();
  });
  it('seats a seated worker on the chair and owns resources', () => {
    const pod = build('desk-pod', { count: 2 }), seat = pod.getObjectByName('anchor-seat-0')!.position, chairSeat = new THREE.Box3();
    pod.updateMatrixWorld(true); chairSeat.setFromObject(meshes(pod).filter(mesh => mesh.name === 'chair-seat')[0]);
    expect(chairSeat.max.y).toBeCloseTo(seat.y, 2); expect(chairSeat.containsPoint(seat.clone().setY(chairSeat.max.y - .01))).toBe(true);
    disposeObject(pod);
    expect(expectOwnedGroundedModel('desk-pod', { count: 8 }).max.x).toBeLessThan(3);
  });
});

describe('meeting table', () => {
  it('centers facing chair pairs along the table in steps of two', () => {
    for (const count of [2, 4, 6, 12]) {
      const table = build('meeting-table', { count }), chairs = table.children.filter(child => child.name.startsWith('count-part-'));
      expect(chairs).toHaveLength(count);
      expect(new Set(chairs.map(chair => `${chair.position.x},${chair.position.z}`)).size).toBe(count);
      expect(Math.max(...chairs.map(chair => Math.abs(chair.position.x)))).toBeCloseTo((count / 2 - 1) * .3);
      for (let i = 0; i < count; i++) {
        const seat = table.getObjectByName(`anchor-seat-${i}`)!, facing = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.quaternion);
        expect(facing.z * seat.position.z, `${count}/${i}`).toBeLessThan(0); expect(seat.position.y).toBeCloseTo(.52);
      }
      disposeObject(table);
    }
    for (const count of [0, 3, 14]) expect(() => build('meeting-table', { count })).toThrow();
    expect(build('meeting-table').children.filter(child => child.name.startsWith('count-part-'))).toHaveLength(6);
  });
  it('colors chairs only and owns resources', () => {
    const table = build('meeting-table', { color: '#123456' });
    expect(new Set(meshes(table).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['chair-seat', 'chair-back'])); disposeObject(table);
    expectOwnedGroundedModel('meeting-table', { count: 12 });
  });
});

describe('whiteboard', () => {
  const notes = (object: THREE.Object3D) => meshes(object).filter(mesh => mesh.name.startsWith('count-part-'));
  it('fills bounded notes column by column on the board surface, below the label header', () => {
    for (const count of [0, 1, 4, 5, 12]) {
      const board = build('whiteboard', { count }), surface = new THREE.Box3().setFromObject(named(board, 'board-surface'));
      expect(notes(board)).toHaveLength(count);
      notes(board).forEach(note => { const box = new THREE.Box3().setFromObject(note); expect(box.min.x).toBeGreaterThan(surface.min.x); expect(box.max.x).toBeLessThan(surface.max.x); expect(box.min.y).toBeGreaterThan(surface.min.y); expect(box.max.y).toBeLessThan(1.73); });
      if (count >= 5) expect(notes(board)[4].position.x).toBeGreaterThan(notes(board)[3].position.x + .4);
      disposeObject(board);
    }
    for (const count of [-1, 13, .5]) expect(() => build('whiteboard', { count })).toThrow();
  });
  it('colors the frame and stand, is static and owns resources', () => {
    const board = build('whiteboard', { color: '#123456' }), before = transforms(board);
    expect(new Set(meshes(board).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['board-stand', 'board-frame', 'board-tray']));
    animateAsset(board, { time: 1, delta: 1 }); expect(transforms(board)).toEqual(before); disposeObject(board);
    expectOwnedGroundedModel('whiteboard', { count: 12 });
  });
});

describe('focus pod', () => {
  it('encloses a stool seat facing the shelf behind a front glass door', () => {
    const booth = build('focus-pod', { color: '#123456' }); booth.updateMatrixWorld(true);
    const seat = booth.getObjectByName('anchor-seat-0')!, stool = new THREE.Box3().setFromObject(named(booth, 'pod-stool'));
    expect(stool.max.y).toBeCloseTo(seat.position.y, 2); expect(new THREE.Vector3(0, 0, 1).applyQuaternion(seat.quaternion).z).toBeCloseTo(-1);
    expect(named(booth, 'pod-shelf').position.z).toBeLessThan(seat.position.z);
    const glass = new THREE.Box3().setFromObject(named(booth, 'pod-glass')); expect(glass.min.z).toBeGreaterThan(.5);
    expect(booth.getObjectByName('anchor-door')!.position.z).toBeGreaterThan(glass.max.z);
    expect(new Set(meshes(booth).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['pod-panel']));
    const before = transforms(booth); animateAsset(booth, { time: 1, delta: 1 }); expect(transforms(booth)).toEqual(before); disposeObject(booth);
    expect(expectOwnedGroundedModel('focus-pod').max.y).toBeCloseTo(2.26, 2);
  });
});

describe('decoration', () => {
  it('potted plant colors its leaves and stays a compact static model', () => {
    const plant = build('potted-plant', { color: '#123456' }), before = transforms(plant);
    const leaves = meshes(plant).filter(mesh => mesh.name === 'plant-leaf'); expect(leaves).toHaveLength(9);
    expect(leaves.every(leaf => hex(leaf) === '123456')).toBe(true); expect(hex(named(plant, 'plant-pot'))).not.toBe('123456');
    animateAsset(plant, { time: 1, delta: 1 }); expect(transforms(plant)).toEqual(before); disposeObject(plant);
    const bounds = expectOwnedGroundedModel('potted-plant'); expect(bounds.max.y).toBeGreaterThan(1.1); expect(bounds.max.y).toBeLessThan(1.45);
  });
  it('bench seat anchors match the seated worker height', () => {
    const bench = build('bench', { color: '#123456' }); bench.updateMatrixWorld(true);
    const slats = new THREE.Box3(); meshes(bench).filter(mesh => mesh.name === 'bench-slat' && mesh.position.y < .55).forEach(mesh => slats.expandByObject(mesh));
    for (const index of [0, 1]) { const seat = bench.getObjectByName(`anchor-seat-${index}`)!.position; expect(seat.y).toBeCloseTo(slats.max.y, 2); expect(seat.y).toBeCloseTo(.52); }
    expect(new Set(meshes(bench).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['bench-slat'])); disposeObject(bench);
    expectOwnedGroundedModel('bench');
  });
  it('lamp post has an emissive diffuser under its light anchor and no scene light', () => {
    const lamp = build('lamp-post', { color: '#123456' }), diffuser = named(lamp, 'lamp-diffuser');
    expect((diffuser.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
    expect(lamp.getObjectByName('anchor-light')!.position.z).toBeCloseTo(diffuser.position.z);
    let lights = 0; lamp.traverse(child => { if (child instanceof THREE.Light) lights++; }); expect(lights).toBe(0);
    expect(hex(named(lamp, 'lamp-head'))).toBe('123456'); disposeObject(lamp);
    expect(expectOwnedGroundedModel('lamp-post').max.y).toBeCloseTo(3.56, 1);
  });
});

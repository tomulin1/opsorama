import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveInteractionSlots, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions, assetInteractionSlots, basicAssets, disposeObject } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options });
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const parts = (object: THREE.Object3D) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (child.name.startsWith('count-part-')) list.push(child); }); return list; };
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()])); return values; };
const range = (asset: string) => { const definition = assetCountDefinitions[asset]; return definition.kind === 'range' ? definition : undefined; };

function expectOwnedGroundedStaticModel(asset: string, options: Partial<AssetNode> = {}) {
  const first = build(asset, options), second = build(asset, options), before = transforms(first);
  const bounds = new THREE.Box3().setFromObject(first);
  expect(bounds.min.y, asset).toBeCloseTo(0, 5);
  expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
  animateAsset(first, { time: 2, delta: 1 }); expect(transforms(first)).toEqual(before);
  const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material]));
  expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
  const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
  disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  return bounds;
}

describe('counted fulfillment objects', () => {
  for (const [asset, container] of [['picking-cart', 'cart-deck'], ['put-wall', 'putwall-shelf'], ['roll-cage', 'cage-base']] as const) {
    it(`${asset} keeps fixed slots, a stable footprint and contents inside the frame`, () => {
      const { min, max, default: initial } = range(asset)!;
      const full = build(asset, { count: max }); full.updateMatrixWorld(true);
      const slots = parts(full).map(part => part.position.toArray()), frame = new THREE.Box3().setFromObject(full);
      expect(slots).toHaveLength(max); expect(new Set(slots.map(slot => slot.join(','))).size).toBe(max);
      const boxes = parts(full).map(part => new THREE.Box3().setFromObject(part));
      for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].intersectsBox(boxes[b]), `${asset} ${a}/${b}`).toBe(false);
      for (let count = min; count <= max; count++) {
        const model = build(asset, { count });
        expect(parts(model).map(part => part.position.toArray())).toEqual(slots.slice(0, count));
        expect(new THREE.Box3().setFromObject(model).equals(frame), `${asset} ${count}`).toBe(true);
        expect(meshes(model).some(mesh => mesh.name === container)).toBe(true);
        disposeObject(model);
      }
      for (const count of [min - 1, max + 1, 1.5]) expect(() => build(asset, { count })).toThrow();
      expect(parts(build(asset))).toHaveLength(initial);
      boxes.forEach(box => expect(frame.containsBox(box)).toBe(true));
      disposeObject(full);
      expectOwnedGroundedStaticModel(asset, { count: max });
    });
  }

  it('picking cart fills the bottom level first and colors only its totes', () => {
    const cart = build('picking-cart', { count: 4, color: '#123456' }), heights = parts(cart).map(part => part.position.y);
    expect(heights).toEqual([.215, .215, .215, .765]);
    expect(new Set(meshes(cart).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['cart-tote']));
    expect(cart.getObjectByName('anchor-handle')!.position.z).toBeLessThan(-.5); disposeObject(cart);
  });

  it('put wall fills bottom-left first and colors its frame', () => {
    const wall = build('put-wall', { count: 5, color: '#123456' }), positions = parts(wall).map(part => part.position);
    expect(positions.slice(0, 4).every(position => position.y === positions[0].y)).toBe(true);
    expect(positions[4].y).toBeGreaterThan(positions[0].y); expect(positions[0].x).toBeLessThan(positions[1].x);
    expect(new Set(meshes(wall).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['putwall-divider', 'putwall-header']));
    disposeObject(wall);
  });

  it('roll cage stays open at the front and colors only its wire frame', () => {
    const cage = build('roll-cage', { color: '#123456' });
    expect(meshes(cage).filter(mesh => mesh.name === 'cage-mesh').every(mesh => mesh.position.z <= 0 || Math.abs(mesh.position.x) > .3)).toBe(true);
    expect(new Set(meshes(cage).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['cage-frame']));
    disposeObject(cage);
  });
});

describe('order ticket', () => {
  it('is a small grounded token with a colored header and a top anchor', () => {
    const ticket = build('order-ticket', { color: '#123456' });
    expect(new Set(meshes(ticket).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['ticket-header']));
    expect(ticket.getObjectByName('anchor-top')!.position.y).toBeCloseTo(.56); disposeObject(ticket);
    const bounds = expectOwnedGroundedStaticModel('order-ticket'); expect(bounds.max.y).toBeCloseTo(.56, 2); expect(bounds.max.x - bounds.min.x).toBeLessThan(.4);
  });
});

describe('packing station variant', () => {
  it('keeps the standard station unchanged and adds a packing kit with input and output anchors', () => {
    const implicit = build('station'), standard = build('station', { variant: 'standard' }), packing = build('station', { variant: 'packing' });
    expect(transforms(standard)).toEqual(transforms(implicit));
    expect(meshes(standard).some(mesh => mesh.name.startsWith('packing-'))).toBe(false);
    for (const name of ['packing-paper-roll', 'packing-carton', 'packing-tape', 'packing-scale', 'packing-flat-carton']) expect(packing.getObjectByName(name), name).toBeDefined();
    for (const model of [standard, packing]) {
      expect(model.getObjectByName('anchor-input')!.position.x).toBeLessThan(-1.6); expect(model.getObjectByName('anchor-output')!.position.x).toBeGreaterThan(1.6);
    }
    [implicit, standard, packing].forEach(disposeObject);
    expect(() => build('station', { variant: 'assembly' })).toThrow('Unknown station variant');
    expectOwnedGroundedStaticModel('station', { variant: 'packing' });
  });
});

describe('fulfillment interaction slots', () => {
  it('place people behind the cart, on both sides of the put wall and in front of the cage', () => {
    const slot = (asset: string, name: string) => resolveInteractionSlots({ id: asset, kind: 'asset', asset }, assetInteractionSlots[asset]).find(item => item.name === name)!;
    const push = slot('picking-cart', 'push'), put = slot('put-wall', 'put'), pick = slot('put-wall', 'pick'), load = slot('roll-cage', 'load');
    expect(push.position[2]).toBeLessThan(-.6); expect(push.yaw).toBeCloseTo(0);
    expect(put.position[2]).toBeLessThan(0); expect(pick.position[2]).toBeGreaterThan(0); expect(Math.abs(pick.yaw)).toBeCloseTo(Math.PI);
    expect(load.position[2]).toBeGreaterThan(.35); expect(load.approach[2]).toBeGreaterThan(load.position[2]);
  });
});

describe('packing supplies and devices', () => {
  const slotsAcrossCounts = (asset: string) => {
    const { min, max } = range(asset)!, full = build(asset, { count: max }), slots = parts(full).map(part => [part.position.toArray(), part.rotation.toArray()]);
    for (let count = min; count <= max; count++) { const model = build(asset, { count }); expect(parts(model).map(part => [part.position.toArray(), part.rotation.toArray()])).toEqual(slots.slice(0, count)); disposeObject(model); }
    for (const count of [min - 1, max + 1, 1.5]) expect(() => build(asset, { count })).toThrow();
    full.updateMatrixWorld(true); const boxes = parts(full).map(part => new THREE.Box3().setFromObject(part));
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].intersectsBox(boxes[b]), `${asset} ${a}/${b}`).toBe(false);
    disposeObject(full);
  };
  it('packaging supply stacks bundles bottom-up in fixed slots and colors only the straps', () => {
    slotsAcrossCounts('packaging-supply');
    const empty = build('packaging-supply', { count: 0 }); expect(parts(empty)).toHaveLength(0); expect(new THREE.Box3().setFromObject(empty).max.y).toBeCloseTo(.1); disposeObject(empty);
    const full = build('packaging-supply', { count: 10, color: '#123456' });
    expect(new THREE.Box3().setFromObject(full).max.y).toBeCloseTo(full.getObjectByName('anchor-top')!.position.y, 2);
    expect(new Set(meshes(full).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['supply-strap'])); disposeObject(full);
    expectOwnedGroundedStaticModel('packaging-supply', { count: 10 });
  });
  it('poly mailer piles 1–6 mailers in fixed slots and colors the mailer body', () => {
    slotsAcrossCounts('poly-mailer');
    const pile = build('poly-mailer', { count: 2, color: '#123456' });
    expect(new Set(meshes(pile).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['mailer-body']));
    expect(meshes(pile).filter(mesh => mesh.name === 'mailer-sticker')).toHaveLength(2); disposeObject(pile);
    expect(parts(build('poly-mailer'))).toHaveLength(3);
    expectOwnedGroundedStaticModel('poly-mailer', { count: 6 });
  });
  it('label printer feeds a label toward +z and stays a small desktop device', () => {
    const printer = build('label-printer', { color: '#123456' }), label = printer.getObjectByName('printer-label')!;
    expect(label.position.z).toBeGreaterThan(.15); expect(printer.getObjectByName('anchor-label')!.position.z).toBeCloseTo(label.position.z);
    expect(new Set(meshes(printer).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['printer-lid'])); disposeObject(printer);
    const bounds = expectOwnedGroundedStaticModel('label-printer'); expect(bounds.max.y).toBeLessThan(.25);
  });
  it('parcel scale shows its display toward +z above a load anchor and a weigh slot', () => {
    const scale = build('parcel-scale', { color: '#123456' }), screen = scale.getObjectByName('scale-screen')!, head = scale.getObjectByName('scale-head')!;
    expect(screen.position.z).toBeGreaterThan(head.position.z); expect(scale.getObjectByName('anchor-load')!.position.y).toBeCloseTo(.07);
    expect(new Set(meshes(scale).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['scale-head'])); disposeObject(scale);
    const [weigh] = resolveInteractionSlots({ id: 'scale', kind: 'asset', asset: 'parcel-scale' }, assetInteractionSlots['parcel-scale']);
    expect(weigh.position[2]).toBeGreaterThan(.3); expect(Math.abs(weigh.yaw)).toBeCloseTo(Math.PI);
    expect(expectOwnedGroundedStaticModel('parcel-scale').max.y).toBeCloseTo(1.03, 2);
  });
});

describe('handover and exception objects', () => {
  const fixedSlots = (asset: string) => {
    const { min, max } = range(asset)!, full = build(asset, { count: max }), slots = parts(full).map(part => part.position.toArray());
    expect(new Set(slots.map(slot => slot.join(','))).size).toBe(max);
    for (let count = min; count <= max; count++) { const model = build(asset, { count }); expect(parts(model).map(part => part.position.toArray())).toEqual(slots.slice(0, count)); disposeObject(model); }
    for (const count of [min - 1, max + 1, 1.5]) expect(() => build(asset, { count })).toThrow();
    full.updateMatrixWorld(true); const boxes = parts(full).map(part => new THREE.Box3().setFromObject(part));
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].intersectsBox(boxes[b]), `${asset} ${a}/${b}`).toBe(false);
    disposeObject(full); return boxes;
  };
  it('mail sacks fill a fixed grid and color only the sack bodies', () => {
    fixedSlots('mail-sack');
    const sacks = build('mail-sack', { color: '#123456' });
    expect(new Set(meshes(sacks).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['sack-body'])); disposeObject(sacks);
    expectOwnedGroundedStaticModel('mail-sack', { count: 6 });
  });
  it('carrier pickup point centers its handover anchor on the pad with a sign at the back', () => {
    const point = build('carrier-pickup-point', { color: '#123456' }), pad = new THREE.Box3().setFromObject(point.getObjectByName('pickup-pad')!);
    expect(pad.containsPoint(point.getObjectByName('anchor-handover')!.position.clone().setY(.01))).toBe(true);
    expect(point.getObjectByName('pickup-sign')!.position.z).toBeLessThan(0);
    expect(new Set(meshes(point).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['pickup-border', 'pickup-hatch', 'pickup-sign'])); disposeObject(point);
    expect(expectOwnedGroundedStaticModel('carrier-pickup-point').max.y).toBeCloseTo(2.125, 2);
  });
  it('hold cage keeps held items inside its walls behind a front door', () => {
    const boxes = fixedSlots('hold-cage'), cage = build('hold-cage', { color: '#123456' }), inside = new THREE.Box3(new THREE.Vector3(-.98, 0, -.78), new THREE.Vector3(.98, 1.98, .78));
    boxes.forEach(box => expect(inside.containsBox(box)).toBe(true));
    expect(cage.getObjectByName('hold-door')!.position.z).toBeGreaterThan(.8); expect(cage.getObjectByName('anchor-door')!.position.z).toBeGreaterThan(.8);
    expect(new Set(meshes(cage).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name))).toEqual(new Set(['hold-frame', 'hold-sign'])); disposeObject(cage);
    const [access] = resolveInteractionSlots({ id: 'cage', kind: 'asset', asset: 'hold-cage' }, assetInteractionSlots['hold-cage']);
    expect(access.position[2]).toBeGreaterThan(.85);
    expectOwnedGroundedStaticModel('hold-cage', { count: 8 });
  });
  it('station inspection variant adds a returns kit without the default parcel', () => {
    const standard = build('station'), inspection = build('station', { variant: 'inspection' });
    for (const name of ['inspection-lamp', 'inspection-light', 'inspection-carton', 'inspection-tray', 'inspection-clipboard']) expect(inspection.getObjectByName(name), name).toBeDefined();
    expect(meshes(inspection).some(mesh => mesh.name.startsWith('packing-'))).toBe(false);
    expect(meshes(inspection).length).toBeGreaterThan(meshes(standard).length - 2);
    expect(inspection.getObjectByName('anchor-input')).toBeDefined(); [standard, inspection].forEach(disposeObject);
    expectOwnedGroundedStaticModel('station', { variant: 'inspection' });
  });
});

describe('retail and last-mile objects', () => {
  const fixedSlotsInside = (asset: string, inside?: THREE.Box3) => {
    const { min, max } = range(asset)!, full = build(asset, { count: max }), slots = parts(full).map(part => part.position.toArray());
    expect(new Set(slots.map(slot => slot.join(','))).size).toBe(max);
    const footprint = new THREE.Box3().setFromObject(full);
    for (let count = min; count <= max; count++) {
      const model = build(asset, { count }); expect(parts(model).map(part => part.position.toArray())).toEqual(slots.slice(0, count));
      expect(new THREE.Box3().setFromObject(model).equals(footprint), `${asset} ${count}`).toBe(true); disposeObject(model);
    }
    for (const count of [min - 1, max + 1, 1.5]) expect(() => build(asset, { count })).toThrow();
    full.updateMatrixWorld(true); const boxes = parts(full).map(part => new THREE.Box3().setFromObject(part));
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].intersectsBox(boxes[b]), `${asset} ${a}/${b}`).toBe(false);
    if (inside) boxes.forEach(box => expect(inside.containsBox(box), asset).toBe(true));
    disposeObject(full);
  };
  const colored = (asset: string, options: Partial<AssetNode> = {}) => { const model = build(asset, { ...options, color: '#123456' }), names = new Set(meshes(model).filter(mesh => hex(mesh) === '123456').map(mesh => mesh.name)); disposeObject(model); return names; };
  const slot = (asset: string, name: string) => resolveInteractionSlots({ id: asset, kind: 'asset', asset }, assetInteractionSlots[asset]).find(item => item.name === name)!;

  it('hand basket keeps items inside its walls', () => {
    fixedSlotsInside('hand-basket', new THREE.Box3(new THREE.Vector3(-.22, 0, -.145), new THREE.Vector3(.22, .22, .145)));
    expect(colored('hand-basket')).toEqual(new Set(['basket-body']));
    expectOwnedGroundedStaticModel('hand-basket', { count: 4 });
  });
  it('click & collect counter shelves waiting parcels behind staff who are reached from the side', () => {
    fixedSlotsInside('click-collect-counter', new THREE.Box3(new THREE.Vector3(-1, .4, -1.28), new THREE.Vector3(1, 1.5, -.82)));
    expect(colored('click-collect-counter')).toEqual(new Set(['counter-panel']));
    const staff = slot('click-collect-counter', 'staff'), customer = slot('click-collect-counter', 'customer');
    expect(staff.position[2]).toBeLessThan(-.3); expect(staff.position[2]).toBeGreaterThan(-.82); expect(staff.approach[2]).toBe(staff.position[2]);
    expect(customer.position[2]).toBeGreaterThan(.35);
    expectOwnedGroundedStaticModel('click-collect-counter', { count: 8 });
  });
  it('checkout counter separates customer and cashier sides and colors its panel and sign', () => {
    expect(colored('checkout-counter')).toEqual(new Set(['checkout-panel', 'checkout-sign']));
    expect(slot('checkout-counter', 'cashier').position[2]).toBeLessThan(-.35); expect(slot('checkout-counter', 'customer').position[2]).toBeGreaterThan(.35);
    expect(expectOwnedGroundedStaticModel('checkout-counter').max.y).toBeCloseTo(2.13, 2);
  });
  it('store shelving fills facings shelf by shelf inside its frame', () => {
    fixedSlotsInside('store-shelving', new THREE.Box3(new THREE.Vector3(-.985, .1, -.195), new THREE.Vector3(.985, 1.8, .21)));
    const shelf = build('store-shelving', { count: 7 }), positions = parts(shelf).map(part => part.position);
    expect(positions.slice(0, 6).every(position => position.y === positions[0].y)).toBe(true); expect(positions[6].y).toBeGreaterThan(positions[0].y); disposeObject(shelf);
    expect(colored('store-shelving')).toEqual(new Set(['shelving-back', 'shelving-header']));
    expectOwnedGroundedStaticModel('store-shelving', { count: 24 });
  });
  it('customer house puts its delivery anchor on the doorstep and colors the roof', () => {
    const house = build('customer-house'), door = new THREE.Box3().setFromObject(house.getObjectByName('house-door')!), delivery = house.getObjectByName('anchor-delivery')!.position;
    expect(delivery.x).toBeCloseTo((door.min.x + door.max.x) / 2); expect(delivery.z).toBeGreaterThan(door.max.z); disposeObject(house);
    expect(colored('customer-house')).toEqual(new Set(['house-roof']));
    expect(expectOwnedGroundedStaticModel('customer-house').max.y).toBeCloseTo(3.5, 2);
  });
});

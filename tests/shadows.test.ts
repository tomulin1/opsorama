import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, interiorAreas, isInsideBuilding, isWithinInteriorArea, type AssetNode, type SceneNode } from '@opsorama/core';
import { applyShadowPolicy, basicAssets, SHADOW_CONTAINMENT_TOLERANCE, SHADOW_MIN_WIDTH } from '@opsorama/renderer-three';
import { AREAS } from '../apps/site/src/features/ecommerce/model';
import { createEcommerceSimulation } from '../apps/site/src/features/ecommerce/simulation';
import { createRestaurantStore } from '../apps/site/src/features/restaurant/model';
import { Asset, Ground, Zone } from '@opsorama/vue';
import { createAquaticsStore } from '../apps/site/src/features/aquatics/model';

const box = (group: THREE.Object3D, size: [number, number, number], position: [number, number, number] = [0, 0, 0], name = '') => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial()); mesh.name = name;
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
};
const meshes = (object: THREE.Object3D) => { const result: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) result.push(child); }); return result; };
const byName = (object: THREE.Object3D, name: string) => meshes(object).filter(mesh => mesh.name === name);
const outdoor = { interior: false }, indoor = { interior: true };

describe('shadow casting policy', () => {
  it('keeps large parts casting and stops narrow parts', () => {
    const group = new THREE.Group(), body = box(group, [1, 1, 1], [0, .5, 0]), pole = box(group, [.08, 3, .08], [2, 1.5, 0]);
    const bar = box(group, [.013, .09, .015], [3, .5, 0]), wire = box(group, [2, SHADOW_MIN_WIDTH * .9, .01], [0, 2, 3]);
    applyShadowPolicy(group, outdoor);
    expect(body.castShadow).toBe(true); expect(pole.castShadow).toBe(true);
    expect(bar.castShadow).toBe(false); expect(wire.castShadow).toBe(false);
    // Narrowed parts still receive shadows from their surroundings.
    expect([body, pole, bar, wire].every(mesh => mesh.receiveShadow)).toBe(true);
  });

  it('stops parts inside a larger caster, within the documented tolerance, and keeps free-standing panels', () => {
    const group = new THREE.Group(), body = box(group, [1, 1, 1], [0, .5, 0]);
    const tape = box(group, [.11, 1 + SHADOW_CONTAINMENT_TOLERANCE, 1.02], [0, .5, 0]), sticker = box(group, [.3, .2, .01], [.2, .5, .505]);
    const sign = box(group, [1, .8, .02], [0, 2.5, 0]), protruding = box(group, [.2, .2, .2], [0, 1.1, 0]);
    applyShadowPolicy(group, outdoor);
    expect(body.castShadow).toBe(true); expect(sign.castShadow).toBe(true);
    expect(tape.castShadow).toBe(false); expect(sticker.castShadow).toBe(false);
    // Protrudes 10 cm above the body, beyond the 3 cm tolerance.
    expect(protruding.castShadow).toBe(true);
  });

  it('measures nested and scaled parts in the object local metres', () => {
    const group = new THREE.Group(), child = new THREE.Group(); child.scale.setScalar(.04); child.position.set(5, 0, 0); group.add(child);
    const scaledDown = box(child, [1, 1, 1]);
    applyShadowPolicy(group, outdoor);
    expect(scaledDown.castShadow).toBe(false);
  });

  it('never re-enables explicit opt-outs and never adds receiving', () => {
    const group = new THREE.Group(), optedOut = box(group, [2, 2, 2]), dark = box(group, [1, 1, 1], [4, 0, 0]);
    optedOut.castShadow = false; dark.receiveShadow = false;
    const inner = box(group, [.5, .5, .5]);
    applyShadowPolicy(group, outdoor); applyShadowPolicy(group, indoor); applyShadowPolicy(group, outdoor);
    expect(optedOut.castShadow).toBe(false); expect(dark.receiveShadow).toBe(false);
    // An opted-out mesh is not a container, so a part inside it keeps casting.
    expect(inner.castShadow).toBe(true);
  });

  it('switches between indoor and outdoor and restores the narrowed outdoor flags', () => {
    const group = new THREE.Group(), body = box(group, [1, 1, 1], [0, .5, 0]), bar = box(group, [.013, .09, .015], [0, 1.2, 0]);
    applyShadowPolicy(group, indoor);
    expect([body, bar].every(mesh => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
    applyShadowPolicy(group, outdoor);
    expect(body.castShadow).toBe(true); expect(body.receiveShadow).toBe(true);
    expect(bar.castShadow).toBe(false); expect(bar.receiveShadow).toBe(true);
    // A part added after the first application keeps its own flags outdoors.
    const late = box(group, [.4, .4, .4], [3, 0, 0]); late.receiveShadow = false;
    applyShadowPolicy(group, indoor); expect(late.castShadow).toBe(false);
    applyShadowPolicy(group, outdoor); expect(late.castShadow).toBe(true); expect(late.receiveShadow).toBe(false);
  });

  it('leaves meshes of other nodes attached under the object to their own placement', () => {
    const carrier = new THREE.Group(); carrier.userData.nodeId = 'worker'; box(carrier, [.5, 1.7, .4]).userData.nodeId = 'worker';
    const carried = new THREE.Group(); carried.userData.nodeId = 'tote'; const tote = box(carried, [.6, .3, .4]); tote.userData.nodeId = 'tote'; carrier.add(carried);
    applyShadowPolicy(carrier, indoor);
    expect(tote.castShadow).toBe(true); expect(tote.receiveShadow).toBe(true);
  });

  it('turns casting and receiving off for every interior mesh', () => {
    const object = basicAssets.pallet({ id: 'pallet', kind: 'asset', asset: 'pallet', count: 9 });
    applyShadowPolicy(object, indoor);
    expect(meshes(object).length).toBeGreaterThan(0);
    expect(meshes(object).every(mesh => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
  });

  it('narrows catalog details: a parcel keeps its body and drops tape, seam, sticker and barcode', () => {
    const parcel = basicAssets.parcel({ id: 'parcel', kind: 'asset', asset: 'parcel' });
    applyShadowPolicy(parcel, outdoor);
    expect(byName(parcel, 'parcel-body').every(mesh => mesh.castShadow)).toBe(true);
    for (const name of ['parcel-tape', 'parcel-seam', 'parcel-sticker', 'parcel-barcode']) expect(byName(parcel, name).some(mesh => mesh.castShadow), name).toBe(false);
    const pallet = basicAssets.pallet({ id: 'pallet', kind: 'asset', asset: 'pallet', count: 27 }), before = meshes(pallet).filter(mesh => mesh.castShadow).length;
    applyShadowPolicy(pallet, outdoor);
    expect(meshes(pallet).filter(mesh => mesh.castShadow).length).toBeLessThan(before / 3);
  });

  it('does not let a building shell darken its floor', () => {
    const building = basicAssets.building({ id: 'b', kind: 'asset', asset: 'building', building: { view: 'open' } });
    expect(byName(building, 'building-floor').every(mesh => !mesh.receiveShadow)).toBe(true);
    applyShadowPolicy(building, outdoor);
    expect(byName(building, 'building-wall').some(mesh => mesh.castShadow)).toBe(true);
  });
});

describe('isInsideBuilding', () => {
  const building: AssetNode = { id: 'hall', kind: 'asset', asset: 'building', building: { view: 'open' } };
  const desk: AssetNode = { id: 'desk', kind: 'asset', asset: 'desk-pod', parentId: building.id, position: [1, .12, 0] };
  const worker: AssetNode = { id: 'worker', kind: 'asset', asset: 'worker', parentId: building.id };
  const tote: AssetNode = { id: 'tote', kind: 'asset', asset: 'tote', attachment: { nodeId: worker.id } };
  const sign: AssetNode = { id: 'sign', kind: 'asset', asset: 'sign', attachment: { nodeId: building.id } };
  const yard: AssetNode = { id: 'yard-pallet', kind: 'asset', asset: 'pallet' };
  const index = (nodes: readonly SceneNode[]) => new Map(nodes.map(node => [node.id, node]));

  it('follows parents and carriers, and keeps the building and objects attached to it outside', () => {
    const nodes = [building, desk, worker, tote, sign, yard], byId = index(nodes);
    expect(isInsideBuilding(desk, byId)).toBe(true); expect(isInsideBuilding(worker, byId)).toBe(true); expect(isInsideBuilding(tote, byId)).toBe(true);
    expect(isInsideBuilding(building, byId)).toBe(false); expect(isInsideBuilding(sign, byId)).toBe(false); expect(isInsideBuilding(yard, byId)).toBe(false);
  });

  it('changes when a node or its carrier moves into or out of a building', () => {
    const outsideWorker = { ...worker, parentId: undefined }, store = createSceneStore({ schemaVersion: 1, nodes: [building, outsideWorker, tote, yard] });
    const placement = (id: string) => { const nodes = store.getSnapshot().nodes; return isInsideBuilding(nodes.find(node => node.id === id)!, index(nodes)); };
    expect(placement('tote')).toBe(false);
    store.upsert(worker); expect(placement('worker')).toBe(true); expect(placement('tote')).toBe(true);
    store.upsert({ ...yard, parentId: building.id }); expect(placement('yard-pallet')).toBe(true);
    store.upsert(yard); expect(placement('yard-pallet')).toBe(false);
  });

  it('stops on attachment cycles and missing carriers', () => {
    const a: AssetNode = { id: 'a', kind: 'asset', asset: 'tote', attachment: { nodeId: 'b' } }, b: AssetNode = { id: 'b', kind: 'asset', asset: 'tote', attachment: { nodeId: 'a' } };
    expect(isInsideBuilding(a, index([a, b]))).toBe(false); expect(isInsideBuilding(tote, index([tote]))).toBe(false);
  });
});

describe('interior areas', () => {
  const zone: SceneNode = { id: 'hall', kind: 'zone', size: [10, 4], position: [5, 0, 0], interior: true };
  const store = (nodes: readonly SceneNode[]) => createSceneStore({ schemaVersion: 1, nodes });

  it('accepts ground, zone and sized surfaces and rejects the rest with a fix in the message', () => {
    expect(() => store([zone, { id: 'site', kind: 'ground', size: [40, 30], interior: true }, { id: 'floor', kind: 'asset', asset: 'floor', footprint: [6, 4], interior: true }, { id: 'outside', kind: 'zone', size: [2, 2], interior: false }])).not.toThrow();
    expect(() => store([{ id: 'p', kind: 'path', points: [[0, 0, 0], [1, 0, 0]], interior: true } as unknown as SceneNode])).toThrow('mark a ground, zone or sized surface asset');
    expect(() => store([{ id: 'desk', kind: 'asset', asset: 'desk-pod', interior: true }])).toThrow('needs an explicit footprint');
    expect(() => store([{ id: 'b', kind: 'asset', asset: 'building' }, { ...zone, parentId: 'b' } as SceneNode])).toThrow('must be a top-level node');
    expect(() => store([{ ...zone, interior: 'yes' } as unknown as SceneNode])).toThrow('must be boolean');
  });

  it('passes interior through the Vue node components; React props are the node types', () => {
    // An absent prop must stay undefined rather than default to false.
    for (const component of [Ground, Zone, Asset]) expect((component as unknown as { props: Record<string, unknown> }).props.interior).toEqual({ type: Boolean, default: undefined });
  });

  it('tests pivots against footprints with edges, height, yaw and scale', () => {
    const areas = interiorAreas([zone, { id: 'turned', kind: 'zone', size: [4, 2], position: [0, 0, 20], rotation: [0, Math.PI / 2, 0], scale: [2, 1, 1], interior: true }, { id: 'plain', kind: 'zone', size: [50, 50] }]);
    expect(areas.map(area => area.id)).toEqual(['hall', 'turned']);
    expect(isWithinInteriorArea([5, 0, 0], areas)).toBe(true); expect(isWithinInteriorArea([10, 7, 2], areas)).toBe(true);
    expect(isWithinInteriorArea([10.01, 0, 0], areas)).toBe(false); expect(isWithinInteriorArea([5, 0, -2.01], areas)).toBe(false);
    // 4 m × 2 scaled to 8 m wide, turned 90°: 8 m along z, 2 m along x.
    expect(isWithinInteriorArea([0, 0, 23.9], areas)).toBe(true); expect(isWithinInteriorArea([1.1, 0, 20], areas)).toBe(false);
  });

  it('follows a moving pivot into and out of an area', () => {
    const areas = interiorAreas([zone]);
    expect([-1, 0, 4, 10, 11].map(x => isWithinInteriorArea([x, 0, 1], areas))).toEqual([false, true, true, true, false]);
  });

  it('marks the indoor floors of the domain examples and keeps their outdoor parts outside', () => {
    const pivot = (node: SceneNode) => node.position ?? [0, 0, 0] as const;
    const check = (nodes: readonly SceneNode[], inside: (node: SceneNode) => boolean, outside: readonly string[]) => {
      const areas = interiorAreas(nodes);
      expect(areas.length).toBeGreaterThan(0);
      expect(nodes.filter(inside).length).toBeGreaterThan(0);
      for (const node of nodes.filter(inside)) expect(isWithinInteriorArea(pivot(node), areas), node.id).toBe(true);
      for (const id of outside) expect(isWithinInteriorArea(pivot(nodes.find(node => node.id === id)!), areas), id).toBe(false);
    };
    const ecommerce = createEcommerceSimulation('peak').nodes();
    expect(AREAS.every(area => ecommerce.some(node => node.id === `area:${area.id}` && node.kind === 'zone' && node.interior === true))).toBe(true);
    check(ecommerce, node => node.kind === 'asset' && ['store-shelving', 'pallet-rack', 'checkout-counter'].includes(node.asset), ['yard', 'sidewalk']);
    check(createRestaurantStore().getSnapshot().nodes, node => node.kind === 'asset' && ['espresso-machine', 'walk-in-cooler', 'host-stand'].includes(node.asset), ['terrace']);
    check(createAquaticsStore().getSnapshot().nodes, node => node.kind === 'asset' && ['lap-pool', 'sand-filter', 'lifeguard-chair'].includes(node.asset), ['terrace']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { isInteriorVisible, type AssetNode, type GroundNode } from '@opsorama/core';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { datacenterDefinition, datacenterRecords, datacenterRooms, makeDatacenterStore, setDatacenterRoom, setDatacenterScenario, updateDatacenter } from '../apps/site/examples/datacenter-data';
import { HALL_ROW_Z, rackLocalPosition } from '../apps/site/examples/datacenter-facility';

const entries = ['generator-set', 'air-cooled-chiller', 'electrical-switchgear', 'battery-bank', 'aisle-containment'] as const;
const meshes = (object: THREE.Object3D) => { const result: THREE.Mesh[] = []; object.traverse(part => { if (part instanceof THREE.Mesh) result.push(part); }); return result; };
describe('facility catalog kit', () => {
  it.each(entries)('%s declares finite grounded bounds, inherits palettes and releases owned resources', asset => {
    const node: AssetNode = { id: asset, kind: 'asset', asset, state: 'warning', materials: { trim: '#abcdef' } };
    const first = basicAssets[asset](node, { theme: 'midnight', palette: { surface: '#123456', warning: '#fedcba' } }), second = basicAssets[asset](node);
    const bounds = new THREE.Box3().setFromObject(first); expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(first.userData.facilityBounds.equals(bounds)).toBe(true);
    const materials = meshes(first).map(mesh => mesh.material as THREE.MeshStandardMaterial);
    expect(materials.some(material => material.color.getHexString() === 'abcdef')).toBe(true);
    expect(first.getObjectByName('facility-status')).toBeUndefined();
    for (const mesh of meshes(first)) expect([...mesh.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    const resources = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => resources.has(mesh.geometry) || resources.has(mesh.material as THREE.Material))).toBe(false);
    const positions = first.toJSON(); animateAsset(first, { time: 1, delta: 1 }); expect(first.toJSON()).toEqual(positions);
    const spies = [...resources].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(first); spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });
  it('containment modules join at declared anchors without scaling aisle width', () => {
    const portal = basicAssets['aisle-containment']({ id: 'portal', kind: 'asset', asset: 'aisle-containment' });
    const roof = basicAssets['aisle-containment']({ id: 'roof', kind: 'asset', asset: 'aisle-containment', variant: 'roof' });
    expect(portal.getObjectByName('anchor-entry')).toBeDefined(); expect(portal.getObjectByName('anchor-roof')?.position.y).toBeCloseTo(2.67);
    expect(roof.getObjectByName('anchor-end')!.position.x - roof.getObjectByName('anchor-start')!.position.x).toBe(2.4);
    expect(() => basicAssets['aisle-containment']({ id: 'bad', kind: 'asset', asset: 'aisle-containment', variant: 'automatic' })).toThrow();
    disposeObject(portal); disposeObject(roof);
  });
  it('overview racks preserve counts, envelope, anchors and LED meanings with fewer meshes', () => {
    for (const count of [0, 8, 12]) {
      const node: AssetNode = { id: 'cabinet', kind: 'asset', asset: 'equipment-cabinet', count };
      const detailed = basicAssets['equipment-cabinet'](node), overview = basicAssets['equipment-cabinet']({ ...node, variant: 'overview' });
      expect(overview.children.filter(child => child.name.startsWith('count-part-'))).toHaveLength(count);
      const detailedBounds = new THREE.Box3().setFromObject(detailed), overviewBounds = new THREE.Box3().setFromObject(overview);
      expect(overviewBounds.min.distanceTo(detailedBounds.min)).toBeLessThan(.001); expect(overviewBounds.max.distanceTo(detailedBounds.max)).toBeLessThan(.001);
      for (const anchor of ['front', 'rear', 'top']) expect(overview.getObjectByName(`anchor-${anchor}`)!.position.toArray()).toEqual(detailed.getObjectByName(`anchor-${anchor}`)!.position.toArray());
      expect(meshes(overview).length).toBeLessThan(meshes(detailed).length);
      const bank = meshes(overview).find(mesh => mesh instanceof THREE.InstancedMesh) as THREE.InstancedMesh | undefined;
      expect(bank?.count ?? 0).toBe(count * 12); disposeObject(detailed); disposeObject(overview);
    }
  });
});

describe('research-informed facility composition', () => {
  it('preserves exact room/rack totals, unique source identities and chosen aisle gaps', () => {
    expect(datacenterRooms).toHaveLength(14); expect(datacenterRooms.filter(room => room.kind === 'hall')).toHaveLength(4);
    expect(datacenterRecords).toHaveLength(128); expect(new Set(datacenterRecords.map(record => record.id)).size).toBe(128);
    expect(new Set(datacenterDefinition.nodes.map(node => node.id)).size).toBe(datacenterDefinition.nodes.length);
    expect(datacenterDefinition.nodes.find(node => node.id === 'cooling')).toMatchObject({ entityId: 'COOLING-A', parentId: 'hall-01' });
    for (const room of datacenterRooms.filter(room => room.kind === 'hall')) expect(datacenterRecords.filter(record => record.roomId === room.id)).toHaveLength(32);
    expect(HALL_ROW_Z[1] - HALL_ROW_Z[0] - .93).toBeCloseTo(1.8); expect(HALL_ROW_Z[2] - HALL_ROW_Z[1] - .93).toBeCloseTo(1.2);
    for (let slot = 0; slot < 32; slot++) { const [x, , z] = rackLocalPosition(slot); expect(Math.abs(x) + .43).toBeLessThan(10); expect(Math.abs(z) + .465).toBeLessThan(9); }
  });
  it('room focus and recovery keep every room open with all records, counts and source identities', () => {
    const store = makeDatacenterStore(); updateDatacenter(store, 24, 6, false);
    const ids = store.getSnapshot().nodes.filter(node => !node.id.startsWith('alert-')).map(node => [node.id, node.entityId]);
    setDatacenterRoom(store, 'hall-02');
    let nodes = store.getSnapshot().nodes;
    expect(isInteriorVisible(nodes.find(node => node.id === 'rack')!, nodes)).toBe(true);
    expect(nodes.find(node => node.id === 'rack')).toMatchObject({ variant: 'overview' });
    const secondHall = datacenterRecords.find(record => record.roomId === 'hall-02')!;
    expect(nodes.find(node => node.id === secondHall.id)).toMatchObject({ variant: 'detailed' });
    setDatacenterScenario(store, 'recovered'); setDatacenterRoom(store, 'overview'); nodes = store.getSnapshot().nodes;
    expect(nodes.filter(node => !node.id.startsWith('alert-')).map(node => [node.id, node.entityId])).toEqual(ids);
    expect(nodes.find(node => node.id === 'switch')).toMatchObject({ count: 24, entityId: 'SWITCH-A' }); expect(nodes.find(node => node.id === 'ups')).toMatchObject({ count: 6, entityId: 'UPS-A' });
    expect(datacenterRecords.every(record => isInteriorVisible(nodes.find(node => node.id === record.id)!, nodes))).toBe(true);
    expect(store.getSnapshot().settings.motion).toBe(false);
    const revision = store.getSnapshot().revision; expect(() => setDatacenterRoom(store, 'unknown')).toThrow(); expect(store.getSnapshot().revision).toBe(revision); store.dispose();
  });
  it('keeps the site plan on the grid: a closed ring road and a fence broken only at the entrance, all on the site', () => {
    const assets = datacenterDefinition.nodes.filter((node): node is AssetNode => node.kind === 'asset' && node.parentId === undefined);
    const tiles = new Map(assets.filter(node => node.asset === 'road').map(node => [`${node.position![0]},${node.position![2]}`, node]));
    expect(tiles.size).toBe(54);
    for (const key of tiles.keys()) { const [x, z] = key.split(',').map(Number); expect([tiles.has(`${x - 6},${z}`), tiles.has(`${x + 6},${z}`), tiles.has(`${x},${z - 6}`), tiles.has(`${x},${z + 6}`)].filter(Boolean)).toHaveLength(2); }
    const fence = assets.filter(node => node.asset === 'fence-segment').map(node => ({ along: node.rotation?.[1] ? 'z' : 'x', x: node.position![0], z: node.position![2] }));
    expect(fence.filter(panel => panel.along === 'x' && panel.z === 40).every(panel => panel.x <= -2.5 || panel.x >= 6.5)).toBe(true);
    expect(fence).toHaveLength(2 * 34 + 2 * 29 - 2);
    const [floor] = datacenterDefinition.nodes as readonly GroundNode[];
    for (const node of assets) { expect(Math.abs(node.position![0] - floor.position![0])).toBeLessThanOrEqual(floor.size[0] / 2); expect(Math.abs(node.position![2] - floor.position![2])).toBeLessThanOrEqual(floor.size[1] / 2); }
  });
});

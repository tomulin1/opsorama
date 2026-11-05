import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { isInteriorVisible, type AssetNode } from '@opsorama/core';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { datacenterDefinition, datacenterIncidents, datacenterReading, datacenterRecords, makeDatacenterStore, setDatacenterRoom, setDatacenterScenario, updateDatacenter } from '../apps/site/examples/datacenter-data';

const build = (asset: string, options: Partial<AssetNode> = {}) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options });
const meshes = (model: THREE.Object3D) => { const list: THREE.Mesh[] = []; model.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const counted = (model: THREE.Object3D) => model.children.filter(child => child.name.startsWith('count-part-'));
const pose = (model: THREE.Object3D) => { const values: unknown[] = []; model.traverse(child => values.push([child.position.toArray(), child.rotation.toArray()])); return values; };

describe('datacenter object kit', () => {
  it.each(['rack-server', 'network-switch', 'cooling-unit', 'ups-unit'])('%s is grounded, finite, independently owned and fully disposed', asset => {
    const first = build(asset), second = build(asset), bounds = new THREE.Box3().setFromObject(first);
    expect(bounds.min.y).toBeCloseTo(0, 6);
    for (const mesh of meshes(first)) expect([...mesh.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
    const resources = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => resources.has(mesh.geometry) || resources.has(mesh.material as THREE.Material))).toBe(false);
    const spies = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    disposeObject(first); spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    const before = pose(first); animateAsset(first, { time: 1, delta: 1 }); expect(pose(first)).toEqual(before);
    disposeObject(second);
  });
  it('server sizes fit inside the existing cabinet and mount on their base plane', () => {
    const cabinet = build('equipment-cabinet', { count: 0 });
    for (const variant of ['1u', '2u']) {
      const server = build('rack-server', { variant }), size = new THREE.Box3().setFromObject(server).getSize(new THREE.Vector3());
      expect(size.x).toBeCloseTo(.483, 5); expect(size.y).toBeCloseTo(variant === '1u' ? .04445 : .0889, 5);
      expect(size.x).toBeLessThan(.64); expect(size.z).toBeLessThan(.8);
      expect(server.getObjectByName('anchor-mount')!.position.toArray()).toEqual([0, 0, 0]);
      expect(server.getObjectByName('anchor-front')!.position.z).toBeGreaterThan(.36);
      expect(server.getObjectByName('anchor-rear')!.position.z).toBeLessThan(-.33);
      disposeObject(server);
    }
    disposeObject(cabinet); expect(() => build('rack-server', { variant: '4u' })).toThrow('Unknown rack server variant');
  });
  it('switch plugs occupy unique declared ports, preserve bounds and reject invalid counts', () => {
    let empty: THREE.Box3 | undefined;
    for (const count of [0, 1, 12, 13, 24]) {
      const model = build('network-switch', { count });
      expect(counted(model)).toHaveLength(count);
      const bounds = new THREE.Box3().setFromObject(model); empty ??= bounds;
      // Plug projections increase depth, but never the mounting width or height.
      expect(bounds.min.x).toBeCloseTo(empty.min.x); expect(bounds.max.y).toBeCloseTo(empty.max.y);
      expect(new Set(counted(model).map(plug => `${plug.position.x},${plug.position.y}`)).size).toBe(count);
      for (let i = 0; i < 24; i++) expect(model.getObjectByName(`anchor-port-${i}`)).toBeDefined();
      if (count === 13) expect(counted(model)[12].position.y).toBeGreaterThan(counted(model)[0].position.y);
      disposeObject(model);
    }
    for (const count of [-1, 25, .5]) expect(() => build('network-switch', { count })).toThrow();
  });
  it('UPS modules sit on shelves and do not change the cabinet envelope', () => {
    const empty = build('ups-unit', { count: 0 }), bounds = new THREE.Box3().setFromObject(empty);
    for (const count of [0, 1, 4, 6]) {
      const model = build('ups-unit', { count });
      expect(counted(model)).toHaveLength(count); expect(new THREE.Box3().setFromObject(model).equals(bounds)).toBe(true);
      counted(model).forEach((module, i) => {
        const bottom = new THREE.Box3().setFromObject(module).min.y;
        expect(bottom).toBeCloseTo(model.getObjectByName(`anchor-module-${i}`)!.position.y, 5);
        expect(bounds.containsBox(new THREE.Box3().setFromObject(module))).toBe(true);
      });
      expect(model.getObjectByName('anchor-power-in')!.position.z).toBeLessThan(bounds.min.z);
      expect(model.getObjectByName('anchor-power-out')!.position.z).toBeLessThan(bounds.min.z);
      disposeObject(model);
    }
    disposeObject(empty);
    for (const count of [-1, 7, 1.5]) expect(() => build('ups-unit', { count })).toThrow();
  });
  it('only cooling fans move geometry; localMotion-off and disposed cooling stays static', () => {
    const model = build('cooling-unit'), before = pose(model), intake = model.getObjectByName('anchor-intake')!;
    const housing = model.getObjectByName('cooling-housing')!, housingPose = housing.rotation.toArray();
    expect(intake.position.z).toBeGreaterThan(.55); expect(model.getObjectByName('anchor-exhaust')!.position.z).toBeLessThan(-.52);
    animateAsset(model, { time: .2, delta: .2 }); expect(pose(model)).not.toEqual(before); expect(housing.rotation.toArray()).toEqual(housingPose); disposeObject(model);
    const inactive = build('cooling-unit', { localMotion: false }), staticPose = pose(inactive);
    animateAsset(inactive, { time: 1, delta: 1 }); expect(pose(inactive)).toEqual(staticPose); disposeObject(inactive);
    for (const asset of ['rack-server', 'network-switch', 'ups-unit']) {
      const model = build(asset), before = pose(model); animateAsset(model, { time: 1, delta: 1 }); expect(pose(model)).toEqual(before); disposeObject(model);
    }
  });
  it.each(['rack-server', 'equipment-cabinet'])('%s blinks activity independently while geometry and ownership remain stable', asset => {
    const node = { id: 'activity-a', kind: 'asset' as const, asset, state: 'critical' as const };
    const model = basicAssets[asset](node), second = basicAssets[asset](node);
    const snapshot = (object: THREE.Object3D) => meshes(object).filter((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh).flatMap(mesh => [...mesh.instanceColor!.array]);
    const bank = meshes(model).find((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh)!;
    expect(bank.count).toBe(asset === 'rack-server' ? 12 : 8 * 12);
    expect(meshes(model).filter(mesh => mesh instanceof THREE.InstancedMesh)).toHaveLength(1);
    const release = vi.spyOn(bank, 'dispose');
    const geometry = pose(model);
    expect(model.getObjectByName(asset === 'rack-server' ? 'server-power-mark' : 'cabinet-status')).toBeUndefined();
    const baseline = snapshot(model), frames: string[] = [];
    for (const time of [.1, .4, .8, 1.2, 1.7]) {
      animateAsset(model, { time, delta: .1 }); animateAsset(second, { time, delta: .1 });
      expect(snapshot(model)).toEqual(snapshot(second)); frames.push(JSON.stringify(snapshot(model)));
      expect(pose(model)).toEqual(geometry);
      const colors = snapshot(model);
      for (let index = 1; index < bank.count; index += 2) expect(colors.slice(index * 3, index * 3 + 3)).toEqual(baseline.slice(index * 3, index * 3 + 3));
    }
    expect(new Set(frames).size).toBeGreaterThan(1); expect(frames.some(frame => frame !== JSON.stringify(baseline))).toBe(true);
    disposeObject(model); expect(release).toHaveBeenCalledTimes(1); const disposed = snapshot(model); animateAsset(model, { time: 3, delta: 1 }); expect(snapshot(model)).toEqual(disposed);
    disposeObject(second);
    for (const options of [{ localMotion: false }]) {
      const staticModel = basicAssets[asset]({ ...node, ...options }), before = snapshot(staticModel);
      animateAsset(staticModel, { time: 1, delta: 1 }); expect(snapshot(staticModel)).toEqual(before); disposeObject(staticModel);
    }
  });
  it.each([['rack-server', 'server-face'], ['network-switch', 'switch-face'], ['cooling-unit', 'cooling-housing'], ['ups-unit', 'ups-housing']])('%s keeps color overrides on its documented panels', (asset, panel) => {
    const model = build(asset, { color: '#123456', state: 'critical' });
    const changed = meshes(model).filter(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHexString() === '123456');
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(mesh => mesh.name === panel || (asset === 'ups-unit' && mesh.name === 'ups-control'))).toBe(true);
    disposeObject(model);
  });
  it('fixture updates retain source identity, selection and model placement', () => {
    const store = makeDatacenterStore(); store.select('switch'); updateDatacenter(store, 24, 6, false);
    expect(store.getSnapshot().selection?.entityId).toBe('SWITCH-A'); expect(store.getSnapshot().settings.motion).toBe(false);
    const nodes = store.getSnapshot().nodes;
    expect(nodes.find(node => node.id === 'switch')).toMatchObject({ count: 24, parentId: 'hall-01', position: [-6, 1.94, -3.545] });
    expect(nodes.find(node => node.id === 'ups')).toMatchObject({ count: 6, entityId: 'UPS-A' });
    for (const node of datacenterDefinition.nodes.filter(node => node.kind === 'asset')) {
      if (node.kind !== 'asset') continue;
      // Browser artwork rendering is covered by the native-adapter fixture; keep this geometry check DOM-free.
      const model = build(node.asset, { ...node, surfaceLabel: undefined }); expect(model.children.length).toBeGreaterThan(0); disposeObject(model);
    }
    store.dispose();
  });
  it('recovers and restores rack-linked alerts without changing equipment identity, counts or selection', () => {
    const store = makeDatacenterStore(); store.select('rack-a02');
    updateDatacenter(store, 24, 6, false);
    const ids = store.getSnapshot().nodes.filter(node => !node.id.startsWith('alert-')).map(node => [node.id, node.entityId]);
    setDatacenterScenario(store, 'recovered');
    expect(store.getSnapshot().selection?.nodeId).toBe('rack-a02');
    expect(store.getSnapshot().nodes.filter(node => node.id.startsWith('alert-'))).toHaveLength(0);
    expect(store.getSnapshot().nodes.find(node => node.id === 'rack-a02')?.state).toBe('normal');
    expect(datacenterReading(datacenterRecords[1], 'recovered').inlet).toBe(24.2);
    setDatacenterScenario(store, 'incident'); setDatacenterScenario(store, 'incident');
    expect(store.getSnapshot().nodes.filter(node => node.id.startsWith('alert-'))).toHaveLength(3);
    expect(store.getSnapshot().nodes.filter(node => !node.id.startsWith('alert-')).map(node => [node.id, node.entityId])).toEqual(ids);
    expect(store.getSnapshot().nodes.find(node => node.id === 'switch')).toMatchObject({ count: 24 });
    expect(store.getSnapshot().settings.motion).toBe(false);
    for (const incident of datacenterIncidents) {
      const pin = store.getSnapshot().nodes.find(node => node.id === `alert-${incident.id}`)!;
      const rack = store.getSnapshot().nodes.find(node => node.id === incident.nodeId)!;
      expect(pin).toMatchObject({ kind: 'marker', attachment: { nodeId: rack.id, anchor: 'top' }, state: incident.severity, label: incident.title, detail: incident.reading });
      expect(rack.state).toBe(incident.severity);
    }
    store.select('alert-thermal'); setDatacenterScenario(store, 'recovered');
    expect(store.getSnapshot().selection).toBeNull(); store.dispose();
  });
  it.each(['equipment-cabinet', 'rack-server', 'network-switch', 'cooling-unit', 'ups-unit'])('%s inherits semantic materials, allows partial overrides and keeps host health outside geometry', asset => {
    const normal = basicAssets[asset]({ id: asset, kind: 'asset', asset }, { theme: 'light', palette: { structure: '#123456', critical: '#fedcba' } });
    expect(meshes(normal).some(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHexString() === '123456')).toBe(true);
    const critical = basicAssets[asset]({ id: asset, kind: 'asset', asset, state: 'critical', materials: { trim: '#abcdef' } }, { theme: 'midnight', palette: { critical: '#fedcba' } });
    const colors = meshes(critical).map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHexString());
    expect(colors).not.toContain('fedcba'); expect(colors).toContain('abcdef');
    disposeObject(normal); disposeObject(critical);
  });
  it.each(['overview', 'hall-01', 'plant-yard'])('records visible %s fixture costs without claiming a hardware frame budget', room => {
    const store = makeDatacenterStore(); setDatacenterRoom(store, room); const nodes = store.getSnapshot().nodes;
    let meshCount = 0, triangles = 0, bufferBytes = 0;
    for (const node of nodes) {
      if (node.kind !== 'asset' || !isInteriorVisible(node, nodes)) continue;
      const model = build(node.asset, { ...node, surfaceLabel: undefined });
      try {
        for (const mesh of meshes(model)) {
          meshCount++;
          triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
          bufferBytes += Object.values(mesh.geometry.attributes).reduce((bytes, attribute) => bytes + attribute.array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0);
          if (mesh instanceof THREE.InstancedMesh) bufferBytes += mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
        }
      } finally { disposeObject(model); }
    }
    expect([meshCount, triangles, bufferBytes].every(value => Number.isFinite(value) && value > 0)).toBe(true);
    console.info('Visible datacenter asset geometry (no ground/zones, label artwork or renderer rings):', { room, meshCount, triangles, bufferBytes }); store.dispose();
  });
});

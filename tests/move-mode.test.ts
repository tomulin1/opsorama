import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createHandlingState, createMoveMode, type MoveRequest } from '@opsorama/core';
import { bindMoveMode, createMoveTargetObject, disposeObject, highlightMoveTarget, type MoveTargetMarker } from '@opsorama/three';
import { assetHandling, handlingProfiles } from '@opsorama/objects';
import { createMoveModeSession, moveModeDefinition, moveModeUnits, targetLabel } from '../apps/site/examples/move-mode-data';

const state = () => {
  const handling = createHandlingState({ handling: assetHandling, profiles: handlingProfiles, instances: [
    { id: 'shelf', asset: 'shelf' }, { id: 'rack', asset: 'pallet-rack' }, { id: 'pallet', asset: 'pallet' }, { id: 'jack', asset: 'pallet-jack' },
    { id: 'c0', asset: 'parcel' }, { id: 'c1', asset: 'parcel' },
  ] });
  handling.move([{ unit: 'c0', to: { container: 'pallet', receptacle: 'deck' } }]);
  return handling;
};
const marker = (index: number, x: number): MoveTargetMarker => ({ index, position: new THREE.Vector3(x, 1, 0), quaternion: new THREE.Quaternion(), size: { footprint: [1.2, 1], height: .6 } });
const boxes = (group: THREE.Group) => group.children as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];

describe('move mode (H3)', () => {
  it('offers targets with the unit size, and explains refused places', () => {
    const handling = state();
    const onDeck = handling.targets('c1').find(entry => entry.target.container === 'pallet')!;
    expect(onDeck.size.footprint).toEqual([.34, .41]);
    expect(onDeck.size.height).toBeCloseTo(.33);
    // A pallet's size includes its load.
    const inRack = handling.targets('pallet').find(entry => entry.target.container === 'rack')!;
    expect(inRack.size.height).toBeCloseTo(.54);
    expect(handling.refusals('c1').map(entry => `${entry.container} ${entry.receptacle} ${entry.violations[0].code}`)).toEqual(['rack level-0 class-not-accepted', 'rack level-1 class-not-accepted', 'rack level-2 class-not-accepted', 'jack load class-not-accepted']);
    expect(handling.refusals('pallet').map(entry => entry.container)).toEqual(['shelf', 'shelf', 'shelf']);
    expect(handling.refusals('pallet', { containers: ['rack'] })).toEqual([]);
    expect(handling.refusals('ghost')).toEqual([]);
  });

  it('begins, follows the state and cancels', () => {
    const handling = state(), listener = vi.fn(), mode = createMoveMode({ handling, onRequest: () => {} });
    expect(mode.getSnapshot()).toEqual({ unit: null, targets: [], refusals: [] });
    mode.subscribe(listener);
    mode.begin('c1');
    const before = mode.getSnapshot();
    expect(before.unit).toBe('c1');
    expect(before.targets.length).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledTimes(1);
    handling.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-0', position: 0 } }]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(mode.getSnapshot().targets.some(entry => entry.target.receptacle === 'level-0' && entry.target.position === 0)).toBe(false);
    mode.cancel(); mode.cancel();
    expect(mode.getSnapshot().unit).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    handling.move([{ unit: 'c0', to: { container: 'shelf', receptacle: 'level-0', position: 1 } }]);
    expect(listener).toHaveBeenCalledTimes(3);
    mode.dispose();
  });

  it('honours containers, rank and limit', () => {
    const handling = state(), mode = createMoveMode({ handling, onRequest: () => {}, containers: ['shelf'], rank: entry => -(entry.placement.position ?? 0), limit: 1 });
    mode.begin('c1');
    expect(mode.getSnapshot().targets.map(entry => [entry.target.container, entry.target.position])).toEqual([['shelf', 3]]);
    expect(mode.getSnapshot().refusals).toEqual([]);
    mode.dispose();
  });

  it('turns a choice into a request and leaves the move to the host', () => {
    const handling = state(), requests: MoveRequest[] = [];
    const mode = createMoveMode({ handling, onRequest: request => requests.push(request) });
    mode.request(handling.targets('c1')[0]);
    expect(requests).toEqual([]);
    mode.begin('c0');
    const target = mode.getSnapshot().targets.find(entry => entry.target.container === 'shelf')!;
    mode.request(target);
    expect(requests[0]).toMatchObject({ unit: 'c0', from: { container: 'pallet' }, check: { ok: true } });
    expect(handling.placement('c0')).toMatchObject({ container: 'pallet' });
    // A stale target arrives with the failed check, so the host can explain it.
    handling.move([{ unit: 'c1', to: target.target }]);
    mode.request(target);
    expect(requests[1].check).toMatchObject({ ok: false, violations: [{ code: 'position-taken' }] });
    mode.dispose();
  });

  it('dispose stops following the state and clears listeners', () => {
    const handling = state(), listener = vi.fn(), mode = createMoveMode({ handling, onRequest: () => {} });
    mode.subscribe(listener);
    mode.begin('c1');
    mode.dispose();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(mode.getSnapshot().unit).toBeNull();
    handling.move([{ unit: 'c1', to: { container: 'shelf', receptacle: 'level-0' } }]);
    mode.begin('c1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('builds static pickable markers that own their resources', () => {
    const rotated = { ...marker(4, 3), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2) };
    const group = createMoveTargetObject([marker(0, 0), rotated]), [first, second] = boxes(group);
    expect(first.position.toArray()).toEqual([0, 1.3, 0]);
    expect(first.geometry.parameters).toMatchObject({ width: 1.2, height: .6, depth: 1 });
    expect(second.userData.moveTarget).toBe(4);
    expect(second.quaternion.equals(rotated.quaternion)).toBe(true);
    expect(first.material.depthTest).toBe(false);
    expect(first.castShadow).toBe(false);
    const dispose = vi.spyOn(first.geometry, 'dispose'), material = vi.spyOn(first.material, 'dispose');
    highlightMoveTarget(group, 4);
    expect(second.material.opacity).toBeGreaterThan(first.material.opacity);
    highlightMoveTarget(group, null);
    expect(second.material.opacity).toBe(first.material.opacity);
    disposeObject(group);
    expect(dispose).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
  });

  it('a ray finds the nearest marker', () => {
    const group = createMoveTargetObject([marker(0, 0), marker(1, 3)]);
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(3, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObjects(group.children, false)[0].object.userData.moveTarget).toBe(1);
    disposeObject(group);
  });

  it('binds markers to the snapshot and clears them', () => {
    const handling = state(), mode = createMoveMode({ handling, onRequest: () => {} }), renderer = { setMoveTargets: vi.fn() };
    const stop = bindMoveMode(renderer, mode);
    expect(renderer.setMoveTargets).toHaveBeenLastCalledWith(null, mode.request);
    mode.begin('c1');
    expect(renderer.setMoveTargets).toHaveBeenLastCalledWith(mode.getSnapshot().targets, mode.request);
    stop();
    expect(renderer.setMoveTargets).toHaveBeenLastCalledWith(null);
    mode.cancel();
    expect(renderer.setMoveTargets).toHaveBeenCalledTimes(3);
    mode.dispose();
  });

  it('the example moves a loaded pallet into the rack through a request', () => {
    const session = createMoveModeSession(), { store, mode } = session;
    const node = (id: string) => store.getSnapshot().nodes.find(entry => entry.id === id);
    expect(node('parcel-1')?.attachment).toEqual({ nodeId: 'pallet-a', anchor: 'load' });
    expect(moveModeUnits).toHaveLength(10);
    store.select('pallet-a', 'keyboard');
    expect(mode.getSnapshot().unit).toBe('pallet-a');
    const target = mode.getSnapshot().targets.find(entry => entry.target.container === 'rack')!;
    expect(targetLabel(target)).toBe('Pallet rack, level-0, position 1');
    mode.request(target);
    expect(node('pallet-a')).toMatchObject({ attachment: { nodeId: 'rack', anchor: 'slot-0' }, transfer: { seconds: .5 } });
    expect(node('parcel-1')?.attachment).toEqual({ nodeId: 'pallet-a', anchor: 'load' });
    expect(session.getLog()[0]).toContain('moved');
    expect(store.getSnapshot().selection).toBeNull();
    expect(mode.getSnapshot().unit).toBeNull();
    store.select('rack', 'keyboard');
    expect(mode.getSnapshot().unit).toBeNull();
    session.dispose();
  });

  it('stays out of domain examples', () => {
    expect(moveModeDefinition.nodes.length).toBeGreaterThan(10);
    for (const file of ['apps/site/src/features/ecommerce/scene.ts', 'apps/site/src/features/office/scene.ts', 'apps/site/src/features/farm/scene.ts']) expect(readFileSync(file, 'utf8')).not.toMatch(/createMoveMode|bindMoveMode/);
    expect([...readFileSync('packages/core/src/move-mode.ts', 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1])).toEqual(['./handling-state']);
  });
});

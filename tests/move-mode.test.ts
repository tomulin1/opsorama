import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createPickTargetObject, disposeObject, disposePickTargets, highlightPickTarget, pickTargetBoxes, validatePickTarget, type PickTargetMarker } from '@opsorama/three';
import { assetHandling, handlingProfiles } from '@opsorama/objects';
import { createMoveModeSession, moveModeDefinition, moveModeUnits, targetLabel } from '../apps/site/examples/move-mode-data';
import { bindMoveMode, createHandlingState, createMoveMode, moveTargetPick, type MoveRequest } from '@opsorama/objects/handling';

const state = () => {
  const handling = createHandlingState({ handling: assetHandling, profiles: handlingProfiles, instances: [
    { id: 'shelf', asset: 'shelf' }, { id: 'rack', asset: 'pallet-rack' }, { id: 'pallet', asset: 'pallet' }, { id: 'jack', asset: 'pallet-jack' },
    { id: 'c0', asset: 'parcel' }, { id: 'c1', asset: 'parcel' },
  ] });
  handling.move([{ unit: 'c0', to: { container: 'pallet', receptacle: 'deck' } }]);
  return handling;
};
const marker = (index: number, x: number): PickTargetMarker => ({ index, position: new THREE.Vector3(x, 1, 0), quaternion: new THREE.Quaternion(), size: [1.2, .6, 1] });
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
    const group = createPickTargetObject([marker(0, 0), rotated]), [first, second] = boxes(group);
    expect(first.position.toArray()).toEqual([0, 1.3, 0]);
    expect(first.geometry.parameters).toMatchObject({ width: 1.2, height: .6, depth: 1 });
    expect(second.userData.pickTarget).toBe(4);
    expect(second.quaternion.equals(rotated.quaternion)).toBe(true);
    expect(first.material.depthTest).toBe(false);
    expect(first.castShadow).toBe(false);
    const dispose = vi.spyOn(first.geometry, 'dispose'), material = vi.spyOn(first.material, 'dispose');
    highlightPickTarget(group, 4);
    expect(second.material.opacity).toBeGreaterThan(first.material.opacity);
    highlightPickTarget(group, null);
    expect(second.material.opacity).toBe(first.material.opacity);
    disposeObject(group);
    expect(dispose).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
  });

  it('a ray finds the nearest marker', () => {
    const group = createPickTargetObject([marker(0, 0), marker(1, 3)]);
    group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(3, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObjects(group.children, false)[0].object.userData.pickTarget).toBe(1);
    disposeObject(group);
  });

  it('draws a ghost that borrows the model geometry, turned and scaled, over a pick box that is not drawn', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1), model = new THREE.Group(), part = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    part.position.set(0, .5, 0); model.add(part, new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true })));
    const group = createPickTargetObject([{ ...marker(2, 3), ghost: { object: model, scale: new THREE.Vector3(2, 2, 2) }, yaw: Math.PI / 2, color: '#c0392b' }]);
    const [box] = pickTargetBoxes(group), copy = group.children.find(child => child.name === 'pick-target-ghost')!;
    expect(box.visible).toBe(false);
    // The glass part is left out; the opaque part is drawn twice, in view and through what covers it.
    expect(copy.children).toHaveLength(2);
    expect((copy.children[0] as THREE.Mesh).geometry).toBe(geometry);
    expect(copy.position.toArray()).toEqual([3, 1, 0]); expect(copy.scale.toArray()).toEqual([2, 2, 2]);
    expect(copy.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))).toBeLessThan(1e-6);
    expect(((copy.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('c0392b');
    group.updateMatrixWorld(true);
    expect(new THREE.Raycaster(new THREE.Vector3(3, 10, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(pickTargetBoxes(group), false)[0].object.userData.pickTarget).toBe(2);
    const front = (copy.children[1] as THREE.Mesh).material as THREE.Material, rest = front.opacity;
    highlightPickTarget(group, 2); expect(front.opacity).toBeGreaterThan(rest);
    const borrowed = vi.spyOn(geometry, 'dispose'), material = vi.spyOn(front, 'dispose');
    disposePickTargets(group);
    expect(borrowed).not.toHaveBeenCalled(); expect(material).toHaveBeenCalled();
  });

  it('checks pick targets with errors that name the fix', () => {
    expect(() => validatePickTarget({ size: [1, 1, 1] }, 0)).toThrow('needs a node (with an optional anchor and offset) or a world position');
    expect(() => validatePickTarget({ position: [0, 0, 0], size: [1, 0, 1] }, 1)).toThrow('size must be three numbers greater than 0');
    expect(() => validatePickTarget({ node: 'rack', size: [1, 1, 1], yaw: Number.NaN }, 2)).toThrow('yaw must be a finite number of radians');
    expect(() => validatePickTarget({ node: 'rack', size: [1, 1, 1], ghost: { asset: ' ' } }, 3)).toThrow('ghost must be a scene node ID or a model with an asset name');
    expect(() => validatePickTarget({ position: [1, 0, 2], size: [1, 1, 1], ghost: { asset: 'pallet', count: 4 }, yaw: 1 }, 4)).not.toThrow();
  });

  it('binds markers to the snapshot and clears them', () => {
    const requests: MoveRequest[] = [], handling = state(), mode = createMoveMode({ handling, onRequest: request => requests.push(request) }), renderer = { setPickTargets: vi.fn() };
    const stop = bindMoveMode(renderer, mode);
    expect(renderer.setPickTargets).toHaveBeenLastCalledWith(null, expect.any(Function));
    mode.begin('c1');
    const { targets } = mode.getSnapshot(), [picks, onPick] = renderer.setPickTargets.mock.lastCall!;
    expect(picks).toEqual(targets.map(target => moveTargetPick(target, 'c1')));
    const shelf = targets.findIndex(target => target.target.container === 'shelf');
    expect(picks[shelf]).toEqual({ node: 'shelf', anchor: targets[shelf].placement.anchor, offset: targets[shelf].placement.offset, size: [targets[shelf].size.footprint[0], targets[shelf].size.height, targets[shelf].size.footprint[1]], ghost: 'c1', yaw: targets[shelf].placement.turn * Math.PI / 180 });
    // An index, as Array.map passes it, is not a unit: the target stays a box.
    expect(moveTargetPick(targets[shelf], 3 as unknown as string)).not.toHaveProperty('ghost');
    onPick(picks[shelf], shelf);
    expect(requests.map(request => request.target)).toEqual([targets[shelf]]);
    stop();
    expect(renderer.setPickTargets).toHaveBeenLastCalledWith(null);
    mode.cancel();
    expect(renderer.setPickTargets).toHaveBeenCalledTimes(3);
    mode.dispose();
  });

  it('binds boxes instead of ghosts on request', () => {
    const handling = state(), mode = createMoveMode({ handling, onRequest: () => {} }), renderer = { setPickTargets: vi.fn() };
    const stop = bindMoveMode(renderer, mode, { ghost: false });
    mode.begin('c1');
    expect(renderer.setPickTargets.mock.lastCall![0]).toEqual(mode.getSnapshot().targets.map(target => moveTargetPick(target)));
    stop(); mode.dispose();
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
    expect([...readFileSync('packages/objects/src/handling/move-mode.ts', 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1])).toEqual(['./state']);
    expect([...readFileSync('packages/objects/src/handling/bind-move-mode.ts', 'utf8').matchAll(/^import (type )?.* from '([^']+)'/gm)].map(match => `${match[1] ?? ''}${match[2]}`)).toEqual(['type @opsorama/three', 'type ./move-mode', 'type ./state']);
  });
});

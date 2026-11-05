import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBehaviorRunner, createNavGraph, createSceneStore, resolveSceneSlots, slotNavPoints, validateCarryRule, type AssetNode, type BehaviorAgent, type BehaviorEvent, type BehaviorRunner, type BehaviorStep, type CarryRule, type ItemRest } from '@opsorama/core';
import { assetInteractionSlots } from '@opsorama/renderer-three';
import { advanceTransfer, startTransfer } from '../packages/renderer-three/src/transfer';

const objects: AssetNode[] = [{ id: 'shelf', kind: 'asset', asset: 'shelf', position: [0, 0, -2] }, { id: 'desk', kind: 'asset', asset: 'station', position: [6, 0, -2] }];
const slots = resolveSceneSlots(objects, assetInteractionSlots);
const graph = createNavGraph({
  points: [{ id: 'aisle', position: [0, 0, 0] }, { id: 'desk-aisle', position: [6, 0, 0] }, ...slotNavPoints(slots)],
  edges: [{ from: 'aisle', to: 'shelf:pick-0' }, { from: 'aisle', to: 'shelf:pick-1' }, { from: 'aisle', to: 'desk-aisle' }, { from: 'desk-aisle', to: 'desk:work' }],
  agents: { person: { speed: 1 } },
});
const pick0 = slots.find(slot => slot.id === 'shelf:pick-0')!;
const run = (carry: CarryRule, step: BehaviorStep, items: readonly { id: string; at: ItemRest }[]) => {
  const agent: BehaviorAgent = { id: 'a', agent: 'person', start: 'aisle', carry, steps: [{ kind: 'wait', seconds: .1 }, step] };
  const runner = createBehaviorRunner({ graph, slots, agents: [agent], items }), events: BehaviorEvent[] = [];
  runner.subscribeEvents(event => events.push(event));
  return { runner, events };
};
const timeOf = (events: readonly BehaviorEvent[], type: BehaviorEvent['type']) => events.find(event => event.type === type)!.time;
const pick = (seconds: number, pickUp: number | readonly string[] = 1): BehaviorStep => ({ kind: 'interact', node: 'shelf', slot: 'pick-0', seconds, pickUp });
const onShelf: ItemRest = { node: 'shelf', offset: [0, 1.1, .1] };

describe('hand-over timing', () => {
  it('exchanges items before the interaction ends, while the agent is still at the slot', () => {
    const { runner, events } = run({ anchor: 'carry', handOverSeconds: 1 }, pick(3), [{ id: 'p1', at: onShelf }]);
    runner.advance(30);
    const started = timeOf(events, 'interaction-started');
    expect(timeOf(events, 'picked-up')).toBeCloseTo(started + 2);
    expect(timeOf(events, 'interaction-ended')).toBeCloseTo(started + 3);
    // Same timing as without a hand-over: the interaction still lasts 3 s.
    const plain = run({ anchor: 'carry' }, pick(3), [{ id: 'p1', at: onShelf }]);
    plain.runner.advance(30);
    expect(timeOf(plain.events, 'picked-up')).toBeCloseTo(started + 3);
    expect(timeOf(plain.events, 'interaction-ended')).toBeCloseTo(timeOf(events, 'interaction-ended'));
  });

  it('holds the item during the rest of the interaction and keeps it after an interrupt', () => {
    const { runner, events } = run({ anchor: 'carry', handOverSeconds: 1 }, pick(3), [{ id: 'p1', at: onShelf }]);
    const probe = (seconds: number) => { runner.advance(seconds); return runner.getAgent('a')!; };
    let state = probe(.1);
    while (state.phase !== 'interacting') state = probe(.1);
    const started = runner.time;
    while (runner.time < started + 2.5) state = probe(.1);
    expect(state).toMatchObject({ phase: 'interacting', carrying: ['p1'] });
    expect(runner.getItems().get('p1')).toEqual({ holder: 'a', anchor: 'carry', offset: [0, 0, 0] });
    runner.assign('a', [{ kind: 'move', to: 'aisle' }]);
    expect(runner.getAgent('a')?.carrying).toEqual(['p1']);
    expect(events.find(event => event.type === 'interaction-ended')).toMatchObject({ interrupted: true });
  });

  it('caps the hand-over at the whole interaction', () => {
    const { runner, events } = run({ anchor: 'carry', handOverSeconds: 5 }, pick(2), [{ id: 'p1', at: onShelf }]);
    runner.advance(30);
    expect(timeOf(events, 'picked-up')).toBeCloseTo(timeOf(events, 'interaction-started'));
    expect(timeOf(events, 'interaction-ended')).toBeCloseTo(timeOf(events, 'interaction-started') + 2);
  });
});

describe('reach', () => {
  const near: ItemRest = { position: [pick0.position[0] + .5, 0, pick0.position[2]] }, far: ItemRest = { position: [pick0.position[0] + 3, 0, pick0.position[2]] };
  const outcome = (runner: BehaviorRunner) => { runner.advance(30); const state = runner.getAgent('a')!; return { phase: state.phase, carrying: state.carrying, codes: state.violations?.map(violation => violation.code) }; };

  it('takes items on the object or within reach, and blocks with a fix for the others', () => {
    const rule = { anchor: 'carry', capacity: 2, reach: 1 };
    expect(outcome(run(rule, pick(1, ['shelf-item', 'near']), [{ id: 'shelf-item', at: onShelf }, { id: 'near', at: near }]).runner)).toMatchObject({ phase: 'idle', carrying: ['shelf-item', 'near'] });
    const blocked = run(rule, pick(1, ['far']), [{ id: 'far', at: far }]).runner;
    expect(outcome(blocked)).toMatchObject({ phase: 'blocked', codes: ['item-out-of-reach'] });
    expect(blocked.getAgent('a')!.violations![0].message).toMatch(/far is out of reach of a at shelf:pick-0: put it on shelf or within 1 m/);
    // Nothing changed: the item still rests where it was.
    expect(blocked.getItems().get('far')).toEqual({ position: far.position, yaw: 0 });
    expect(outcome(run(rule, pick(1, ['on-desk']), [{ id: 'on-desk', at: { node: 'desk' } }]).runner)).toMatchObject({ phase: 'blocked', codes: ['item-out-of-reach'] });
    // Without a reach, as before, an ID pick-up takes the item wherever it is.
    expect(outcome(run({ anchor: 'carry' }, pick(1, ['far']), [{ id: 'far', at: far }]).runner)).toMatchObject({ phase: 'idle', carrying: ['far'] });
  });

  it('validates hand-over seconds and reach', () => {
    expect(() => validateCarryRule({ anchor: 'carry', handOverSeconds: 6 })).toThrow('hand-over');
    expect(() => validateCarryRule({ anchor: 'carry', handOverSeconds: -1 })).toThrow('hand-over');
    expect(() => validateCarryRule({ anchor: 'carry', reach: 0 })).toThrow('reach');
  });
});

describe('node transfer', () => {
  it('validates and freezes the transfer of a node', () => {
    const node = (transfer: AssetNode['transfer']): AssetNode => ({ id: 'p', kind: 'asset', asset: 'parcel', transfer });
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [node({ seconds: 0 })] })).toThrow('transfer seconds');
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [node({ seconds: 1, arc: 3 })] })).toThrow('transfer arc');
    const store = createSceneStore({ schemaVersion: 1, nodes: [node({ seconds: .6 })] }), stored = store.getSnapshot().nodes[0] as AssetNode;
    expect(Object.isFrozen(stored.transfer)).toBe(true);
    store.dispose();
  });

  it('moves from the old world pose to the new parent along an arc, following a moving parent', () => {
    const scene = new THREE.Scene(), shelf = new THREE.Group(), hands = new THREE.Group(), item = new THREE.Object3D();
    shelf.position.set(0, 1, 0); hands.position.set(4, 0, 0); hands.rotation.y = Math.PI / 2;
    scene.add(shelf, hands); shelf.add(item); item.position.set(0, .2, 0); scene.updateMatrixWorld(true);
    const state = startTransfer(item, { seconds: 1, arc: .5 });
    expect(state.position.toArray()).toEqual([0, 1.2, 0]);
    // Re-parent, as the renderer does when the attachment changes; the target is local to the new parent.
    hands.add(item);
    const target = new THREE.Vector3(0, 1, .3), world = () => item.getWorldPosition(new THREE.Vector3());
    expect(advanceTransfer(item, state, target, [0, 0, 0], .5)).toBe(true);
    // Half-way between (0, 1.2, 0) and the goal (4.3, 1, 0), lifted by the full arc.
    expect(world().x).toBeCloseTo(2.15); expect(world().y).toBeCloseTo(1.1 + .5); expect(world().z).toBeCloseTo(0);
    // A paused clock holds the pose; the goal follows the parent while it moves.
    const held = world().clone();
    expect(advanceTransfer(item, state, target, [0, 0, 0], 0)).toBe(true);
    expect(world().distanceTo(held)).toBeLessThan(1e-9);
    hands.position.x = 6;
    expect(advanceTransfer(item, state, target, [0, 0, 0], .6)).toBe(false);
    expect(item.position.toArray()).toEqual([0, 1, .3]);
    expect(world().x).toBeCloseTo(6.3);
    // Motion off finishes at once.
    const again = startTransfer(item, { seconds: 2 });
    expect(again.arc).toBe(.25);
    expect(advanceTransfer(item, again, new THREE.Vector3(0, 0, 0), [0, 1, 0], Infinity)).toBe(false);
    expect(item.position.toArray()).toEqual([0, 0, 0]); expect(item.rotation.y).toBe(1);
  });

  it('times the example parcel hand-over to the picker leaving', async () => {
    const { createShift, itemNodes } = await import('../examples/motion-data');
    const runner = createShift(), events: BehaviorEvent[] = [];
    runner.subscribeEvents(event => events.push(event));
    runner.advance(60);
    const picked = events.find(event => event.type === 'picked-up')!;
    const ended = events.find(event => event.type === 'interaction-ended' && event.agent === picked.agent && event.time >= picked.time)!;
    expect(ended.time - picked.time).toBeCloseTo(.6);
    expect(itemNodes(runner.getItems()).every(node => node.transfer?.seconds === .6)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBehaviorRunner, createNavGraph, createSceneStore, itemNode, resolveSceneSlots, slotNavPoints, type AssetNode, type BehaviorAgent, type BehaviorEvent, type BehaviorStep } from '@opsorama/core';
import { assetInteractionSlots, basicAssets, disposeObject } from '@opsorama/renderer-three';

const objects: AssetNode[] = [
  { id: 'shelf', kind: 'asset', asset: 'shelf', position: [0, 0, -2] },
  { id: 'desk', kind: 'asset', asset: 'station', position: [6, 0, -2] },
];
const slots = resolveSceneSlots(objects, assetInteractionSlots);
const graph = createNavGraph({
  points: [{ id: 'aisle', position: [0, 0, 0] }, { id: 'desk-aisle', position: [6, 0, 0] }, ...slotNavPoints(slots)],
  edges: [{ from: 'aisle', to: 'shelf:pick-0' }, { from: 'aisle', to: 'shelf:pick-1' }, { from: 'aisle', to: 'desk-aisle' }, { from: 'desk-aisle', to: 'desk:work' }],
  agents: { person: { speed: 1 } },
});
const carry = { anchor: 'carry', capacity: 2, stackHeight: .4, travelPose: 'holding', idlePose: 'holding' };
const picker = (steps: readonly BehaviorStep[], extra: Partial<BehaviorAgent> = {}): BehaviorAgent => ({ id: 'a', agent: 'person', start: 'aisle', carry, steps, ...extra });
const onShelf = (x: number) => ({ node: 'shelf', offset: [x, 1.1, .1] as const });
const pickStep: BehaviorStep = { kind: 'interact', node: 'shelf', slot: 'pick-0', seconds: 2, pose: 'picking', pickUp: 1 };
const packStep: BehaviorStep = { kind: 'interact', node: 'desk', seconds: 3, pose: 'placing', putDown: 'all', putOn: { anchor: 'output' } };

describe('carrying items', () => {
  it('picks an item up when the interaction ends, carries it and puts it down on an anchor', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [picker([pickStep, packStep])], items: [{ id: 'p1', at: onShelf(-.5) }, { id: 'p2', at: onShelf(.5) }] });
    const events: BehaviorEvent[] = []; runner.subscribeEvents(event => events.push(event));
    runner.advance(3);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'interacting', pose: 'picking' });
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    runner.advance(1);
    // The oldest resting item on the shelf goes to the agent's carry anchor; the agent walks holding it.
    expect(runner.getAgent('a')).toMatchObject({ phase: 'moving', pose: 'holding', carrying: ['p1'] });
    expect(runner.getItems().get('p1')).toEqual({ holder: 'a', anchor: 'carry', offset: [0, 0, 0] });
    expect(runner.getItems().get('p2')).toEqual({ node: 'shelf', offset: [.5, 1.1, .1] });
    runner.advance(60);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'idle', pose: 'idle' });
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    expect(runner.getItems().get('p1')).toEqual({ node: 'desk', anchor: 'output', offset: [0, 0, 0] });
    expect([...runner.getItems().keys()]).toEqual(['p2', 'p1']);
    expect(events.filter(event => event.type === 'picked-up' || event.type === 'put-down')).toMatchObject([{ type: 'picked-up', node: 'shelf', items: ['p1'] }, { type: 'put-down', node: 'desk', items: ['p1'] }]);
  });

  it('stacks carried items and fills the lowest free level of a spot', () => {
    const twice: BehaviorStep = { ...pickStep, pickUp: 5 };
    const runner = createBehaviorRunner({ graph, slots, agents: [picker([twice, packStep])], items: [{ id: 'p1', at: onShelf(-.5) }, { id: 'p2', at: onShelf(0) }, { id: 'p3', at: onShelf(.5) }] });
    runner.advance(4);
    // Capacity 2 limits a count pick-up.
    expect(runner.getAgent('a')?.carrying).toEqual(['p1', 'p2']);
    expect(runner.getItems().get('p2')).toMatchObject({ holder: 'a', offset: [0, .4, 0] });
    runner.advance(60);
    expect(runner.getItems().get('p1')).toMatchObject({ node: 'desk', offset: [0, 0, 0] });
    expect(runner.getItems().get('p2')).toMatchObject({ node: 'desk', offset: [0, .4, 0] });
    // The host ships the bottom parcel; the next put-down fills that level again.
    runner.removeItem('p1');
    runner.assign('a', [{ ...pickStep, pickUp: ['p3'] }, packStep]);
    runner.advance(60);
    expect(runner.getItems().get('p3')).toMatchObject({ node: 'desk', anchor: 'output', offset: [0, 0, 0] });
  });

  it('puts items on the floor ahead of the slot without a putOn spot', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [picker([pickStep, { kind: 'interact', node: 'desk', seconds: 1, putDown: ['p1'] }])], items: [{ id: 'p1', at: onShelf(0) }] });
    runner.advance(60);
    const work = slots.find(slot => slot.id === 'desk:work')!, at = runner.getItems().get('p1');
    expect(at && 'position' in at && at.position[2]).toBeCloseTo(work.position[2] + Math.cos(work.yaw) * .45);
  });

  it('blocks with a reason instead of taking items it cannot have', () => {
    const run = (steps: readonly BehaviorStep[], extra: Partial<BehaviorAgent> = {}) => {
      const runner = createBehaviorRunner({ graph, slots, agents: [picker(steps, extra), { id: 'b', agent: 'person', start: 'aisle', carry, steps: [] }], items: [{ id: 'p1', at: onShelf(0) }, { id: 'p2', at: onShelf(.5) }] });
      return runner;
    };
    let runner = run([{ ...pickStep, pickUp: ['nope'] }]); runner.advance(10);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'blocked', violations: [{ code: 'unknown-item' }] });
    expect(runner.getReservations().size).toBe(0);
    runner = run([{ ...pickStep, pickUp: ['p1', 'p2'] }], { carry: { ...carry, capacity: 1 } }); runner.advance(10);
    expect(runner.getAgent('a')?.violations?.[0].code).toBe('carry-full');
    expect(runner.getItems().get('p1')).toMatchObject({ node: 'shelf' });
    runner = run([{ ...packStep, putDown: ['p1'] }]); runner.advance(30);
    expect(runner.getAgent('a')?.violations?.[0].code).toBe('not-carrying');
    runner = run([{ ...pickStep, pickUp: ['p1'] }]);
    runner.assign('b', [{ kind: 'interact', node: 'shelf', slot: 'pick-1', seconds: 1, pickUp: ['p1'] }]);
    runner.advance(10);
    expect(runner.getAgent('b')?.carrying).toEqual(['p1']);
    expect(runner.getAgent('a')?.violations?.[0].code).toBe('item-unavailable');
  });

  it('lets the host move or remove carried items, and skips the exchange after an interrupt', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [picker([pickStep, packStep])], items: [{ id: 'p1', at: onShelf(0) }] });
    runner.advance(4);
    runner.placeItem('p1', { position: [1, 0, 1], yaw: 1 });
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    expect(runner.getItems().get('p1')).toEqual({ position: [1, 0, 1], yaw: 1 });
    runner.placeItem('p1', onShelf(0));
    runner.assign('a', [pickStep]);
    for (let i = 0; i < 400 && runner.getAgent('a')?.phase !== 'interacting'; i++) runner.advance(.05);
    expect(runner.getAgent('a')?.phase).toBe('interacting');
    // A host command ends the interaction early, so nothing changes hands.
    runner.assign('a', [{ kind: 'wait', seconds: 1 }]); runner.advance(5);
    expect(runner.getItems().get('p1')).toMatchObject({ node: 'shelf' });
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    runner.placeItem('p1', { position: [1, 0, 1], yaw: 1 });
    runner.assign('a', [{ ...pickStep, pickUp: ['p1'] }]); runner.advance(10);
    expect(runner.getAgent('a')?.carrying).toEqual(['p1']);
    runner.removeItem('p1');
    expect(runner.getAgent('a')?.carrying).toBeUndefined();
    expect(runner.getItems().size).toBe(0);
  });

  it('runs host item rules at the event time, independent of tick size', () => {
    const run = (ticks: readonly number[]) => {
      let next = 2;
      const runner = createBehaviorRunner({ graph, slots, agents: [picker([pickStep, packStep], { loop: true })], items: [{ id: 'p1', at: onShelf(0) }],
        // Restock the shelf the moment a parcel is picked; the next pick finds it.
        onItemEvent: (event, items) => { if (event.type === 'picked-up') { expect(items.time).toBe(event.time); items.placeItem(`p${next++}`, onShelf(0)); } } });
      const events: BehaviorEvent[] = []; runner.subscribeEvents(event => events.push(event));
      for (const dt of ticks) runner.advance(dt);
      return events.filter(event => event.type === 'picked-up').map(event => [event.time.toFixed(9), ...(event.type === 'picked-up' ? event.items : [])]);
    };
    const coarse = run([90]);
    expect(coarse.length).toBeGreaterThan(2);
    expect(run(Array.from({ length: 1800 }, () => .05))).toEqual(coarse);
  });

  it('keeps the example parcel flow bounded: picked at the shelf, packed on the bench, shipped by the host', async () => {
    const { createShift, itemNodes, PACKED_ON_BENCH } = await import('../apps/site/examples/motion-data');
    const runner = createShift(), events: BehaviorEvent[] = []; runner.subscribeEvents(event => events.push(event));
    for (let i = 0; i < 3000; i++) {
      runner.advance(.05);
      const items = [...runner.getItems().values()];
      expect(items.filter(at => 'node' in at && at.node === 'shelf-unit').length).toBeLessThanOrEqual(3);
      expect(items.filter(at => 'node' in at && at.node === 'packing-desk').length).toBeLessThanOrEqual(PACKED_ON_BENCH);
      for (const agent of runner.getAgents()) expect(agent.phase).not.toBe('blocked');
    }
    expect(events.filter(event => event.type === 'put-down').length).toBeGreaterThan(3);
    expect(runner.getAgents().some(agent => agent.carrying?.length) || events.some(event => event.type === 'picked-up')).toBe(true);
    const store = createSceneStore({ schemaVersion: 1, nodes: [...runner.getAgents().map(agent => ({ id: agent.id, kind: 'asset' as const, asset: 'worker', variant: agent.pose })), ...itemNodes(runner.getItems())] });
    expect(store.getSnapshot().nodes.length).toBe(4 + runner.getItems().size);
    store.dispose(); runner.dispose();
  });

  it('validates carry rules, item placements and item steps', () => {
    const make = (agent: Partial<BehaviorAgent>, items: { id: string; at: never }[] = []) => () => createBehaviorRunner({ graph, slots, agents: [picker([], agent)], items });
    expect(make({ carry: undefined, steps: [pickStep] })).toThrow('requires a carry rule');
    expect(make({ carry: { anchor: '' } })).toThrow('anchor');
    expect(make({ carry: { anchor: 'carry', capacity: 0 } })).toThrow('capacity');
    expect(make({ steps: [{ ...pickStep, pickUp: 0 }] })).toThrow('pickUp');
    expect(make({}, [{ id: 'x', at: { position: [Number.NaN, 0, 0] } as never }])).toThrow('finite position');
    expect(make({}, [{ id: 'x', at: { position: [0, 0, 0] } as never }, { id: 'x', at: { position: [0, 0, 0] } as never }])).toThrow('Duplicate item');
  });

  it('maps placements onto attached or free asset nodes the scene store accepts', () => {
    const base = { asset: 'parcel', scale: [.4, .4, .4] as const };
    const held = itemNode('p1', { holder: 'a', anchor: 'carry', offset: [0, .4, 0] }, base);
    expect(held).toMatchObject({ attachment: { nodeId: 'a', anchor: 'carry' }, position: [0, .4, 0] });
    expect(itemNode('p2', { node: 'desk', offset: [0, 1.2, 0] }, base).attachment).toEqual({ nodeId: 'desk' });
    expect(itemNode('p3', { position: [1, 0, 2], yaw: .5 }, base)).toMatchObject({ position: [1, 0, 2], rotation: [0, .5, 0] });
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'a', kind: 'asset', asset: 'worker', variant: 'holding' }, held] });
    expect(store.getSnapshot().nodes).toHaveLength(2);
    store.dispose();
  });

  it('gives the worker a holding pose with a carry anchor and no built-in box', () => {
    const meshes = (object: THREE.Object3D) => { let count = 0; object.traverse(child => { if (child instanceof THREE.Mesh) count++; }); return count; };
    const holding = basicAssets.worker({ id: 'w', kind: 'asset', asset: 'worker', variant: 'holding' }), carrying = basicAssets.worker({ id: 'c', kind: 'asset', asset: 'worker', variant: 'carrying' });
    expect(holding.getObjectByName('anchor-carry')).toBeDefined();
    expect(meshes(carrying) - meshes(holding)).toBe(2);
    expect(holding.getObjectByName('worker-right-arm')!.rotation.x).toBe(carrying.getObjectByName('worker-right-arm')!.rotation.x);
    expect(basicAssets['pallet-jack']({ id: 'j', kind: 'asset', asset: 'pallet-jack' }).getObjectByName('anchor-load')).toBeDefined();
    disposeObject(holding); disposeObject(carrying);
  });
});

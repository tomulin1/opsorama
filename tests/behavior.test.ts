import { describe, expect, it, vi } from 'vitest';
import { behaviorNode, createBehaviorRunner, createNavGraph, createSceneStore, resolveSceneSlots, sampleRoute, slotNavPoints, type AssetNode, type BehaviorAgent } from '@opsorama/core';
import { assetInteractionSlots } from '@opsorama/renderer-three';

const objects: AssetNode[] = [
  { id: 'shelf', kind: 'asset', asset: 'shelf', position: [0, 0, -2] },
  { id: 'desk', kind: 'asset', asset: 'station', position: [6, 0, -2] },
];
const slots = resolveSceneSlots(objects, assetInteractionSlots);
const graph = createNavGraph({
  points: [
    { id: 'aisle-0', position: [0, 0, 0] }, { id: 'aisle-1', position: [6, 0, 0] }, { id: 'queue-1', position: [6, 0, 1] }, { id: 'queue-2', position: [6, 0, 2] },
    { id: 'dock', position: [0, 0, 6] }, { id: 'island', position: [20, 0, 20] },
    ...slotNavPoints(slots),
  ],
  edges: [
    { from: 'aisle-0', to: 'shelf:pick-0', lane: 'walkway' }, { from: 'aisle-0', to: 'shelf:pick-1', lane: 'walkway' },
    { from: 'aisle-0', to: 'aisle-1', lane: 'walkway' }, { from: 'aisle-1', to: 'desk:work', lane: 'walkway' },
    { from: 'aisle-1', to: 'queue-1', lane: 'walkway' }, { from: 'queue-1', to: 'queue-2', lane: 'walkway' },
    { from: 'aisle-0', to: 'dock', lane: 'yard', allow: ['vehicle'] },
  ],
  agents: { person: { speed: 1 }, vehicle: { speed: 2 } },
});
const packStep = { kind: 'interact', node: 'desk', group: 'work', seconds: 4, queue: ['queue-1', 'queue-2'] } as const;

describe('behavior runner', () => {
  it('walks to a slot, takes its pose and heading, then releases it', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [{ id: 'a', agent: 'person', start: 'aisle-0', steps: [{ kind: 'interact', node: 'desk', seconds: 3 }, { kind: 'wait', seconds: 2 }] }] });
    const work = slots.find(slot => slot.id === 'desk:work')!;
    let agent = runner.getAgent('a')!;
    expect(agent).toMatchObject({ phase: 'moving', pose: 'walking', slot: 'desk:work', at: 'aisle-0' });
    expect(agent.route?.points.at(-1)).toEqual(work.position);
    expect(agent.route?.endYaw).toBeCloseTo(work.yaw);
    const travel = 6 + Math.hypot(work.approach[2]) + Math.abs(work.approach[2] - work.position[2]);
    runner.advance(travel - .01); expect(runner.getAgent('a')!.phase).toBe('moving');
    runner.advance(.02); agent = runner.getAgent('a')!;
    expect(agent).toMatchObject({ phase: 'interacting', pose: 'working', at: 'desk:work', position: work.position });
    expect(runner.getReservations().get('desk:work')).toBe('a');
    runner.advance(3);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'waiting', pose: 'idle' });
    expect(runner.getReservations().size).toBe(0);
    runner.advance(2);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'idle', step: 2 });
  });

  it('gives one agent per slot and queues the rest first come, first served', () => {
    const agents: BehaviorAgent[] = ['a', 'b', 'c'].map(id => ({ id, agent: 'person', start: 'aisle-1', steps: [packStep] }));
    const runner = createBehaviorRunner({ graph, slots, agents });
    const phase = () => Object.fromEntries(runner.getAgents().map(agent => [agent.id, `${agent.phase}${agent.queuePlace ?? ''}`]));
    expect(phase()).toEqual({ a: 'moving', b: 'queued1', c: 'queued2' });
    expect(runner.getAgent('b')).toMatchObject({ at: 'queue-1' }); expect(runner.getAgent('c')).toMatchObject({ at: 'queue-2' });
    runner.advance(2);
    expect(phase()).toEqual({ a: 'interacting', b: 'queued1', c: 'queued2' });
    runner.advance(4);
    // a finishes; b (first in line) gets the desk and c moves up to the front queue point.
    expect(phase()).toEqual({ a: 'idle', b: 'moving', c: 'queued1' });
    expect(runner.getAgent('c')).toMatchObject({ at: 'queue-1' });
    expect(runner.getReservations().get('desk:work')).toBe('b');
  });

  it('fills grouped slots before queueing', () => {
    const agents: BehaviorAgent[] = ['a', 'b', 'c'].map(id => ({ id, agent: 'person', start: 'aisle-0', steps: [{ kind: 'interact', node: 'shelf', group: 'pick', seconds: 5 }] }));
    const runner = createBehaviorRunner({ graph, slots, agents });
    expect(runner.getAgents().map(agent => agent.slot ?? agent.phase)).toEqual(['shelf:pick-0', 'shelf:pick-1', 'queued']);
  });

  it('produces the same states regardless of tick size and seeds random durations', () => {
    const make = (seed: number) => createBehaviorRunner({ graph, slots, seed, agents: ['a', 'b', 'c'].map(id => ({ id, agent: 'person', start: 'aisle-0', loop: true, steps: [{ kind: 'interact', node: 'shelf', group: 'pick', seconds: [1, 4] }, { ...packStep, seconds: [2, 3] }] })) });
    const coarse = make(7), fine = make(7), other = make(8);
    coarse.advance(60); for (let i = 0; i < 600; i++) fine.advance(.1); other.advance(60);
    const strip = (runner: ReturnType<typeof make>) => runner.getAgents().map(({ id, phase, at, slot, step, queuePlace, routeStart }) => ({ id, phase, at, slot, step, queuePlace, routeStart }));
    expect(strip(fine)).toEqual(strip(coarse));
    expect(strip(other)).not.toEqual(strip(coarse));
    expect(fine.time).toBeCloseTo(60);
  });

  it('keeps agents within movement rules and reports why they stop', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [
      { id: 'walker', agent: 'person', start: 'aisle-0', steps: [{ kind: 'move', to: 'dock' }] },
      { id: 'jack', agent: 'vehicle', start: 'aisle-0', steps: [{ kind: 'move', to: 'dock' }, { kind: 'interact', node: 'desk', seconds: 1 }] },
    ] });
    expect(runner.getAgent('walker')).toMatchObject({ phase: 'blocked', violations: [{ code: 'no-route' }] });
    runner.advance(10);
    expect(runner.getAgent('jack')).toMatchObject({ phase: 'blocked', at: 'dock', violations: [{ code: 'agent-not-allowed' }] });
  });

  it('lets the host interrupt an agent, releasing its slot to the queue', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: ['a', 'b'].map(id => ({ id, agent: 'person', start: 'aisle-1', steps: [packStep] })) });
    runner.advance(3);
    expect(runner.getAgent('a')!.phase).toBe('interacting');
    runner.assign('a', [{ kind: 'move', to: 'aisle-0' }]);
    expect(runner.getReservations().get('desk:work')).toBe('b');
    const a = runner.getAgent('a')!;
    // The new route leaves the desk position, steps back to the slot approach and follows the walkway.
    expect(a.route?.points[0]).toEqual(slots.find(slot => slot.id === 'desk:work')!.position);
    expect(sampleRoute(a.route!, Infinity).position).toEqual([0, 0, 0]);
  });

  it('notifies subscribers with stable snapshots and maps states to nodes', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [{ id: 'a', agent: 'person', start: 'aisle-0', steps: [{ kind: 'wait', seconds: 1 }] }] });
    const listener = vi.fn(), unsubscribe = runner.subscribe(listener), first = runner.getAgents();
    runner.advance(.5); expect(listener).not.toHaveBeenCalled(); expect(runner.getAgents()).toBe(first);
    runner.advance(1); expect(listener).toHaveBeenCalledTimes(1); expect(Object.isFrozen(runner.getAgents()[0])).toBe(true);
    unsubscribe();
    const node = behaviorNode(runner.getAgent('a')!, { asset: 'worker', label: 'A' });
    expect(node).toMatchObject({ id: 'a', kind: 'asset', asset: 'worker', variant: 'idle', position: [0, 0, 0] });
    expect(createSceneStore({ schemaVersion: 1, nodes: [node] }).getSnapshot().nodes).toHaveLength(1);
    runner.dispose(); expect(() => runner.advance(1)).toThrow('disposed');
  });

  it('rejects invalid agents and zero-time loops', () => {
    const base: BehaviorAgent = { id: 'a', agent: 'person', start: 'aisle-0', steps: [] };
    expect(() => createBehaviorRunner({ graph, slots, agents: [{ ...base, start: 'nowhere' }] })).toThrow('unknown start point');
    expect(() => createBehaviorRunner({ graph, slots, agents: [{ ...base, agent: 'robot' }] })).toThrow('no speed rule');
    expect(() => createBehaviorRunner({ graph, slots, agents: [base, base] })).toThrow('Duplicate');
    expect(() => createBehaviorRunner({ graph, slots, agents: [{ ...base, steps: [{ kind: 'interact', node: 'missing', seconds: 1 }] }] })).toThrow('no matching interaction slot');
    expect(() => createBehaviorRunner({ graph, slots, agents: [{ ...base, steps: [{ kind: 'wait', seconds: [3, 1] }] }] })).toThrow('invalid wait');
    const unconnected = createNavGraph({ points: [{ id: 'aisle-0', position: [0, 0, 0] }], edges: [], agents: { person: { speed: 1 } } });
    expect(() => createBehaviorRunner({ graph: unconnected, slots, agents: [{ ...base, steps: [{ kind: 'interact', node: 'desk', seconds: 1 }] }] })).toThrow('not connected');
    const spin = createBehaviorRunner({ graph, slots, agents: [{ ...base, loop: true, steps: [{ kind: 'move', to: 'aisle-0' }] }] });
    spin.advance(1);
    expect(spin.getAgent('a')).toMatchObject({ phase: 'blocked' });
  });
});

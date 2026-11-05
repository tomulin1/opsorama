import { describe, expect, it } from 'vitest';
import { createBehaviorRunner, createNavGraph, createRouteFollower, resolveSceneSlots, slotNavPoints, type AssetNode, type BehaviorEvent, type BehaviorRunner, type NavGraphDefinition, type NodeRoute, type Vec3 } from '@opsorama/core';
import { assetInteractionSlots, assetMotionProfiles } from '@opsorama/objects';

// Regression tests for the movement review of October 27, 2026 (ADR 0053).

function collect(runner: BehaviorRunner) { const events: BehaviorEvent[] = []; runner.subscribeEvents(event => events.push(event)); return events; }
const near = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-6;

/**
 * Follow one agent's routes the way the renderer does: assign each new route
 * from the follower's own position, then advance by the frame time. Returns the
 * first time the visual position reaches `point` and stays there.
 */
function visualArrival(runner: BehaviorRunner, id: string, point: Vec3, seconds: number, dt: number) {
  const follower = createRouteFollower();
  let route: NodeRoute | undefined, position = runner.getAgent(id)!.position, arrived: number | undefined;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const agent = runner.getAgent(id)!;
    if (agent.route !== route) { route = agent.route; if (route) follower.assign(route, position); }
    position = follower.advance(dt)?.position ?? agent.position;
    runner.advance(dt);
    if (near(position, point)) arrived ??= runner.time; else arrived = undefined;
  }
  return arrived;
}

/** A 10 m corridor s–m–e with a spur from e to d; m and e hold one person. */
const corridor = (person = { speed: 1 }): NavGraphDefinition => ({
  points: [{ id: 's', position: [0, 0, 0] }, { id: 'm', position: [5, 0, 0], capacity: 1 }, { id: 'e', position: [10, 0, 0], capacity: 1 }, { id: 'd', position: [10, 0, 4] }],
  edges: [{ from: 's', to: 'm' }, { from: 'm', to: 'e' }, { from: 'e', to: 'd' }],
  agents: { person },
});

describe('host commands that interrupt travel (B1)', () => {
  it('reports arrival when the agent visually arrives, after finishing its current segment', () => {
    const graph = createNavGraph(corridor()), events: BehaviorEvent[] = [];
    const runner = createBehaviorRunner({ graph, agents: [{ id: 'a', agent: 'person', start: 's', steps: [{ kind: 'move', to: 'e' }] }] });
    runner.subscribeEvents(event => events.push(event));
    let arrivedVisually: number | undefined;
    const follower = createRouteFollower();
    let route: NodeRoute | undefined, position: Vec3 = [0, 0, 0];
    for (let i = 0; i < 2000; i++) {
      // A 10 m walk to e, interrupted at 2 s by a command to go to d beyond e.
      if (i === 200) runner.command('a', { goTo: 'd' });
      const agent = runner.getAgent('a')!;
      if (agent.route !== route) { route = agent.route; if (route) follower.assign(route, position); }
      position = follower.advance(.01)?.position ?? agent.position;
      runner.advance(.01);
      if (near(position, [10, 0, 4])) arrivedVisually ??= runner.time;
    }
    const arrival = events.find(event => event.type === 'arrived' && event.point === 'd')!;
    // 2 m walked, 8 m to e and 4 m to d at 1 m/s.
    expect(arrival.time).toBeCloseTo(14, 6);
    expect(Math.abs(arrivedVisually! - arrival.time)).toBeLessThanOrEqual(.011);
  });

  it('starts the replacement where the agent is and holds the points it actually passes', () => {
    const runner = createBehaviorRunner({ graph: createNavGraph(corridor()), agents: [{ id: 'a', agent: 'person', start: 's', steps: [{ kind: 'move', to: 'e' }] }] });
    runner.advance(2);
    runner.command('a', { goTo: 'd' });
    const agent = runner.getAgent('a')!;
    expect(agent.route?.points).toEqual([[2, 0, 0], [5, 0, 0], [10, 0, 0], [10, 0, 4]]);
    expect(agent.routeStart).toBe(2);
    // m from now until reaching e (10 s), e from leaving m (5 s) until reaching d (14 s).
    expect(runner.getHolds()).toEqual([{ agent: 'a', point: 'm', from: 2, to: 10 }, { agent: 'a', point: 'e', from: 5, to: 14 }]);
  });

  it('keeps simulation and visual arrival in step with a motion profile and a turn back', () => {
    const graph = createNavGraph(corridor(assetMotionProfiles.worker));
    for (const at of [1.3, 3.1, 4.6]) {
      const runner = createBehaviorRunner({ graph, agents: [{ id: 'a', agent: 'person', start: 's', steps: [{ kind: 'move', to: 'd' }] }] }), events = collect(runner);
      let commanded = false;
      const follower = createRouteFollower();
      let route: NodeRoute | undefined, position: Vec3 = [0, 0, 0], visual: number | undefined;
      for (let i = 0; i < 3000; i++) {
        if (!commanded && runner.time >= at - 1e-9) { runner.command('a', { goTo: 's' }); commanded = true; }
        const agent = runner.getAgent('a')!;
        if (agent.route !== route) { route = agent.route; if (route) follower.assign(route, position); }
        position = follower.advance(.01)?.position ?? agent.position;
        runner.advance(.01);
        if (commanded && near(position, [0, 0, 0])) visual ??= runner.time;
      }
      const arrival = events.find(event => event.type === 'arrived' && event.point === 's')!;
      // The agent first reaches m, then turns back.
      expect(arrival.time).toBeGreaterThan(at + 1);
      expect(Math.abs(visual! - arrival.time)).toBeLessThanOrEqual(.011);
    }
  });

  it('gives the same events for an interrupted agent at any tick size', () => {
    const graph = createNavGraph(corridor(assetMotionProfiles.worker));
    const record = (ticks: number) => {
      const runner = createBehaviorRunner({ graph, agents: [{ id: 'a', agent: 'person', start: 's', steps: [{ kind: 'move', to: 'd' }] }] }), events = collect(runner);
      for (let i = 0; i < ticks; i++) runner.advance(2.5 / ticks);
      runner.command('a', { goTo: 's' });
      for (let i = 0; i < ticks; i++) runner.advance(20 / ticks);
      return events.map(event => ({ ...event, time: event.time.toFixed(6) }));
    };
    expect(record(250)).toEqual(record(1));
  });

  it('finishes the current segment and waits at the next point when the new steps do not travel', () => {
    const runner = createBehaviorRunner({ graph: createNavGraph(corridor()), agents: [{ id: 'a', agent: 'person', start: 's', steps: [{ kind: 'move', to: 'e' }] }] }), events = collect(runner);
    runner.advance(2);
    runner.assign('a', [{ kind: 'wait', seconds: 1 }, { kind: 'move', to: 'd' }]);
    expect(runner.getAgent('a')).toMatchObject({ at: 'm', position: [5, 0, 0], route: { points: [[2, 0, 0], [5, 0, 0]] } });
    expect(runner.getHolds()).toEqual([{ agent: 'a', point: 'm', from: 2, to: Infinity }]);
    // The wait starts at m (5 s), so the walk to d starts at 6 s.
    expect(visualArrival(runner, 'a', [10, 0, 4], 20, .01)).toBeCloseTo(15, 1);
    expect(events.find(event => event.type === 'arrived' && event.point === 'd')?.time).toBeCloseTo(15, 6);
  });
});

const objects: AssetNode[] = [
  { id: 'shelf', kind: 'asset', asset: 'shelf', position: [0, 0, -2] },
  { id: 'desk', kind: 'asset', asset: 'station', position: [6, 0, -2] },
];
const slots = resolveSceneSlots(objects, assetInteractionSlots);
const floor = (extra: Partial<NavGraphDefinition> = {}) => createNavGraph({
  points: [
    { id: 'aisle-0', position: [0, 0, 0] }, { id: 'aisle-1', position: [6, 0, 0] }, { id: 'queue-1', position: [6, 0, 1] }, { id: 'queue-2', position: [6, 0, 2] }, { id: 'yard', position: [6, 0, 6] },
    ...slotNavPoints(slots),
  ],
  edges: [
    { from: 'aisle-0', to: 'shelf:pick-0' }, { from: 'aisle-0', to: 'shelf:pick-1' }, { from: 'aisle-0', to: 'aisle-1' }, { from: 'aisle-1', to: 'desk:work' },
    { from: 'aisle-1', to: 'queue-1' }, { from: 'queue-1', to: 'queue-2' }, { from: 'queue-2', to: 'yard', allow: ['vehicle'] },
  ],
  agents: { person: { speed: 1 }, vehicle: { speed: 2 } },
  ...extra,
});

describe('slot queues', () => {
  it('lets a newcomer take a free slot that no waiting agent can use (B2)', () => {
    const runner = createBehaviorRunner({ graph: floor(), slots, agents: [
      { id: 'a', agent: 'person', start: 'aisle-0', steps: [{ kind: 'interact', node: 'shelf', slot: 'pick-0', seconds: 100 }] },
      { id: 'b', agent: 'person', start: 'aisle-0', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'interact', node: 'shelf', slot: 'pick-0', seconds: 1 }] },
      { id: 'c', agent: 'person', start: 'aisle-0', steps: [{ kind: 'wait', seconds: 2 }, { kind: 'interact', node: 'shelf', seconds: 1 }] },
    ] });
    runner.advance(2);
    // b waits for pick-0 only; pick-1 is free, so c takes it instead of queueing behind b.
    expect(runner.getAgent('b')).toMatchObject({ phase: 'queued', queuePlace: 1 });
    expect(runner.getAgent('c')).toMatchObject({ slot: 'shelf:pick-1' });
    expect(runner.getAgent('c')!.queuePlace).toBeUndefined();
  });

  it('still keeps a newcomer behind an earlier agent that could use the free slot', () => {
    const runner = createBehaviorRunner({ graph: floor(), slots, agents: [
      { id: 'a', agent: 'person', start: 'aisle-1', steps: [{ kind: 'interact', node: 'desk', seconds: 10, queue: ['queue-1', 'queue-2'] }] },
      { id: 'b', agent: 'person', start: 'aisle-1', steps: [{ kind: 'interact', node: 'desk', seconds: 10, queue: ['queue-1', 'queue-2'] }] },
    ] });
    runner.advance(1);
    expect(runner.getAgent('b')).toMatchObject({ phase: 'queued', queuePlace: 1 });
  });

  it('counts queue places per object and queue points, whatever the slot query (B3)', () => {
    const queue = ['queue-1', 'queue-2'];
    const runner = createBehaviorRunner({ graph: floor(), slots, agents: [
      { id: 'a', agent: 'person', start: 'aisle-1', steps: [{ kind: 'interact', node: 'desk', seconds: 30, queue }] },
      { id: 'b', agent: 'person', start: 'aisle-1', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'interact', node: 'desk', group: 'work', seconds: 1, queue }] },
      { id: 'c', agent: 'person', start: 'aisle-1', steps: [{ kind: 'wait', seconds: 2 }, { kind: 'interact', node: 'desk', slot: 'work', seconds: 1, queue }] },
    ] });
    const events = collect(runner);
    runner.advance(10);
    expect(['b', 'c'].map(id => [runner.getAgent(id)!.queuePlace, runner.getAgent(id)!.at])).toEqual([[1, 'queue-1'], [2, 'queue-2']]);
    expect(events.filter(event => event.type === 'queued').map(event => event.type === 'queued' && [event.agent, event.place])).toEqual([['b', 1], ['c', 2]]);
  });

  it('blocks an agent that cannot reach its queue point and moves the others up (B5)', () => {
    const runner = createBehaviorRunner({ graph: floor(), slots, agents: [
      { id: 'a', agent: 'person', start: 'aisle-1', steps: [{ kind: 'interact', node: 'desk', seconds: 30 }] },
      // The vehicle's queue point is reachable, but not for people: the yard lane allows vehicles only.
      { id: 'b', agent: 'person', start: 'aisle-1', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'interact', node: 'desk', seconds: 1, queue: ['yard', 'queue-2'] }] },
      { id: 'c', agent: 'person', start: 'aisle-1', steps: [{ kind: 'wait', seconds: 2 }, { kind: 'interact', node: 'desk', seconds: 1, queue: ['yard', 'queue-2'] }] },
    ] });
    const events = collect(runner);
    runner.advance(3);
    expect(runner.getAgent('b')).toMatchObject({ phase: 'blocked', violations: [{ code: 'no-route', to: 'yard' }] });
    expect(runner.getAgent('b')!.queuePlace).toBeUndefined();
    expect(events.filter(event => event.type === 'blocked').map(event => event.agent)).toEqual(['b', 'c']);
    // c is first in line now, but cannot reach the yard either.
    expect(runner.getAgent('c')).toMatchObject({ phase: 'blocked' });
    runner.advance(40);
    expect(runner.getReservations().size).toBe(0);
  });
});

/** Two one-person places `x` and `y`, a side pocket `z` beside `x`, `w` beyond `y` and a vehicle-only `dock`. */
const pocket = createNavGraph({
  points: [{ id: 'x', position: [0, 0, 0], capacity: 1 }, { id: 'y', position: [4, 0, 0], capacity: 1 }, { id: 'z', position: [0, 0, 2] }, { id: 'w', position: [8, 0, 0] }, { id: 'dock', position: [8, 0, 4] }],
  edges: [{ from: 'x', to: 'y', capacity: 1 }, { from: 'x', to: 'z' }, { from: 'y', to: 'w' }, { from: 'w', to: 'dock', allow: ['vehicle'] }],
  agents: { person: { speed: 1 }, vehicle: { speed: 2 } },
});

describe('stalled waits', () => {
  it('reports a wait behind an agent that has finished, and clears it once that agent moves', () => {
    const runner = createBehaviorRunner({ graph: pocket, agents: [
      { id: 'a', agent: 'person', start: 'z', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'y' }] },
      { id: 'b', agent: 'person', start: 'x', steps: [] },
    ] });
    const events = collect(runner);
    runner.advance(5);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'yielding', stalled: ['b'] });
    expect(runner.getAgent('a')!.deadlock).toBeUndefined();
    runner.advance(10);
    expect(events.filter(event => event.type === 'stalled')).toEqual([{ type: 'stalled', agent: 'a', time: .5, step: 1, agents: ['b'] }]);
    runner.command('b', { goTo: 'w' });
    expect(runner.getAgent('a')!.stalled).toBeUndefined();
    runner.advance(20);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'idle', at: 'y' });
  });

  it('reports a wait behind a blocked agent, also for agents that wait behind the waiting one', () => {
    const runner = createBehaviorRunner({ graph: pocket, agents: [
      { id: 'a', agent: 'person', start: 'y', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'z' }] },
      // b may not enter the vehicle-only dock, so it blocks on x.
      { id: 'b', agent: 'person', start: 'x', steps: [{ kind: 'move', to: 'dock' }] },
      { id: 'c', agent: 'person', start: 'w', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'move', to: 'z' }] },
    ] });
    runner.advance(2);
    expect(runner.getAgent('b')!.phase).toBe('blocked');
    expect(runner.getAgents().map(agent => [agent.id, agent.phase, agent.stalled])).toEqual([['a', 'yielding', ['b']], ['b', 'blocked', undefined], ['c', 'yielding', ['b']]]);
  });

  it('does not report a wait for an agent that will move on by itself', () => {
    const runner = createBehaviorRunner({ graph: pocket, agents: [
      { id: 'a', agent: 'person', start: 'z', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'y' }] },
      { id: 'b', agent: 'person', start: 'x', steps: [{ kind: 'wait', seconds: 30 }, { kind: 'move', to: 'w' }] },
    ] });
    const events = collect(runner);
    runner.advance(5);
    expect(runner.getAgent('a')!.stalled).toBeUndefined();
    runner.advance(50);
    expect(events.some(event => event.type === 'stalled')).toBe(false);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'idle', at: 'y' });
  });
});

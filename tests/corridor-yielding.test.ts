import { describe, expect, it } from 'vitest';
import { createBehaviorRunner, createNavGraph, createRouteFollower, resolveSceneSlots, routeTimes, slotNavPoints, type AssetNode, type BehaviorAgent, type BehaviorEvent, type BehaviorRunner, type NavGraphDefinition, type NodeRoute, type Vec3 } from '@opsorama/core';
import { assetInteractionSlots, assetMotionProfiles } from '@opsorama/renderer-three';

const flat = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2]);

/**
 * Advance a runner in ticks and follow each agent's route the way the renderer
 * does (assign, then advance by the frame time), recording visual positions.
 */
function trace(runner: BehaviorRunner, seconds: number, dt = .01, beforeTick?: (tick: number) => void) {
  const followers = new Map(runner.getAgents().map(agent => [agent.id, { follower: createRouteFollower(), route: undefined as NodeRoute | undefined, position: agent.position }]));
  const frames: { time: number; positions: Map<string, Vec3> }[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    beforeTick?.(i); runner.advance(dt);
    for (const agent of runner.getAgents()) {
      const entry = followers.get(agent.id)!;
      if (agent.route !== entry.route) { entry.route = agent.route; if (agent.route) entry.follower.assign(agent.route, entry.position); }
      entry.position = entry.follower.advance(dt)?.position ?? agent.position;
    }
    frames.push({ time: runner.time, positions: new Map([...followers].map(([id, entry]) => [id, entry.position])) });
  }
  return frames;
}
function collect(runner: BehaviorRunner) { const events: BehaviorEvent[] = []; runner.subscribeEvents(event => events.push(event)); return events; }

/** A 6 m single-file corridor between `a` and `b`, with open junctions at both ends. */
const corridor = (options: { capacity?: number; ends?: number } = {}): NavGraphDefinition => ({
  points: [
    { id: 'west', position: [0, 0, 0] }, { id: 'sw', position: [0, 0, -3] }, { id: 'east', position: [10, 0, 0] }, { id: 'ne', position: [10, 0, 3] },
    { id: 'a', position: [2, 0, 0], ...(options.ends ? { capacity: options.ends } : {}) }, { id: 'b', position: [8, 0, 0], ...(options.ends ? { capacity: options.ends } : {}) },
  ],
  edges: [
    { from: 'west', to: 'a' }, { from: 'sw', to: 'a' }, { from: 'b', to: 'east' }, { from: 'b', to: 'ne' },
    { from: 'a', to: 'b', ...(options.capacity ? { capacity: options.capacity } : {}) },
  ],
  agents: { person: assetMotionProfiles.worker },
});
const crossing = (definition: NavGraphDefinition) => createBehaviorRunner({ graph: createNavGraph(definition), agents: [
  { id: 'a', agent: 'person', start: 'west', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'east' }] },
  { id: 'b', agent: 'person', start: 'ne', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'sw' }] },
] });
/** Agents strictly inside the corridor, away from its junctions. */
const inCorridor = (positions: ReadonlyMap<string, Vec3>) => [...positions].filter(([, p]) => Math.abs(p[2]) < 1e-6 && p[0] > 2.05 && p[0] < 7.95).map(([id]) => id);

describe('capacity rules', () => {
  it('validates capacities and exposes edges, capacities and route penalties', () => {
    expect(() => createNavGraph({ ...corridor(), points: [{ id: 'p', position: [0, 0, 0], capacity: 0 }], edges: [] })).toThrow('capacity');
    expect(() => createNavGraph({ ...corridor(), edges: [{ from: 'a', to: 'b', capacity: 1.5 }] })).toThrow('capacity');
    expect(() => createNavGraph({ ...corridor(), lanes: { aisle: { capacity: -1 } } })).toThrow('capacity');
    const graph = createNavGraph({ ...corridor({ capacity: 1, ends: 2 }), edges: [...corridor({ capacity: 1 }).edges, { from: 'west', to: 'sw', lane: 'aisle' }], lanes: { aisle: { capacity: 3 } } });
    // Both directions share one edge object, so a corridor counts traffic either way.
    expect(graph.edge('a', 'b')).toBe(graph.edge('b', 'a'));
    expect(graph.edge('west', 'east')).toBeUndefined();
    expect([graph.capacity('a'), graph.capacity('west'), graph.capacity('b', 'a'), graph.capacity('sw', 'west'), graph.capacity('west', 'a'), graph.capacity('nowhere')]).toEqual([2, Infinity, 1, 3, Infinity, Infinity]);
    // Penalties steer the plan; Infinity forbids a move; negative values are rejected.
    const detour = graph.plan({ agent: 'person', from: 'west', to: 'a', penalty: (from, to) => from === 'west' && to === 'a' ? 10 : 0 });
    expect(detour.ok && detour.route.points).toEqual(['west', 'sw', 'a']);
    expect(graph.plan({ agent: 'person', from: 'a', to: 'east', penalty: (_, to) => to === 'b' ? Infinity : 0 })).toMatchObject({ ok: false, violations: [{ code: 'no-route' }] });
    expect(() => graph.plan({ agent: 'person', from: 'west', to: 'b', penalty: () => -1 })).toThrow('non-negative');
  });

  it('reports when a route reaches and leaves each point', () => {
    const route: NodeRoute = { points: [[0, 0, 0], [0, 0, 2], [2, 0, 2]], speed: 1, stops: [{ index: 1, seconds: 3 }] };
    expect(routeTimes(route)).toEqual([{ arrive: 0, depart: 0 }, { arrive: 2, depart: 5 }, { arrive: 7, depart: 7 }]);
    // Profiles include acceleration and turns in place.
    const turning = routeTimes({ ...route, stops: undefined, profile: { turnRate: Math.PI / 2 }, endYaw: Math.PI });
    expect(turning[1].arrive).toBeCloseTo(2); expect(turning[1].depart).toBeCloseTo(3); expect(turning[2].arrive).toBeCloseTo(5); expect(turning[2].depart).toBeCloseTo(6);
  });
});

describe('corridor yielding', () => {
  it('never lets two agents share a single-capacity corridor while crossing it', () => {
    const runner = crossing(corridor({ capacity: 1 })), events = collect(runner);
    const frames = trace(runner, 30);
    expect(frames.every(frame => inCorridor(frame.positions).length <= 1)).toBe(true);
    // Both crossed: each was inside the corridor at some point and arrived.
    expect(new Set(frames.flatMap(frame => inCorridor(frame.positions)))).toEqual(new Set(['a', 'b']));
    expect(runner.getAgents().map(({ id, phase, at }) => ({ id, phase, at }))).toEqual([{ id: 'a', phase: 'idle', at: 'east' }, { id: 'b', phase: 'idle', at: 'sw' }]);
    // `a` planned first (agent-ID order at the same time); `b` waited where it stood.
    const yielding = events.find(event => event.type === 'yielding');
    expect(yielding).toMatchObject({ agent: 'b', time: .5, point: 'ne', agents: ['a'] });
    expect(yielding?.type === 'yielding' && yielding.seconds).toBeGreaterThan(2);

    // Without the capacity the same agents meet head-on inside the corridor.
    expect(trace(crossing(corridor()), 30).some(frame => inCorridor(frame.positions).length === 2)).toBe(true);
  });

  it('keeps the corridor mouths clear when its end points have a capacity too', () => {
    const frames = trace(crossing(corridor({ capacity: 1, ends: 1 })), 40);
    const closest = Math.min(...frames.map(frame => flat(frame.positions.get('a')!, frame.positions.get('b')!)));
    expect(closest).toBeGreaterThan(1);
    expect(flat(frames[frames.length - 1].positions.get('b')!, [0, 0, -3])).toBeLessThan(1e-6);
  });

  it('lets agents through first come, first served, even when a later one is closer', () => {
    const graph = createNavGraph({
      points: [...corridor().points, { id: 'far', position: [-6, 0, 0] }, { id: 'near', position: [1, 0, 1] }, { id: 'east-2', position: [10, 0, -1] }, { id: 'east-3', position: [10, 0, -2] }],
      edges: [...corridor({ capacity: 1 }).edges, { from: 'far', to: 'west' }, { from: 'near', to: 'a' }, { from: 'b', to: 'east-2' }, { from: 'b', to: 'east-3' }],
      agents: { person: { speed: 1.2 } },
    });
    const agents: BehaviorAgent[] = [
      { id: 'first', agent: 'person', start: 'west', steps: [{ kind: 'move', to: 'east' }] },
      { id: 'second', agent: 'person', start: 'far', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'east-2' }] },
      { id: 'third', agent: 'person', start: 'near', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'move', to: 'east-3' }] },
    ];
    const runner = createBehaviorRunner({ graph, agents }), events = collect(runner);
    const frames = trace(runner, 60);
    const entered = (id: string) => frames.find(frame => inCorridor(frame.positions).includes(id))!.time;
    expect(entered('first')).toBeLessThan(entered('second'));
    expect(entered('second')).toBeLessThan(entered('third'));
    expect(frames.every(frame => inCorridor(frame.positions).length <= 1)).toBe(true);
    expect(events.filter(event => event.type === 'yielding').map(event => event.agent)).toEqual(['third']);
    expect(runner.getAgents().every(agent => agent.phase === 'idle')).toBe(true);
  });

  it('retries open-ended waits in request order once the way clears', () => {
    // `gate` holds one agent; `holder` stands in it, so the others cannot know when it will be free.
    const graph = createNavGraph({
      points: [{ id: 'left', position: [0, 0, 0] }, { id: 'gate', position: [2, 0, 0], capacity: 1 }, { id: 'right', position: [4, 0, 0] }, { id: 'far', position: [10, 0, 0] }, { id: 'near', position: [5, 0, 1] }, { id: 'out', position: [4, 0, -2] }],
      edges: [{ from: 'left', to: 'gate' }, { from: 'gate', to: 'right' }, { from: 'right', to: 'far' }, { from: 'right', to: 'near' }, { from: 'right', to: 'out' }],
      agents: { person: { speed: 1 } },
    });
    const runner = createBehaviorRunner({ graph, agents: [
      { id: 'holder', agent: 'person', start: 'right', steps: [{ kind: 'move', to: 'gate' }, { kind: 'wait', seconds: 6 }, { kind: 'move', to: 'left' }] },
      { id: 'b', agent: 'person', start: 'far', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'move', to: 'out', via: ['left'] }] },
      { id: 'c', agent: 'person', start: 'near', steps: [{ kind: 'wait', seconds: 2 }, { kind: 'move', to: 'out', via: ['left'] }] },
    ] });
    const events = collect(runner);
    runner.advance(3);
    expect(runner.getAgents().map(agent => agent.phase)).toEqual(['waiting', 'yielding', 'yielding']);
    expect(events.filter(event => event.type === 'yielding')).toEqual([
      { type: 'yielding', agent: 'b', time: 1, step: 1, point: 'far', agents: ['holder'] },
      { type: 'yielding', agent: 'c', time: 2, step: 1, point: 'near', agents: ['holder'] },
    ]);
    const frames = trace(runner, 40);
    const through = (id: string) => frames.find(frame => flat(frame.positions.get(id)!, [2, 0, 0]) < .05)!.time;
    // `c` is nearer but asked later, so `b` goes through the gate first.
    expect(through('b')).toBeLessThan(through('c'));
    // When `holder` sets off after its wait (t = 8), `b` (farther away) leaves at once; `c` now knows how long to wait.
    const timed = events.filter(event => event.type === 'yielding' && event.seconds !== undefined);
    expect(timed).toEqual([expect.objectContaining({ agent: 'c', time: 8, point: 'near', agents: ['b', 'holder'] })]);
    expect(runner.getAgents().map(agent => [agent.phase, agent.at])).toEqual([['idle', 'left'], ['idle', 'out'], ['idle', 'out']]);
  });

  it('weighs waiting against a detour around the busy corridor', () => {
    const run = (bypass: number) => {
      const graph = createNavGraph({
        points: [...corridor().points, { id: 'by-a', position: [2, 0, bypass] }, { id: 'by-b', position: [8, 0, bypass] }],
        edges: [...corridor({ capacity: 1 }).edges, { from: 'a', to: 'by-a' }, { from: 'by-a', to: 'by-b' }, { from: 'by-b', to: 'b' }],
        agents: { person: { speed: 1 } },
      });
      const runner = createBehaviorRunner({ graph, agents: [
        { id: 'a', agent: 'person', start: 'west', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'east' }] },
        { id: 'b', agent: 'person', start: 'east', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'west' }] },
      ] });
      const events = collect(runner);
      runner.advance(.6);
      return { route: runner.getAgent('b')!.route, phase: runner.getAgent('b')!.phase, events: () => events, runner };
    };
    // Waiting costs 6 s (until `a` leaves the corridor); a 4 m longer bypass takes 4 s more, so `b` detours at once.
    const quick = run(2);
    expect(quick.phase).toBe('moving');
    expect(quick.route?.points).toContainEqual([8, 0, 2]);
    // A 12 m longer bypass is slower than waiting, so `b` waits for the corridor.
    const slow = run(6);
    expect(slow.phase).toBe('yielding');
    slow.runner.advance(30);
    const yielding = slow.events().find(event => event.type === 'yielding');
    expect(yielding).toMatchObject({ agent: 'b', point: 'east', agents: ['a'] });
    expect(yielding?.type === 'yielding' && yielding.seconds).toBeCloseTo(6);
    expect(slow.runner.getAgent('b')).toMatchObject({ phase: 'idle', at: 'west' });
  });

  it('hands a slot over only after the previous user has walked out of its approach', () => {
    const desk: AssetNode = { id: 'desk', kind: 'asset', asset: 'station', position: [0, 0, -2] };
    const slots = resolveSceneSlots([desk], assetInteractionSlots), work = slots.find(slot => slot.id === 'desk:work')!, [x, y, z] = work.approach;
    const graph = createNavGraph({
      points: [...slotNavPoints(slots).map(point => ({ ...point, capacity: 1 })), { id: 'aisle', position: [x - 2, y, z] }, { id: 'queue-1', position: [x + 2, y, z], capacity: 1 }, { id: 'queue-2', position: [x + 3, y, z], capacity: 1 }],
      edges: [{ from: 'aisle', to: 'desk:work' }, { from: 'queue-1', to: 'desk:work' }, { from: 'queue-1', to: 'queue-2' }],
      agents: { person: { speed: 1 } },
    });
    const pack = { kind: 'interact', node: 'desk', seconds: 3, queue: ['queue-1', 'queue-2'] } as const;
    const runner = createBehaviorRunner({ graph, slots, agents: [
      { id: 'a', agent: 'person', start: 'aisle', steps: [pack, { kind: 'move', to: 'aisle' }] },
      { id: 'b', agent: 'person', start: 'queue-2', steps: [pack] },
    ] });
    const events = collect(runner);
    expect(runner.getAgent('b')).toMatchObject({ phase: 'queued', queuePlace: 1 });
    const frames = trace(runner, 30);
    // While `a` walks out, `b` waits at its queue place, then steps in.
    const handover = events.find(event => event.type === 'yielding');
    expect(handover).toMatchObject({ agent: 'b', point: 'queue-1', agents: ['a'] });
    expect(Math.min(...frames.map(frame => flat(frame.positions.get('a')!, frame.positions.get('b')!)))).toBeGreaterThan(1);
    expect(runner.getAgent('b')).toMatchObject({ phase: 'idle', at: 'desk:work', slot: undefined });
  });

  it('produces the same events and states regardless of tick size', async () => {
    const { createShift } = await import('../apps/site/examples/motion-data');
    const record = (ticks: readonly number[]) => {
      const runner = createShift(), events = collect(runner);
      for (const dt of ticks) runner.advance(dt);
      return { events: events.map(event => ({ ...event, time: event.time.toFixed(9) })), agents: runner.getAgents().map(({ id, phase, at, step, slot, queuePlace, position, yaw }) => ({ id, phase, at, step, slot, queuePlace, position, yaw })) };
    };
    const coarse = record([120]), fine = record(Array.from({ length: 2400 }, () => .05));
    let seed = 5;
    const irregular = record(Array.from({ length: 900 }, (_, i) => { seed = seed * 16807 % 2147483647; return i === 899 ? 0 : seed / 2147483647 * .2; }));
    expect(fine).toEqual(coarse);
    // Irregular ticks reach a different end time, so compare the events they share.
    expect(irregular.events).toEqual(coarse.events.slice(0, irregular.events.length));
    expect(coarse.events.some(event => event.type === 'yielding')).toBe(true);
  });
});

describe('motion example traffic', () => {
  it('keeps people apart on spurs and in the packing queue', async () => {
    const { breakSteps, createShift, motionGraph } = await import('../apps/site/examples/motion-data');
    expect(motionGraph.capacity('walk-pack', 'packing-desk:work')).toBe(1);
    expect(motionGraph.capacity('packing-desk:work')).toBe(1);
    const runner = createShift(), events = collect(runner);
    const frames = trace(runner, 400, .02, tick => { if (tick === 10_000) runner.assign('alex', breakSteps); });
    // Close encounters only happen where both people are in an open area: the wide main walkway (z = -1.6 ± 0.45),
    // or the lounge in front of the bench, whose seat approaches have no capacity by design (seats in a row).
    const onWalkway = (position: Vec3) => Math.abs(position[2] + 1.6) <= .45;
    const inLounge = (position: Vec3) => Math.abs(position[2] - .4) <= .45 && position[0] >= 1.35 && position[0] <= 4.35;
    for (const { positions } of frames) {
      const list = [...positions.values()];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (flat(list[i], list[j]) < .45) expect(onWalkway(list[i]) && onWalkway(list[j]) || inLounge(list[i]) && inLounge(list[j])).toBe(true);
    }
    // Nobody stalls: pickers keep packing and nobody is blocked.
    for (const id of ['blake', 'casey']) expect(events.filter(event => event.agent === id && event.type === 'interaction-started' && event.time > 200).length).toBeGreaterThan(4);
    expect(events.some(event => event.type === 'blocked')).toBe(false);
    // Each wait is reported once per instant, even when an open-ended wait resolves at once.
    const yields = events.filter(event => event.type === 'yielding');
    expect(yields.length).toBeGreaterThan(10);
    expect(new Set(yields.map(event => `${event.agent}@${event.time}`)).size).toBe(yields.length);
    expect(runner.getAgent('alex')).toMatchObject({ phase: 'idle', at: 'lounge-rest' });
  });
});

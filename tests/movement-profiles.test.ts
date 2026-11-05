import { describe, expect, it } from 'vitest';
import { commandSteps, createBehaviorRunner, createNavGraph, createRouteFollower, createSceneStore, resolveSceneSlots, routeDuration, sampleRoute, slotNavPoints, toNodeRoute, type AssetNode, type BehaviorEvent, type NodeRoute, type Vec3 } from '@opsorama/core';
import { assetInteractionSlots, assetMotionProfiles, catalogAssets } from '@opsorama/objects';

const straight: NodeRoute = { points: [[0, 0, 0], [0, 0, 4]], speed: 1, profile: { acceleration: 1 } };
const corner: Vec3[] = [[0, 0, 0], [0, 0, 2], [2, 0, 2]];
const gap = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** Largest distance covered in one `dt` step; a jump would exceed the route's top speed. */
function largestStep(route: NodeRoute, dt = .01) {
  let previous = sampleRoute(route, 0).position, largest = 0;
  for (let t = dt; t <= routeDuration(route) + dt; t += dt) { const next = sampleRoute(route, t).position; largest = Math.max(largest, gap(previous, next)); previous = next; }
  return largest;
}

describe('motion profiles', () => {
  it('accelerates from rest, cruises and brakes to a stop', () => {
    // 0.5 m to reach 1 m/s, 3 m cruising, 0.5 m braking.
    expect(routeDuration(straight)).toBeCloseTo(5);
    expect(sampleRoute(straight, .5)).toMatchObject({ moving: true, speed: .5 });
    expect(sampleRoute(straight, .5).position[2]).toBeCloseTo(.125);
    expect(sampleRoute(straight, 2.5).speed).toBe(1);
    expect(sampleRoute(straight, 4.5).position[2]).toBeCloseTo(4 - .125);
    expect(sampleRoute(straight, 5)).toMatchObject({ position: [0, 0, 4], done: true, speed: 0 });
    // Too short to reach full speed: accelerate to the midpoint, then brake.
    expect(routeDuration({ ...straight, points: [[0, 0, 0], [0, 0, 1]], speed: 10 })).toBeCloseTo(2);
    // Without a profile the timing is unchanged.
    expect(routeDuration({ points: straight.points, speed: 1 })).toBe(4);
  });

  it('stops and turns in place at sharp corners', () => {
    const route: NodeRoute = { points: corner, speed: 1, profile: { turnRate: Math.PI / 2 } };
    // 2 m, a 90° turn at 90°/s, 2 m.
    expect(routeDuration(route)).toBeCloseTo(5);
    const turning = sampleRoute(route, 2.5);
    expect(turning).toMatchObject({ position: [0, 0, 2], moving: false, turning: true, point: 1, speed: 0 });
    expect(turning.yaw).toBeCloseTo(Math.PI / 4);
    expect(sampleRoute(route, 3.5)).toMatchObject({ moving: true, yaw: Math.PI / 2 });
    // Shallow corners below the threshold are taken while moving.
    expect(routeDuration({ ...route, profile: { turnRate: Math.PI / 2, turnInPlaceAngle: Math.PI } })).toBeCloseTo(4);
  });

  it('turns before leaving, before a stop heading and toward the end heading', () => {
    const profile = { turnRate: Math.PI };
    expect(routeDuration({ points: straight.points, speed: 1, profile, startYaw: Math.PI })).toBeCloseTo(5);
    expect(sampleRoute({ points: straight.points, speed: 1, profile, startYaw: Math.PI }, .5)).toMatchObject({ turning: true, point: 0 });
    expect(routeDuration({ points: straight.points, speed: 1, profile, endYaw: Math.PI / 2 })).toBeCloseTo(4.5);
    expect(sampleRoute({ points: straight.points, speed: 1, profile, endYaw: Math.PI / 2 }, Infinity).yaw).toBeCloseTo(Math.PI / 2);
    const stopped: NodeRoute = { points: corner, speed: 1, profile, stops: [{ index: 1, seconds: 1, yaw: Math.PI }] };
    // Arrive facing +z, turn 180° to the stop heading, stop, turn 90° to leave along +x.
    expect(routeDuration(stopped)).toBeCloseTo(2 + 1 + 1 + .5 + 2);
    expect(sampleRoute(stopped, 3.5)).toMatchObject({ stop: 1, yaw: Math.PI });
  });

  it('slows down for corners taken while moving, without position jumps', () => {
    const route: NodeRoute = { points: corner, speed: 2, profile: { acceleration: 2, cornerSpeed: .5 } };
    const atCorner = [...Array(400).keys()].map(i => sampleRoute(route, i / 100)).filter(sample => sample.moving).reduce((best, sample) => gap(sample.position, corner[1]) < gap(best.position, corner[1]) ? sample : best);
    expect(atCorner.speed).toBeLessThan(.6);
    expect(largestStep(route)).toBeLessThanOrEqual(2 * .01 + 1e-9);
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [{ id: 'v', kind: 'asset', asset: 'forklift', route: { ...route, profile: { cornerSpeed: 1 } } }] })).toThrow('requires an acceleration');
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [{ id: 'v', kind: 'asset', asset: 'forklift', route: { ...route, profile: { acceleration: 0 } } }] })).toThrow('acceleration');
  });

  it('keeps loops continuous across the seam', () => {
    const loop: NodeRoute = { points: [[0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4], [0, 0, 0]], speed: 2, loop: true, profile: { acceleration: 1, cornerSpeed: .8 } };
    const duration = routeDuration(loop);
    expect(Number.isFinite(duration)).toBe(true);
    expect(sampleRoute(loop, duration - 1e-6).speed).toBeCloseTo(sampleRoute(loop, 0).speed, 4);
    expect(largestStep(loop)).toBeLessThanOrEqual(2 * .01 + 1e-9);
  });

  it('copies agent profiles from the graph into planned and node routes', () => {
    const graph = createNavGraph({ points: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [0, 0, 4] }], edges: [{ from: 'a', to: 'b' }], agents: { person: assetMotionProfiles.worker } });
    const plan = graph.plan({ agent: 'person', from: 'a', to: 'b' });
    if (!plan.ok) throw new Error('expected a route');
    expect(plan.route.profile).toEqual({ acceleration: 2.5, turnRate: 7, turnInPlaceAngle: Math.PI / 4, cornerSpeed: .8 });
    const route = toNodeRoute(plan.route, { startYaw: Math.PI });
    expect(route).toMatchObject({ profile: plan.route.profile, startYaw: Math.PI });
    expect(routeDuration(route)).toBeGreaterThan(plan.route.duration);
    expect(() => createNavGraph({ points: [], edges: [], agents: { person: { speed: 1, turnRate: -1 } } })).toThrow('Agent person turn rate');
  });

  it('joins a replacement at the current speed and heading', () => {
    const graph = createNavGraph({ points: [{ id: 'p0', position: [0, 0, 0] }, { id: 'p1', position: [0, 0, 6] }, { id: 'spur', position: [3, 0, 6] }], edges: [{ from: 'p0', to: 'p1' }, { from: 'p1', to: 'spur' }], agents: { vehicle: { speed: 2, acceleration: 1 } } });
    const plan = (from: string, to: string) => { const result = graph.plan({ agent: 'vehicle', from, to }); if (!result.ok) throw new Error('expected a route'); return toNodeRoute(result.route); };
    const follower = createRouteFollower();
    follower.assign(plan('p0', 'p1'), [0, 0, 0]);
    const cruising = follower.advance(2.5)!;
    expect(cruising.speed).toBe(2);
    follower.assign(plan('p1', 'spur'), cruising.position);
    expect(follower.route).toMatchObject({ startSpeed: 2, profile: { acceleration: 1 } });
    expect(follower.route?.startYaw).toBeCloseTo(cruising.yaw);
    expect(follower.advance(.01)!.speed).toBeCloseTo(2, 1);
  });

  it('declares valid profiles for registered mobile models', () => {
    for (const [asset, rule] of Object.entries(assetMotionProfiles)) {
      expect(catalogAssets[asset], asset).toBeDefined();
      expect(() => createNavGraph({ points: [], edges: [], agents: { [asset]: rule } })).not.toThrow();
    }
  });
});

const objects: AssetNode[] = [{ id: 'shelf', kind: 'asset', asset: 'shelf', position: [0, 0, -2] }, { id: 'bench', kind: 'asset', asset: 'bench', position: [8, 0, 3] }];
const slots = resolveSceneSlots(objects, assetInteractionSlots);
const pick = (name: string) => slots.find(slot => slot.id === `shelf:${name}`)!;
const graph = createNavGraph({
  points: [
    { id: 'left', position: [pick('pick-0').approach[0], 0, 0] }, { id: 'right', position: [pick('pick-1').approach[0], 0, 0] },
    { id: 'east', position: [8, 0, 0] }, { id: 'north', position: [8, 0, -4] }, { id: 'yard', position: [0, 0, 8] },
    ...slotNavPoints(slots),
  ],
  edges: [
    { from: 'left', to: 'right' }, { from: 'left', to: 'shelf:pick-0' }, { from: 'right', to: 'shelf:pick-1' }, { from: 'right', to: 'east' },
    { from: 'east', to: 'north' }, { from: 'east', to: 'bench:seat-0' }, { from: 'east', to: 'bench:seat-1' },
    { from: 'left', to: 'yard', allow: ['vehicle'] },
  ],
  agents: { person: assetMotionProfiles.worker, vehicle: { speed: 2 } },
});

describe('goal-based behaviors', () => {
  it('reports planning costs to every reachable point', () => {
    const costs = graph.reach('person', 'left');
    expect(costs.get('left')).toBe(0);
    expect(costs.has('yard')).toBe(false);
    expect(graph.reach('vehicle', 'left').has('yard')).toBe(true);
    expect(graph.reach('nobody', 'left').size).toBe(0);
  });

  it('resolves world positions and objects to the nearest reachable point', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [
      { id: 'a', agent: 'person', start: 'left', steps: [{ kind: 'move', to: { position: [7.5, 0, -3.5] } }] },
      // The yard is closer, but people may not go there.
      { id: 'b', agent: 'person', start: 'left', steps: [{ kind: 'move', to: { position: [0, 0, 7] } }] },
      { id: 'c', agent: 'person', start: 'right', steps: [{ kind: 'move', to: { node: 'bench' } }] },
    ] });
    runner.advance(60);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'idle', at: 'north' });
    expect(runner.getAgent('b')?.at).not.toBe('yard');
    expect(runner.getAgent('c')).toMatchObject({ at: 'bench:seat-0' });
    expect(runner.getReservations().size).toBe(0);
    expect(() => createBehaviorRunner({ graph, slots, agents: [{ id: 'x', agent: 'person', start: 'left', steps: [{ kind: 'move', to: { node: 'missing' } }] }] })).toThrow('no matching interaction slot');
    expect(() => createBehaviorRunner({ graph, slots, agents: [{ id: 'x', agent: 'person', start: 'left', steps: [{ kind: 'move', to: { position: [Number.NaN, 0, 0] } }] }] })).toThrow('finite');
  });

  it('takes the nearest free slot and routes interactions through via points', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [
      { id: 'a', agent: 'person', start: 'right', steps: [{ kind: 'interact', node: 'shelf', group: 'pick', seconds: 2 }] },
      { id: 'b', agent: 'person', start: 'east', steps: [{ kind: 'interact', node: 'bench', group: 'seat', seconds: 2, via: ['north'] }] },
    ] });
    expect(runner.getAgent('a')?.slot).toBe('shelf:pick-1');
    expect(runner.getAgent('b')?.route?.points.some(point => point[2] === -4)).toBe(true);
  });

  it('keeps the simulation in step with the profiled visual route', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [{ id: 'a', agent: 'person', start: 'left', yaw: Math.PI, steps: [{ kind: 'move', to: 'east' }] }] });
    const route = runner.getAgent('a')!.route!;
    expect(route).toMatchObject({ profile: { turnRate: 7 }, startYaw: Math.PI });
    runner.advance(routeDuration(route) - .01); expect(runner.getAgent('a')!.phase).toBe('moving');
    runner.advance(.02); expect(runner.getAgent('a')).toMatchObject({ phase: 'idle', at: 'east' });
  });

  it('accepts goals as commands and reports typed events in time order', () => {
    const runner = createBehaviorRunner({ graph, slots, agents: [
      { id: 'a', agent: 'person', start: 'east', steps: [{ kind: 'wait', seconds: 100 }] },
      { id: 'b', agent: 'person', start: 'east', steps: [{ kind: 'interact', node: 'bench', slot: 'seat-0', seconds: 50 }] },
    ] });
    const events: BehaviorEvent[] = [];
    runner.subscribeEvents(event => events.push(event));
    runner.command('a', { interact: { node: 'bench', slot: 'seat-0', seconds: 3 }, label: 'Break', then: [{ kind: 'move', to: { position: [8, 0, -4] } }] });
    expect(events.map(event => event.type)).toEqual(['step-started', 'queued']);
    runner.advance(100);
    const types = events.filter(event => event.agent === 'a').map(event => event.type);
    expect(types).toEqual(['step-started', 'queued', 'interaction-started', 'interaction-ended', 'step-started', 'arrived', 'finished']);
    expect(events.filter(event => event.agent === 'b').map(event => event.type)).toEqual(['interaction-started', 'interaction-ended', 'finished']);
    const times = events.map(event => event.time);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(events.find(event => event.type === 'arrived')).toMatchObject({ point: 'north', step: 1 });

    runner.command('a', { goTo: 'east' });
    runner.command('b', { interact: { node: 'bench', slot: 'seat-0', seconds: 10 } });
    runner.advance(5);
    runner.command('b', { goTo: 'north' });
    expect(events.at(-2)).toMatchObject({ type: 'interaction-ended', agent: 'b', interrupted: true });
    expect(() => commandSteps({})).toThrow('goTo, interact or both');
    expect(commandSteps({ goTo: 'east', via: ['north'], interact: { node: 'bench', seconds: 1 } })).toEqual([{ kind: 'move', to: 'east', via: ['north'] }, { kind: 'interact', node: 'bench', seconds: 1 }]);
    runner.dispose();
  });
});

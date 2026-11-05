import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNavGraph, createRouteFollower, createSceneStore, routeDuration, sampleRoute, toNodeRoute, type NavGraphDefinition, type NodeRoute } from '@opsorama/core';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { pickSlots, warehouseNavigation } from '../src/features/ecommerce/scene';
import { createEcommerceSimulation } from '../src/features/ecommerce/simulation';

// A square floor: the diagonal forklift lane is the shortest way from A to C, but people may not use it.
const floor: NavGraphDefinition = {
  points: [
    { id: 'a', position: [0, 0, 0] }, { id: 'b', position: [4, 0, 0] }, { id: 'c', position: [4, 0, 4] }, { id: 'd', position: [0, 0, 4] },
  ],
  edges: [
    { from: 'a', to: 'b', lane: 'walkway' }, { from: 'b', to: 'c', lane: 'walkway', speedLimit: .5 },
    { from: 'a', to: 'd', lane: 'walkway' }, { from: 'd', to: 'c', lane: 'walkway', oneWay: true },
    { from: 'a', to: 'c', lane: 'forklift' },
  ],
  lanes: { walkway: { allow: ['person'] }, forklift: { allow: ['vehicle'] } },
  agents: { person: { speed: 1 }, vehicle: { speed: 2 } },
};

describe('movement graph rules', () => {
  it('plans the cheapest permitted route for each agent kind', () => {
    const graph = createNavGraph(floor);
    const vehicle = graph.plan({ agent: 'vehicle', from: 'a', to: 'c' });
    expect(vehicle.ok && vehicle.route.points).toEqual(['a', 'c']);
    const person = graph.plan({ agent: 'person', from: 'a', to: 'c' });
    expect(person.ok).toBe(true);
    if (!person.ok) return;
    expect(person.route.points).toHaveLength(3);
    expect(person.route.steps.every(step => step.lane === 'walkway')).toBe(true);
    expect(person.route.length).toBeCloseTo(8);
  });

  it('respects one-way edges, lane avoidance and via points', () => {
    const graph = createNavGraph(floor);
    const back = graph.plan({ agent: 'person', from: 'c', to: 'd' });
    expect(back.ok && back.route.points).toEqual(['c', 'b', 'a', 'd']);
    const via = graph.plan({ agent: 'person', from: 'a', via: ['d'], to: 'b' });
    expect(via.ok && via.route.points.slice(0, 2)).toEqual(['a', 'd']);
    expect(via.ok && via.route.waypoints).toEqual([0, 1, 3]);
    const blocked = graph.plan({ agent: 'vehicle', from: 'a', to: 'b' });
    expect(blocked).toMatchObject({ ok: false, violations: [{ code: 'no-route' }] });
    const avoided = graph.plan({ agent: 'person', from: 'a', to: 'c', avoidLanes: ['walkway'] });
    expect(avoided.ok).toBe(false);
  });

  it('applies the slowest of agent, edge and lane speeds', () => {
    const graph = createNavGraph(floor);
    const plan = graph.plan({ agent: 'person', from: 'a', to: 'c' });
    if (!plan.ok) throw new Error('expected a route');
    // Equal-cost alternatives exist; whichever is chosen must respect the 0.5 m/s limit on b → c.
    for (const step of plan.route.steps) expect(step.speed).toBe(step.from === 'b' && step.to === 'c' ? .5 : 1);
    const route = toNodeRoute(plan.route);
    expect(routeDuration(route)).toBeCloseTo(plan.route.duration);
    const loop = graph.plan({ agent: 'person', from: 'a', via: ['a'], to: 'b' });
    if (!loop.ok) throw new Error('expected a route');
    expect(() => toNodeRoute(loop.route, { stops: [{ waypoint: 0, seconds: 1 }, { waypoint: 1, seconds: 1 }] })).toThrow('share route point');
    expect(() => toNodeRoute(plan.route, { stops: [{ waypoint: 5, seconds: 1 }] })).toThrow('Unknown route waypoint');
  });

  it('reports violations for explicit host routes', () => {
    const graph = createNavGraph(floor);
    expect(graph.check('person', ['a', 'b', 'c'])).toEqual([]);
    expect(graph.check('person', ['a', 'c'])).toMatchObject([{ code: 'agent-not-allowed', from: 'a', to: 'c' }]);
    expect(graph.check('person', ['c', 'd'])).toMatchObject([{ code: 'wrong-direction' }]);
    expect(graph.check('person', ['b', 'd'])).toMatchObject([{ code: 'missing-edge' }]);
    expect(graph.check('robot', ['a', 'zz'])).toMatchObject([{ code: 'unknown-agent' }, { code: 'unknown-point', from: 'zz' }]);
    expect(graph.plan({ agent: 'person', from: 'a', to: 'zz' })).toMatchObject({ ok: false, violations: [{ code: 'unknown-point' }] });
  });

  it('rejects invalid graph definitions', () => {
    expect(() => createNavGraph({ ...floor, points: [...floor.points, floor.points[0]] })).toThrow('Duplicate navigation point');
    expect(() => createNavGraph({ ...floor, edges: [{ from: 'a', to: 'missing' }] })).toThrow('unknown point');
    expect(() => createNavGraph({ ...floor, edges: [{ from: 'a', to: 'a' }] })).toThrow('two different points');
    expect(() => createNavGraph({ ...floor, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a', oneWay: true }] })).toThrow('Duplicate navigation edge direction');
    expect(() => createNavGraph({ ...floor, agents: { person: { speed: 0 } } })).toThrow('speed');
    expect(() => createNavGraph({ ...floor, edges: [{ from: 'a', to: 'b', cost: -1 }] })).toThrow('positive cost');
  });
});

const line: NodeRoute = { points: [[0, 0, 0], [2, 0, 0], [2, 0, 2]], speed: 1 };

describe('route sampling', () => {
  it('samples position, heading and completion deterministically', () => {
    expect(sampleRoute(line, 1)).toMatchObject({ position: [1, 0, 0], moving: true, done: false, segment: 0 });
    expect(sampleRoute(line, 1).yaw).toBeCloseTo(Math.PI / 2);
    expect(sampleRoute(line, 3)).toMatchObject({ position: [2, 0, 1], segment: 1, yaw: 0 });
    expect(sampleRoute(line, 10)).toMatchObject({ position: [2, 0, 2], moving: false, done: true });
    expect(sampleRoute({ ...line, endYaw: 1 }, 10).yaw).toBe(1);
    expect(sampleRoute(line, Infinity)).toMatchObject({ position: [2, 0, 2], done: true });
    expect(sampleRoute({ points: [[0, 0, 0], [1, 0, 0], [0, 0, 0]], speed: 1, loop: true }, Infinity).position).toEqual([0, 0, 0]);
  });

  it('pauses at timed stops with an optional heading', () => {
    const route: NodeRoute = { ...line, stops: [{ index: 1, seconds: 3, yaw: Math.PI }] };
    expect(routeDuration(route)).toBe(7);
    expect(sampleRoute(route, 3.5)).toMatchObject({ position: [2, 0, 0], moving: false, stop: 1, yaw: Math.PI });
    expect(sampleRoute(route, 6)).toMatchObject({ position: [2, 0, 1], moving: true });
  });

  it('loops closed routes and uses per-segment speeds', () => {
    const loop: NodeRoute = { points: [[0, 0, 0], [2, 0, 0], [0, 0, 0]], speed: 1, segmentSpeeds: [2, 1], loop: true };
    expect(routeDuration(loop)).toBe(3);
    expect(sampleRoute(loop, .5).position).toEqual([1, 0, 0]);
    expect(sampleRoute(loop, 3.5).position).toEqual([1, 0, 0]);
    expect(sampleRoute(loop, 100).done).toBe(false);
  });

  it('validates routes through the scene store and freezes them', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'w', kind: 'asset', asset: 'worker', route: line }] });
    const node = store.getSnapshot().nodes[0];
    expect(node.kind === 'asset' && Object.isFrozen(node.route?.points[0])).toBe(true);
    const bad = (route: unknown) => () => store.upsert({ id: 'w', kind: 'asset', asset: 'worker', route: route as NodeRoute });
    expect(bad({ points: [[0, 0, 0]], speed: 1 })).toThrow('2–');
    expect(bad({ ...line, speed: 0 })).toThrow('speed');
    expect(bad({ ...line, segmentSpeeds: [1] })).toThrow('segment speeds');
    expect(bad({ ...line, loop: true })).toThrow('end at its first point');
    expect(bad({ ...line, stops: [{ index: 3, seconds: 1 }] })).toThrow('unique point index');
    expect(bad({ ...line, stops: [{ index: 1, seconds: 0 }] })).toThrow('duration');
    expect(() => store.upsert({ id: 'z', kind: 'zone', size: [1, 1], route: line } as never)).toThrow('Only asset nodes');
  });
});

describe('route follower', () => {
  it('ignores duplicate assignments and keeps progress', () => {
    const follower = createRouteFollower();
    follower.assign(line, [0, 0, 0]); follower.advance(1);
    follower.assign({ ...line, points: line.points.map(point => [...point] as const) }, [1, 0, 0]);
    expect(follower.sample()?.position).toEqual([1, 0, 0]);
  });

  it('joins a replacement at the first shared upcoming point instead of cutting across the floor', () => {
    // Corridor p0–p3 along x with a spur from p1; the host plans the new route from the previous destination.
    const corridor = createNavGraph({
      points: [{ id: 'p0', position: [0, 0, 0] }, { id: 'p1', position: [2, 0, 0] }, { id: 'p2', position: [4, 0, 0] }, { id: 'p3', position: [6, 0, 0] }, { id: 'spur', position: [2, 0, 2] }],
      edges: [{ from: 'p0', to: 'p1' }, { from: 'p1', to: 'p2' }, { from: 'p2', to: 'p3' }, { from: 'p1', to: 'spur' }],
      agents: { person: { speed: 1 } },
    });
    const plan = (from: string, to: string) => { const result = corridor.plan({ agent: 'person', from, to }); if (!result.ok) throw new Error('expected a route'); return toNodeRoute(result.route, { endYaw: Math.PI }); };
    const follower = createRouteFollower();
    follower.assign(plan('p0', 'p3'), [0, 0, 0]);
    const here = follower.advance(1)!.position;
    follower.assign(plan('p3', 'spur'), here);
    expect(follower.route?.points).toEqual([[1, 0, 0], [2, 0, 0], [2, 0, 2]]);
    expect(follower.sample()?.position).toEqual([1, 0, 0]);
    expect(follower.advance(100)).toMatchObject({ position: [2, 0, 2], done: true, yaw: Math.PI });
  });

  it('bridges directly only when the routes share no point', () => {
    const follower = createRouteFollower();
    follower.assign(line, [0, 0, 0]); follower.advance(1);
    follower.assign({ points: [[0, 0, 5], [0, 0, 6]], speed: 1 }, [1, 0, 0]);
    expect(follower.sample()?.position).toEqual([1, 0, 0]);
    expect(follower.route?.points[0]).toEqual([1, 0, 0]);
    expect(follower.advance(100)).toMatchObject({ position: [0, 0, 6], done: true });
  });

  it('joins a replacement loop once, then loops without the prefix', () => {
    const follower = createRouteFollower(), loop: NodeRoute = { points: [[0, 0, 0], [2, 0, 0], [0, 0, 0]], speed: 1, loop: true };
    follower.assign(line, [0, 0, 0]);
    const here = follower.advance(.5)!.position;
    follower.assign(loop, here);
    expect(follower.route?.points).toEqual([[.5, 0, 0], [2, 0, 0], [0, 0, 0]]);
    follower.advance(3.5);
    expect(follower.route?.loop).toBe(true);
    expect(follower.sample()?.position).toEqual([0, 0, 0]);
    expect(follower.advance(5)?.position).toEqual([1, 0, 0]);
  });

  it('holds the current pose while motion is off during a join into a loop (B4)', () => {
    const follower = createRouteFollower(), loop: NodeRoute = { points: [[0, 0, 0], [2, 0, 0], [0, 0, 0]], speed: 1, loop: true };
    follower.assign(line, [0, 0, 0]);
    const here = follower.advance(.5)!.position;
    follower.assign(loop, here);
    expect(follower.settle()).toMatchObject({ position: [.5, 0, 0], moving: false });
    expect(follower.settle()).toMatchObject({ position: [.5, 0, 0] });
    // Motion on again: the join continues from the held pose and then loops.
    expect(follower.advance(1)?.position).toEqual([1.5, 0, 0]);
    follower.advance(2.5);
    expect(follower.route?.loop).toBe(true);
  });

  it('starts a route that begins at the current position without a prefix', () => {
    const follower = createRouteFollower();
    follower.assign(line, [0, 0, 0]); follower.advance(100);
    const back: NodeRoute = { points: [[2, 0, 2], [2, 0, 0]], speed: 1 };
    follower.assign(back, [2, 0, 2]);
    expect(follower.route).toBe(back);
  });

  it('settles to the confirmed end for motion-off and clears on removal', () => {
    const follower = createRouteFollower();
    follower.assign(line, [0, 0, 0]);
    expect(follower.settle()).toMatchObject({ position: [2, 0, 2], moving: false, done: true });
    follower.assign(undefined, [2, 0, 2]);
    expect(follower.route).toBeNull();
    expect(follower.advance(1)).toBeNull();
  });
});

describe('route-driven worker pose', () => {
  it('walks in place while moving and stands at stops without moving the root', () => {
    const worker = basicAssets.worker({ id: 'w', kind: 'asset', asset: 'worker', variant: 'walking' });
    const rig = worker.getObjectByName('worker-rig')!, leg = worker.getObjectByName('worker-left-leg')!;
    animateAsset(worker, { time: 1.1, delta: .016, locomotion: { moving: true } });
    expect(rig.position.z).toBe(0);
    expect(leg.rotation.x).not.toBe(0);
    animateAsset(worker, { time: 2, delta: .016, locomotion: { moving: false } });
    expect(leg.rotation.x).toBe(0);
    expect(worker.position.toArray()).toEqual([0, 0, 0]);
    disposeObject(worker);
  });
});

describe('e-commerce warehouse routes', () => {
  it('plans picker loops on the one-way pick lane only', () => {
    // Pick stops sit on the slot approaches of the pick faces.
    const pick = pickSlots.find(slot => slot.id === 'flow:F1:pick')!;
    expect(warehouseNavigation.point('flow:F1:pick')?.position).toEqual(pick.approach);
    const plan = warehouseNavigation.plan({ agent: 'picker', from: 'flow:F1:pick', via: ['shelf:S1:pick-0', 'induct'], to: 'flow:F1:pick' });
    if (!plan.ok) throw new Error('expected a route');
    expect(warehouseNavigation.check('picker', plan.route.points)).toEqual([]);
    expect(plan.route.steps.every(step => step.lane === 'pick-loop')).toBe(true);
    // Pickers may not use the reach-truck aisle, and the pick lane is one way.
    expect(warehouseNavigation.check('picker', ['aisle:R02', 'rack:R02:load-1'])).toMatchObject([{ code: 'agent-not-allowed' }]);
    expect(warehouseNavigation.check('picker', ['shelf:S1:pick-0', 'flow:F4:pick'])).toMatchObject([{ code: 'wrong-direction' }]);
  });

  it('maps the planned routes of the mock feed onto worker and vehicle nodes', () => {
    const simulation = createEcommerceSimulation('peak'), nodes = simulation.nodes();
    const moving = nodes.filter(node => node.kind === 'asset' && node.route).map(node => node.id);
    for (const id of ['forklift', 'reach-truck']) expect(moving).toContain(id);
    expect(createSceneStore({ schemaVersion: 1, nodes }).getSnapshot().nodes).toHaveLength(nodes.length);
    simulation.dispose();
  });

  it('keeps navigation and routes free of framework, browser and graphics imports', () => {
    for (const file of ['packages/core/src/navigation.ts', 'packages/core/src/route.ts']) {
      const code = readFileSync(file, 'utf8');
      expect(code).not.toMatch(/from\s+['"](?:react|vue|next|zustand|three)/);
      expect(code).not.toMatch(/\b(?:window|document|requestAnimationFrame)\b/);
    }
  });
});

describe('rule-based movement example', () => {
  it('runs a seeded shift where pickers share slots, queue at the desk and stay on permitted lanes', async () => {
    const { agentNodes, breakSteps, checkVehicleLaneProposal, createShift, motionGraph, motionSceneNodes, motionSlots, shiftOverlay } = await import('../examples/motion-data');
    const runner = createShift();
    expect(runner.getAgents().filter(agent => agent.slot?.startsWith('shelf-unit:'))).toHaveLength(2);
    let queued = false;
    for (let i = 0; i < 1200; i++) {
      runner.advance(.05);
      const agents = runner.getAgents();
      queued ||= agents.some(agent => agent.phase === 'queued' && agent.queuePlace === 1);
      // No slot is ever held by two people.
      const held = agents.flatMap(agent => agent.slot ? [agent.slot] : []);
      expect(new Set(held).size).toBe(held.length);
      for (const agent of agents) expect(agent.phase).not.toBe('blocked');
    }
    expect(queued).toBe(true);
    expect(runner.getAgent('devon')!.label).toBeDefined();
    runner.assign('alex', breakSteps);
    runner.advance(30);
    expect(runner.getAgent('alex')).toMatchObject({ phase: 'idle', at: 'lounge-rest' });
    expect(checkVehicleLaneProposal().map(violation => violation.code)).toEqual(['agent-not-allowed', 'agent-not-allowed', 'agent-not-allowed']);
    const store = createSceneStore({ schemaVersion: 1, nodes: [...motionSceneNodes, ...agentNodes(runner.getAgents())] });
    expect(store.getSnapshot().nodes).toHaveLength(motionSceneNodes.length + 4);
    expect(shiftOverlay(runner).points.length).toBeGreaterThan(motionSlots.length);
    expect(motionGraph.point('queue-1')).toBeDefined();
    store.dispose(); runner.dispose();
  });
});

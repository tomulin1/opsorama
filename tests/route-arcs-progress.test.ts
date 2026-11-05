import { describe, expect, it } from 'vitest';
import { behaviorNode, createBehaviorRunner, createNavGraph, createRouteFollower, motionProfileOf, routeDuration, routeTimes, sampleRoute, validateNodeRoute, type NodeRoute, type Vec3 } from '@opsorama/core';
import { assetMotionProfiles } from '@opsorama/objects';

const gap = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
/** Largest position and heading change between samples `dt` apart. */
function largestSteps(route: NodeRoute, seconds = routeDuration(route), dt = .01) {
  let previous = sampleRoute(route, 0), position = 0, yaw = 0;
  for (let t = dt; t <= seconds + dt; t += dt) {
    const next = sampleRoute(route, t);
    position = Math.max(position, gap(previous.position, next.position)); yaw = Math.max(yaw, Math.abs(wrap(next.yaw - previous.yaw)));
    previous = next;
  }
  return { position, yaw };
}
const corner: NodeRoute = { points: [[0, 0, 0], [0, 0, 4], [4, 0, 4]], speed: 1, profile: { cornerRadius: 1 } };

describe('rounded corners', () => {
  it('drives a tangent arc without changing the route timing', () => {
    const sharp: NodeRoute = { ...corner, profile: undefined };
    expect(routeDuration(corner)).toBe(routeDuration(sharp));
    expect(routeTimes(corner)).toEqual(routeTimes(sharp));
    // The arc starts 1 m before the corner and ends 1 m after it.
    expect(sampleRoute(corner, 2.9)).toMatchObject({ position: [0, 0, 2.9], yaw: 0, moving: true });
    const middle = sampleRoute(corner, 4);
    expect(middle.curving).toBe(true);
    expect(middle.yaw).toBeCloseTo(Math.PI / 4);
    // Half-way round a 1 m radius quarter circle: √2 − 1 m inside the corner point.
    expect(middle.position[0]).toBeCloseTo(1 - Math.SQRT1_2); expect(middle.position[2]).toBeCloseTo(3 + Math.SQRT1_2);
    expect(gap(middle.position, [0, 0, 4])).toBeCloseTo(Math.SQRT2 - 1);
    const out = sampleRoute(corner, 5.01);
    expect(out.curving).toBeUndefined(); expect(out.yaw).toBeCloseTo(Math.PI / 2); expect(out.position[2]).toBeCloseTo(4);
    expect(sampleRoute(corner, Infinity)).toMatchObject({ position: [4, 0, 4], done: true });
    // No jumps: the arc is shorter than the legs it replaces, and the heading turns smoothly.
    const steps = largestSteps(corner);
    expect(steps.position).toBeLessThanOrEqual(.01 + 1e-9);
    expect(steps.yaw).toBeLessThan(.01);
    expect(largestSteps(sharp).yaw).toBeCloseTo(Math.PI / 2);
  });

  it('shrinks the arc on short segments and keeps pivot corners sharp', () => {
    const short = sampleRoute({ points: [[0, 0, 0], [0, 0, 1], [4, 0, 1]], speed: 1, profile: { cornerRadius: 5 } }, 1);
    // At most half of the 1 m segment is used: d = 0.5, so the radius shrinks to 0.5 m.
    expect(short.curving).toBe(true);
    expect(gap(short.position, [0, 0, 1])).toBeCloseTo(.5 * (Math.SQRT2 - 1));
    // A corner sharper than turnInPlaceAngle is still a stop and a turn on the corner point.
    const pivot = sampleRoute({ ...corner, profile: { cornerRadius: 1, turnRate: Math.PI / 2 } }, 4.5);
    expect(pivot).toMatchObject({ position: [0, 0, 4], turning: true }); expect(pivot.curving).toBeUndefined();
    // With acceleration and a corner speed, the arc follows the same speed profile as the polyline.
    const braking: NodeRoute = { ...corner, speed: 2, profile: { acceleration: 2, cornerSpeed: .5, cornerRadius: 1 } };
    expect(routeDuration(braking)).toBe(routeDuration({ ...braking, profile: { acceleration: 2, cornerSpeed: .5 } }));
    expect(largestSteps(braking).position).toBeLessThanOrEqual(2 * .01 + 1e-9);
  });

  it('rounds the seam of a loop', () => {
    const loop: NodeRoute = { points: [[0, 0, 0], [0, 0, 4], [4, 0, 4], [4, 0, 0], [0, 0, 0]], speed: 1, loop: true, profile: { cornerRadius: 1 } };
    expect(routeDuration(loop)).toBe(16);
    expect(sampleRoute(loop, .5).curving).toBe(true);
    expect(sampleRoute(loop, 15.5).curving).toBe(true);
    const steps = largestSteps(loop, 40);
    expect(steps.position).toBeLessThanOrEqual(.01 + 1e-9);
    expect(steps.yaw).toBeLessThan(.01);
  });

  it('validates the radius, copies it from agent rules and gives steered vehicles a radius', () => {
    expect(() => validateNodeRoute({ ...corner, profile: { cornerRadius: 0 } })).toThrow('corner radius');
    expect(() => validateNodeRoute({ ...corner, profile: { cornerRadius: 51 } })).toThrow('corner radius');
    expect(motionProfileOf({ cornerRadius: 2 })).toEqual({ cornerRadius: 2 });
    for (const kind of ['pallet-jack', 'forklift', 'reach-truck', 'baggage-cart', 'cargo-bike', 'delivery-van', 'truck', 'aircraft']) expect(assetMotionProfiles[kind].cornerRadius).toBeGreaterThan(0);
    for (const kind of ['worker', 'mobile-robot']) expect(assetMotionProfiles[kind].cornerRadius).toBeUndefined();
    const graph = createNavGraph({ points: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [0, 0, 6] }, { id: 'c', position: [6, 0, 6] }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }], agents: { forklift: assetMotionProfiles.forklift } });
    const plan = graph.plan({ agent: 'forklift', from: 'a', to: 'c' });
    expect(plan.ok && plan.route.profile?.cornerRadius).toBe(1.2);
  });
});

describe('route progress after a remount', () => {
  const route: NodeRoute = { points: [[0, 0, 0], [0, 0, 10]], speed: 1 };

  it('starts a first route at its declared progress and ignores it afterwards', () => {
    const follower = createRouteFollower();
    follower.assign({ ...route, elapsed: 2.5 }, [0, 0, 0]);
    expect(follower.sample()!.position[2]).toBeCloseTo(2.5);
    follower.advance(1);
    // The same route with newer progress is not a new route: the follower keeps its own clock.
    follower.assign({ ...route, elapsed: 9 }, [0, 0, 3.5]);
    expect(follower.sample()!.position[2]).toBeCloseTo(3.5);
    expect(createRouteFollower().advance(0)).toBeNull();
    const loop = createRouteFollower(); loop.assign({ points: [[0, 0, 0], [0, 0, 2], [0, 0, 0]], speed: 1, loop: true, elapsed: 9 }, [0, 0, 0]);
    expect(loop.sample()!.position[2]).toBeCloseTo(1);
    expect(() => validateNodeRoute({ ...route, elapsed: -1 })).toThrow('elapsed');
  });

  it('maps runner time to route progress', () => {
    const graph = createNavGraph({ points: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [0, 0, 10] }], edges: [{ from: 'a', to: 'b' }], agents: { person: { speed: 1 } } });
    const runner = createBehaviorRunner({ graph, agents: [{ id: 'p', agent: 'person', start: 'a', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'b' }] }] });
    runner.advance(3.2);
    const state = runner.getAgent('p')!;
    expect(state.routeStart).toBe(.5);
    expect(behaviorNode(state, { asset: 'worker' }).route?.elapsed).toBeUndefined();
    const node = behaviorNode(state, { asset: 'worker' }, { time: runner.time });
    expect(node.route?.elapsed).toBeCloseTo(2.7);
    const follower = createRouteFollower(); follower.assign(node.route, node.position!);
    expect(follower.sample()!.position[2]).toBeCloseTo(2.7);
  });

  it('resumes the example routes where the simulation is when a scene mounts again', async () => {
    const { agentNodes, createShift, palletJackNode } = await import('../apps/site/examples/motion-data');
    const runner = createShift(), dt = .02;
    // A continuously mounted scene: one follower per agent, fed after every runner step.
    const live = new Map(runner.getAgents().map(agent => [agent.id, { follower: createRouteFollower(), route: undefined as NodeRoute | undefined }]));
    for (let i = 0; i < 1500; i++) {
      runner.advance(dt);
      for (const node of agentNodes(runner.getAgents(), runner.time)) {
        const entry = live.get(node.id)!;
        if (node.route && JSON.stringify(node.route.points) !== JSON.stringify(entry.route?.points)) { entry.route = node.route; entry.follower.assign(node.route, entry.follower.sample()?.position ?? node.position!); }
        entry.follower.advance(dt);
      }
    }
    // A scene mounted now: fresh followers take each route at its elapsed time.
    let compared = 0;
    for (const node of agentNodes(runner.getAgents(), runner.time)) {
      const fresh = createRouteFollower(); fresh.assign(node.route, node.position!);
      const before = live.get(node.id)!.follower.sample()!.position, after = fresh.sample()!.position;
      expect(gap(before, after)).toBeLessThan(.1);
      compared++;
    }
    expect(compared).toBe(4);
    expect(palletJackNode(12).route?.elapsed).toBe(12);
  });
});

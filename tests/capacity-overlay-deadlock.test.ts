import { describe, expect, it } from 'vitest';
import { createBehaviorRunner, createNavGraph, navGraphOverlay, OVERLAY_COLORS, type BehaviorEvent, type BehaviorRunner } from '@opsorama/core';

function collect(runner: BehaviorRunner) { const events: BehaviorEvent[] = []; runner.subscribeEvents(event => events.push(event)); return events; }

/** Two one-person places `x` and `y` joined by one edge, with a side pocket `z` beside `x`. */
const graph = createNavGraph({
  points: [{ id: 'x', position: [0, 0, 0], capacity: 1 }, { id: 'y', position: [4, 0, 0], capacity: 1 }, { id: 'z', position: [0, 0, 2] }, { id: 'w', position: [8, 0, 0] }],
  edges: [{ from: 'x', to: 'y', capacity: 1 }, { from: 'x', to: 'z' }, { from: 'y', to: 'w' }],
  agents: { person: { speed: 1 } },
});
const swap = () => createBehaviorRunner({ graph, agents: [
  { id: 'a', agent: 'person', start: 'x', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'y' }] },
  { id: 'b', agent: 'person', start: 'y', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'x' }] },
] });

describe('capacity holds', () => {
  it('lists current and planned holds for points and edges', () => {
    const runner = createBehaviorRunner({ graph, agents: [{ id: 'a', agent: 'person', start: 'x', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'move', to: 'w' }] }] });
    expect(runner.getHolds()).toEqual([{ agent: 'a', point: 'x', from: 0, to: Infinity }]);
    runner.advance(1);
    // Leaving x at 1 s: x until reaching y (5 s), the edge from 1 to 5 s, and y from leaving x until reaching w (9 s).
    expect(runner.getHolds()).toEqual([
      { agent: 'a', edge: { from: 'x', to: 'y' }, from: 1, to: 5 },
      { agent: 'a', point: 'x', from: 1, to: 5 },
      { agent: 'a', point: 'y', from: 1, to: 9 },
    ]);
    runner.advance(5);
    expect(runner.getHolds()).toEqual([{ agent: 'a', point: 'y', from: 1, to: 9 }]);
    runner.advance(5);
    expect(runner.getHolds()).toEqual([]);
  });

  it('draws limited points and edges, and the ones held now', () => {
    const runner = createBehaviorRunner({ graph, agents: [{ id: 'a', agent: 'person', start: 'x', steps: [{ kind: 'wait', seconds: 1 }, { kind: 'move', to: 'w' }] }] });
    const plain = navGraphOverlay(graph);
    expect(plain.points.filter(point => point.color === OVERLAY_COLORS.limited)).toHaveLength(3);
    runner.advance(2);
    const overlay = navGraphOverlay(graph, { holds: runner.getHolds(), time: runner.time });
    // x, y and the x–y edge marker are held at 2 s; the edge is also traced.
    expect(overlay.points.filter(point => point.color === OVERLAY_COLORS.held)).toHaveLength(3);
    expect(overlay.lines.filter(line => line.color === OVERLAY_COLORS.held)).toEqual([{ from: [0, 0, 0], to: [4, 0, 0], color: OVERLAY_COLORS.held }]);
    // Holds that have not started yet are not drawn as held.
    expect(navGraphOverlay(graph, { holds: [{ agent: 'a', point: 'y', from: 5, to: 9 }], time: 2 }).points.filter(point => point.color === OVERLAY_COLORS.held)).toHaveLength(0);
  });
});

describe('deadlock detection', () => {
  it('reports two agents that must swap limited points, and clears once one is sent away', () => {
    const runner = swap(), events = collect(runner);
    runner.advance(1);
    expect(runner.getAgents().map(({ id, phase, deadlock }) => ({ id, phase, deadlock }))).toEqual([
      { id: 'a', phase: 'yielding', deadlock: ['a', 'b'] },
      { id: 'b', phase: 'yielding', deadlock: ['a', 'b'] },
    ]);
    expect(events.filter(event => event.type === 'deadlock')).toEqual([
      { type: 'deadlock', agent: 'a', time: .5, step: 1, agents: ['a', 'b'] },
      { type: 'deadlock', agent: 'b', time: .5, step: 1, agents: ['a', 'b'] },
    ]);
    // Reported once, not on every advance.
    runner.advance(10);
    expect(events.filter(event => event.type === 'deadlock')).toHaveLength(2);
    // The host moves `a` into the side pocket; `b` can now take x.
    runner.assign('a', [{ kind: 'move', to: 'z' }]);
    expect(runner.getAgents().every(agent => agent.deadlock === undefined)).toBe(true);
    runner.advance(20);
    expect(runner.getAgents().map(agent => [agent.phase, agent.at])).toEqual([['idle', 'z'], ['idle', 'x']]);
  });

  it('does not report a wait for an agent that is not waiting itself', () => {
    const runner = createBehaviorRunner({ graph, agents: [
      { id: 'a', agent: 'person', start: 'z', steps: [{ kind: 'wait', seconds: .5 }, { kind: 'move', to: 'y' }] },
      { id: 'b', agent: 'person', start: 'y', steps: [{ kind: 'wait', seconds: 30 }] },
    ] });
    const events = collect(runner);
    runner.advance(5);
    expect(runner.getAgent('a')).toMatchObject({ phase: 'yielding' });
    expect(runner.getAgent('a')!.deadlock).toBeUndefined();
    expect(events.some(event => event.type === 'deadlock')).toBe(false);
  });

  it('keeps detection independent of tick size', () => {
    const run = (ticks: number) => { const runner = swap(), events = collect(runner); for (let i = 0; i < ticks; i++) runner.advance(4 / ticks); return events.map(event => `${event.agent}:${event.type}@${event.time}`); };
    expect(run(400)).toEqual(run(1));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentBuild } from '../apps/site/src/features/landing/agent-build';
import { officeNodes } from '../apps/site/src/features/office/scene';
import { SCENARIOS } from '../apps/site/src/features/office/model';

const office = officeNodes(SCENARIOS.planning);
function stubWindow(reducedMotion: boolean) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reducedMotion }), setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('home page agent build', () => {
  it('adds the office node by node, then checks the finished scene', () => {
    vi.useFakeTimers(); stubWindow(false);
    const build = createAgentBuild(), stop = build.run();
    expect(build.store.getSnapshot().nodes.map(node => node.id)).toEqual([office[0].id]);
    let counts: number[] = [];
    for (let i = 0; i < 400 && !build.log.getSnapshot().some(line => line.kind === 'result'); i++) { vi.advanceTimersByTime(50); counts.push(build.store.getSnapshot().nodes.length); }
    counts = [...new Set(counts)];
    // The scene grows one node at a time up to the whole office, which then passes the check.
    expect(counts.at(-1)).toBe(office.length);
    expect(counts.length).toBeGreaterThan(office.length / 2);
    expect(new Set(build.store.getSnapshot().nodes.map(node => node.id))).toEqual(new Set(office.map(node => node.id)));
    expect(build.log.getSnapshot().at(-1)).toMatchObject({ kind: 'result', text: `✓ ${office.length} nodes, no problems` });
    // Walls come before furniture, and furniture before people; the log keeps only its last lines.
    const order = build.store.getSnapshot().nodes.map(node => node.kind === 'asset' ? node.asset : node.kind);
    expect(order.lastIndexOf('wall-segment')).toBeLessThan(order.indexOf('desk-pod'));
    expect(order.lastIndexOf('desk-pod')).toBeLessThan(order.indexOf('worker'));
    expect(build.log.getSnapshot().length).toBeLessThanOrEqual(8);
    stop(); build.dispose();
  });

  it('starts again after the pause', () => {
    vi.useFakeTimers(); stubWindow(false);
    const build = createAgentBuild(), stop = build.run();
    for (let i = 0; i < 400 && !build.log.getSnapshot().some(line => line.kind === 'result'); i++) vi.advanceTimersByTime(50);
    vi.advanceTimersByTime(7100);
    expect(build.store.getSnapshot().nodes.length).toBeLessThan(office.length);
    stop(); build.dispose();
  });

  it('shows the finished scene at once for reduced motion', () => {
    stubWindow(true);
    const build = createAgentBuild(), stop = build.run();
    expect(build.store.getSnapshot().nodes.length).toBe(office.length);
    expect(build.log.getSnapshot().map(line => line.kind)).toEqual(['prompt', 'result', 'result']);
    stop(); build.dispose();
  });
});

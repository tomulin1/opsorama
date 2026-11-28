import { describe, expect, it } from 'vitest';
import { createLandingScene } from '../apps/site/src/features/landing/scenes';

describe('home page scenes', () => {
  it('shows the forklift command ring over the game, with the crew working by itself', () => {
    const scene = createLandingScene('cutoff');
    expect(scene.store.getSnapshot().nodes.some(node => node.id === scene.menu?.nodeId)).toBe(true);
    const ring = scene.menu!.read()!;
    expect(ring).toMatchObject({ title: 'Forklift', tone: 'warning' });
    expect(ring.actions.map(action => action.id)).toEqual(['auto', 'move']);
    expect(ring.actions.find(action => action.id === 'auto')?.pressed).toBe(true);
    expect(scene.metrics?.dark).toBe(true);
    scene.dispose();
  });

  it('gives the dashboards light panels without actions', () => {
    for (const id of ['shop', 'warehouse', 'datacenter'] as const) {
      const scene = createLandingScene(id), metrics = scene.metrics!.read();
      expect(metrics).toHaveLength(4);
      expect(metrics.every(metric => metric.action === undefined)).toBe(true);
      expect(scene.metrics!.dark).toBeFalsy();
      expect(scene.menu).toBeUndefined();
      scene.dispose();
    }
  });
});

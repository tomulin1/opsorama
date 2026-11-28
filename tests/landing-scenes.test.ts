import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLandingScene, LANDING_SCENE_IMAGES } from '../apps/site/src/features/landing/scenes';
import { locationCode } from '../apps/site/src/features/warehouse/model';
import { DEFAULT_ZOOM as WAREHOUSE_ZOOM } from '../apps/site/src/features/warehouse/scene';

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

  it('opens the distribution centre with rack bay A05-07-L selected, so its inspector shows, and the camera kept on the overview', () => {
    const scene = createLandingScene('warehouse'), { selection, settings } = scene.store.getSnapshot();
    expect(locationCode('A05', 6, 'L')).toBe('A05-07-L');
    expect(selection?.nodeId).toBe('rack:A05:6:L');
    expect(settings.camera.frameOnSelect).toBe(false);
    expect(scene.side).toBeDefined();
    scene.dispose();
  });

  it('gives the dashboards their right-hand panels and makes clickable only the top panels that open them, as in the examples', () => {
    const opens = { shop: ['shoppers'], warehouse: ['putaway'], datacenter: ['inlet', 'alerts'] } as const;
    for (const [id, ids] of Object.entries(opens) as [keyof typeof opens, readonly string[]][]) {
      const scene = createLandingScene(id);
      expect(Object.keys(scene.side!.metrics)).toEqual(ids);
      const action = { label: 'test', onActivate: () => {} };
      const metrics = scene.metrics!.read(Object.fromEntries(ids.map(metric => [metric, action])));
      expect(metrics.filter(metric => metric.action).map(metric => metric.id)).toEqual(ids);
      scene.dispose();
    }
    expect(createLandingScene('cutoff').side).toBeUndefined();
  });

  it('starts every scene two zoom steps closer than its example', () => {
    const scene = createLandingScene('warehouse');
    expect(scene.zoom).toBeCloseTo(WAREHOUSE_ZOOM + .4);
    expect(scene.store.getSnapshot().settings.zoom).toBeCloseTo(WAREHOUSE_ZOOM + .4);
    scene.dispose();
  });

  it('has a captured image behind every scene', () => {
    for (const path of Object.values(LANDING_SCENE_IMAGES)) expect(existsSync(new URL(`../apps/site/public${path}`, import.meta.url)), path).toBe(true);
  });

  it('gives the dashboards light panels, without actions unless the home page passes them', () => {
    for (const id of ['shop', 'warehouse', 'datacenter'] as const) {
      const scene = createLandingScene(id), metrics = scene.metrics!.read({});
      expect(metrics).toHaveLength(4);
      expect(metrics.every(metric => metric.action === undefined)).toBe(true);
      expect(scene.metrics!.dark).toBeFalsy();
      expect(scene.menu).toBeUndefined();
      scene.dispose();
    }
  });
});

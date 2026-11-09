import { describe, expect, it } from 'vitest';
import { validateNode, type AssetNode, type SceneNode } from '@opsorama/core';
import { catalogAssets } from '@opsorama/objects';
import { FIELDS, PENS, SCENARIOS, farmMetrics, flagNode, penState, troughState, type FarmScenario } from '../apps/site/src/features/farm/model';
import { applyFarmSnapshot, createFarmStore, farmNodes } from '../apps/site/src/features/farm/scene';

const assets = (nodes: readonly SceneNode[]) => nodes.filter((node): node is AssetNode => node.kind === 'asset');
const inside = (rect: readonly [number, number, number, number], x: number, z: number) => x > rect[0] && x < rect[1] && z > rect[2] && z < rect[3];

describe('farm dashboard', () => {
  for (const scenario of Object.keys(SCENARIOS) as FarmScenario[]) it(`${scenario}: builds valid, unique nodes from registered assets`, () => {
    const nodes = farmNodes(SCENARIOS[scenario]);
    expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length);
    for (const node of nodes) expect(() => validateNode(node), node.id).not.toThrow();
    for (const node of assets(nodes)) expect(catalogAssets[node.asset], node.asset).toBeTypeOf('function');
    // Every task and alert points at a node that exists in this snapshot.
    const ids = new Set(nodes.map(node => node.id));
    for (const task of SCENARIOS[scenario].tasks) expect(ids.has(task.node), task.node).toBe(true);
    for (const flag of SCENARIOS[scenario].flags) expect(ids.has(flagNode(flag)), flag.tag).toBe(true);
  });

  it('encloses every pen with 3 m fence segments, one of them a gate', () => {
    const nodes = assets(farmNodes(SCENARIOS.heat));
    for (const pen of PENS) {
      const [x0, x1, z0, z1] = pen.rect, segments = nodes.filter(node => node.id.startsWith(`fence:${pen.id}:`));
      expect((x1 - x0) % 3, pen.id).toBe(0); expect((z1 - z0) % 3, pen.id).toBe(0);
      expect(segments, pen.id).toHaveLength(2 * ((x1 - x0) + (z1 - z0)) / 3);
      expect(segments.filter(node => node.variant === 'gate'), pen.id).toHaveLength(1);
    }
  });

  it('draws at most the shown animals inside their pens, flagged animals first with their state', () => {
    for (const snapshot of Object.values(SCENARIOS)) {
      const nodes = assets(farmNodes(snapshot));
      for (const pen of PENS) {
        const record = snapshot.pens.find(value => value.id === pen.id)!, animals = nodes.filter(node => node.asset === pen.species && (node.id.startsWith(`animal:${pen.id}:`) || snapshot.flags.some(flag => flag.pen === pen.id && node.id === `animal:${flag.tag}`)));
        expect(animals, pen.id).toHaveLength(Math.min(record.headcount, pen.shown));
        for (const animal of animals) expect(inside(pen.rect, animal.position![0], animal.position![2]), animal.id).toBe(true);
        const trough = nodes.find(node => node.id === `trough:${pen.id}`)!;
        expect(trough.state, pen.id).toBe(troughState(record.level)); expect(inside(pen.rect, trough.position![0], trough.position![2])).toBe(true);
      }
      for (const flag of snapshot.flags) {
        const node = nodes.find(value => value.id === `animal:${flag.tag}`);
        if (flag.missing) expect(node, flag.tag).toBeUndefined(); else expect(node?.state, flag.tag).toBe(flag.severity);
      }
    }
  });

  it('makes every drawn animal selectable and keeps the farmer and fixtures as scenery', () => {
    const species = new Set<string>([...PENS.map(pen => pen.species), 'dog', 'cat', 'bird']);
    for (const snapshot of Object.values(SCENARIOS)) {
      const nodes = assets(farmNodes(snapshot)), animals = nodes.filter(node => species.has(node.asset));
      expect(animals.length).toBeGreaterThan(PENS.length);
      for (const animal of animals) expect(animal.selectable, animal.id).toBe(true);
      for (const pen of PENS) for (const herd of animals.filter(node => node.id.startsWith(`animal:${pen.id}:`))) expect(herd.entityId, herd.id).toBe(pen.id);
      expect(nodes.find(node => node.id === 'farmer')?.selectable).toBe(false);
    }
  });

  it('derives pen states and metrics from the records', () => {
    expect(troughState(0)).toBe('inactive'); expect(troughState(29)).toBe('warning'); expect(troughState(30)).toBe('normal');
    const heat = SCENARIOS.heat, metrics = farmMetrics(heat);
    expect(penState(heat, 'dairy')).toBe('critical'); expect(penState(heat, 'sheep')).toBe('critical'); expect(penState(heat, 'hens')).toBe('warning'); expect(penState(heat, 'pigs')).toBe('normal');
    expect(metrics).toMatchObject({ animals: 129, missing: 1, alerts: 3, critical: 2, refill: 2, empty: 1, ripe: 2, overdue: 1 });
    expect(farmMetrics(SCENARIOS.harvest)).toMatchObject({ missing: 0, alerts: 0, refill: 0 });
    expect(Object.values(SCENARIOS).every(snapshot => PENS.every(pen => snapshot.pens.some(value => value.id === pen.id)) && FIELDS.every(field => snapshot.fields.some(value => value.id === field.id)))).toBe(true);
  });

  it('moves the tractor only on harvest day and keeps the birds in the air on closed loops', () => {
    for (const scenario of Object.keys(SCENARIOS) as FarmScenario[]) {
      const nodes = assets(farmNodes(SCENARIOS[scenario])), tractor = nodes.find(node => node.id === 'tractor')!;
      expect(Boolean(tractor.route), scenario).toBe(scenario === 'harvest');
      for (const node of nodes.filter(value => value.route)) { const points = node.route!.points; expect(points.at(-1), node.id).toEqual(points[0]); expect(node.route!.loop).toBe(true); }
      for (const bird of nodes.filter(node => node.asset === 'bird')) expect(bird.route!.points.every(point => point[1] > 3), bird.id).toBe(true);
    }
    const field = FIELDS.find(value => value.id === 'F2')!, route = assets(farmNodes(SCENARIOS.harvest)).find(node => node.id === 'tractor')!.route!;
    expect(route.points.every(point => inside(field.rect, point[0], point[2]))).toBe(true);
  });

  it('replaces the scene with a new snapshot without changing the records', () => {
    const store = createFarmStore('morning'), before = JSON.stringify(SCENARIOS);
    applyFarmSnapshot(store, SCENARIOS.harvest);
    const field = store.getSnapshot().nodes.find(node => node.id === 'field:F1');
    expect(field?.kind === 'asset' && field.variant).toBe('harvested');
    expect(JSON.stringify(SCENARIOS)).toBe(before); store.dispose();
  });
});

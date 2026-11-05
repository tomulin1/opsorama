import { describe, expect, it } from 'vitest';
import { createSceneStore, type GroundNode, type SceneNode } from '@opsorama/core';
import { CITY, cityStaticNodes, DISTRICTS, districtFacts, districtFocusId, districtPinId, placeEcommerce } from '../src/features/landing/city';
import { createEcommerceSimulation } from '../src/features/ecommerce/simulation';
import { SCENARIOS } from '../src/features/ecommerce/model';
import { farmNodes } from '../src/features/farm/scene';
import { SCENARIOS as FARM } from '../src/features/farm/model';

const simulation = createEcommerceSimulation('peak'), live = placeEcommerce(simulation.nodes()), nodes: readonly SceneNode[] = [...cityStaticNodes(), ...live];
const ids = new Set(nodes.map(node => node.id));
const rect = (node: GroundNode) => { const [x, , z] = node.position ?? [0, 0, 0]; return { x0: x - node.size[0] / 2, x1: x + node.size[0] / 2, z0: z - node.size[1] / 2, z1: z + node.size[1] / 2 }; };

describe('home page city', () => {
  it('is one valid scene', () => {
    expect(() => createSceneStore({ schemaVersion: 1, nodes })).not.toThrow();
  });
  it('starts with the slab the overview camera targets, under every other surface', () => {
    const [first] = nodes;
    expect(first.kind).toBe('ground');
    expect(first.position![1]).toBeLessThan(-1);
    expect(first.position![0]).toBeCloseTo((CITY.west + CITY.east) / 2);
  });
  it('runs the own nodes of an example, so a change there reaches the city', () => {
    for (const node of farmNodes(FARM.heat)) expect(ids.has(`farm:${node.id}`)).toBe(true);
  });
  it('has a pin and a camera target for each district', () => {
    for (const district of DISTRICTS) {
      expect(ids.has(districtPinId(district.id))).toBe(true);
      expect(ids.has(districtFocusId(district))).toBe(true);
    }
  });
  it('labels only the district pins and marks every object with its district', () => {
    expect(nodes.filter(node => node.label).map(node => node.id).sort()).toEqual(DISTRICTS.map(district => districtPinId(district.id)).sort());
    for (const district of DISTRICTS) for (const node of nodes.filter(item => item.id.startsWith(`${district.id}:`))) expect(node.entityId).toBe(district.id);
  });
  it('replaces the e-commerce street with the avenue', () => {
    expect([...ids].some(id => /^ecommerce:road-\d+$/.test(id))).toBe(false);
  });
  it('runs both east-west streets from edge to edge of the city', () => {
    for (const z of [0, -42]) {
      const xs = nodes.filter(node => node.kind === 'asset' && node.asset === 'road' && node.position![2] === z).map(node => node.position![0]);
      expect(Math.min(...xs) - 3).toBe(CITY.west); expect(Math.max(...xs) + 3).toBe(CITY.east);
    }
  });
  it('keeps district plots inside the city and apart from each other', () => {
    const plots = DISTRICTS.map(district => ({ id: district.id, ...rect(nodes.find(node => node.id === districtFocusId(district)) as GroundNode) }));
    for (const plot of plots) {
      expect(plot.x0).toBeGreaterThanOrEqual(CITY.west); expect(plot.x1).toBeLessThanOrEqual(CITY.east);
      expect(plot.z0).toBeGreaterThanOrEqual(CITY.north); expect(plot.z1).toBeLessThanOrEqual(CITY.south + 1e-9);
      for (const other of plots) if (other.id !== plot.id) expect(plot.x1 <= other.x0 || other.x1 <= plot.x0 || plot.z1 <= other.z0 || other.z1 <= plot.z0, `${plot.id} overlaps ${other.id}`).toBe(true);
    }
  });
  it('gives three readings for each district', () => {
    for (const district of DISTRICTS) expect(districtFacts(district.id, SCENARIOS.peak)).toHaveLength(3);
  });
});

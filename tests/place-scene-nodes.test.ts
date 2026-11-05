import { describe, expect, it } from 'vitest';
import { createSceneStore, placeSceneNodes, type SceneNode } from '@opsorama/core';

const scene: readonly SceneNode[] = [
  { id: 'ground', kind: 'ground', size: [10, 10] },
  { id: 'hall', kind: 'asset', asset: 'building', position: [1, 0, 2], building: { size: [6, 4, 6] } },
  { id: 'rack', kind: 'asset', asset: 'pallet-rack', parentId: 'hall', position: [.5, 0, .5], entityId: 'R1' },
  { id: 'cart', kind: 'asset', asset: 'picking-cart', position: [0, 0, 0], route: { points: [[0, 0, 0], [4, 0, 0]], speed: 1 } },
  { id: 'tote', kind: 'asset', asset: 'tote', position: [0, .2, 0], attachment: { nodeId: 'cart', anchor: 'top' } },
  { id: 'path', kind: 'path', points: [[0, 0, 0], [2, 0, 0]], position: [3, 0, 3] },
];
const placed = placeSceneNodes(scene, { idPrefix: 'a:', offset: [100, 0, -50] });
const node = (id: string) => placed.find(item => item.id === id)!;

describe('placeSceneNodes', () => {
  it('prefixes IDs and every reference to them', () => {
    expect(placed.map(item => item.id)).toEqual(scene.map(item => `a:${item.id}`));
    expect(node('a:rack').parentId).toBe('a:hall');
    expect(node('a:tote').attachment).toEqual({ nodeId: 'a:cart', anchor: 'top' });
  });
  it('moves top-level nodes and routes, also when a node has no position', () => {
    expect(node('a:ground').position).toEqual([100, 0, -50]);
    expect(node('a:hall').position).toEqual([101, 0, -48]);
    const cart = node('a:cart');
    expect(cart.kind === 'asset' && cart.route?.points).toEqual([[100, 0, -50], [104, 0, -50]]);
  });
  it('keeps local transforms, path points and record identity', () => {
    expect(node('a:rack').position).toEqual([.5, 0, .5]);
    expect(node('a:rack').entityId).toBe('R1');
    expect(node('a:tote').position).toEqual([0, .2, 0]);
    const path = node('a:path');
    expect(path.position).toEqual([103, 0, -47]);
    expect(path.kind === 'path' && path.points).toEqual([[0, 0, 0], [2, 0, 0]]);
  });
  it('leaves the input unchanged', () => {
    expect(scene[1].position).toEqual([1, 0, 2]);
    expect(scene[1].id).toBe('hall');
  });
  it('lets two copies of a scene share a store', () => {
    const nodes = [...placeSceneNodes(scene, { idPrefix: 'a:', offset: [0, 0, 0] }), ...placeSceneNodes(scene, { idPrefix: 'b:', offset: [30, 0, 0] })];
    expect(() => createSceneStore({ schemaVersion: 1, nodes })).not.toThrow();
  });
  it('names the problem when the placement is invalid', () => {
    expect(() => placeSceneNodes(scene, { idPrefix: '', offset: [0, 0, 0] })).toThrow(/idPrefix/);
    expect(() => placeSceneNodes(scene, { idPrefix: 'a:', offset: [0, Number.NaN, 0] })).toThrow(/offset/);
  });
});

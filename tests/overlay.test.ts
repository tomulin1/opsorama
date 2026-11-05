import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNavGraph, navGraphOverlay, OVERLAY_COLORS, resolveSceneSlots, slotNavPoints, validateOverlay, type AssetNode } from '@opsorama/core';
import { assetInteractionSlots, createOverlayObject, disposeObject } from '@opsorama/renderer-three';

const desk: AssetNode = { id: 'desk', kind: 'asset', asset: 'station', position: [4, 0, -2] };
const slots = resolveSceneSlots([desk], assetInteractionSlots);
const graph = createNavGraph({
  points: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [4, 0, 0] }, ...slotNavPoints(slots)],
  edges: [{ from: 'a', to: 'b', lane: 'walkway' }, { from: 'b', to: 'desk:work', lane: 'walkway' }],
  agents: { person: { speed: 1 } },
});

describe('navigation overlay', () => {
  it('describes edges, one-way arrows, points and slot occupancy', () => {
    const oneWay = createNavGraph({ points: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [1, 0, 0] }], edges: [{ from: 'a', to: 'b', oneWay: true, lane: 'yard' }], agents: { vehicle: { speed: 1 } } });
    expect(navGraphOverlay(oneWay, { laneColors: { yard: '#123456' } }).lines).toEqual([{ from: [0, 0, 0], to: [1, 0, 0], color: '#123456', arrow: true }]);
    const free = navGraphOverlay(graph, { slots }), taken = navGraphOverlay(graph, { slots, reservations: new Map([['desk:work', 'agent']]) });
    expect(free.points.filter(point => point.color === OVERLAY_COLORS.free)).toHaveLength(2);
    expect(taken.points.filter(point => point.color === OVERLAY_COLORS.reserved)).toHaveLength(2);
    // Slot approaches are drawn once, as slot markers rather than plain graph points.
    expect(free.points).toHaveLength(2 + 2);
    const withRoute = navGraphOverlay(graph, { routes: [{ points: [[0, 0, 0], [1, 0, 0], [1, 0, 1]], speed: 1 }] });
    expect(withRoute.lines.filter(line => line.color === OVERLAY_COLORS.route)).toHaveLength(2);
  });

  it('validates overlays', () => {
    expect(() => validateOverlay({ lines: [{ from: [0, 0, 0], to: [1, 0, 0], color: 'red' }], points: [] })).toThrow('colors');
    expect(() => validateOverlay({ lines: [], points: [{ position: [0, NaN, 0], color: '#ffffff' }] })).toThrow('finite');
    expect(() => validateOverlay({ lines: [], points: [{ position: [0, 0, 0], color: '#ffffff', radius: 5 }] })).toThrow('radius');
  });

  it('builds a self-owned, depth-independent Three.js group', () => {
    const overlay = navGraphOverlay(createNavGraph({ points: [{ id: 'a', position: [0, 0, 0] }, { id: 'b', position: [2, 0, 0] }], edges: [{ from: 'a', to: 'b', oneWay: true }], agents: { person: { speed: 1 } } }), { slots });
    const group = createOverlayObject(overlay), materials = new Set<THREE.Material>();
    group.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) materials.add(child.material as THREE.Material); });
    expect(group.getObjectByName('overlay-arrow')).toBeDefined();
    expect(group.getObjectByName('overlay-lines-dashed')).toBeDefined();
    expect([...materials].every(material => material.depthTest === false)).toBe(true);
    let disposed = 0; materials.forEach(material => material.addEventListener('dispose', () => { disposed++; }));
    disposeObject(group); expect(disposed).toBe(materials.size);
  });
});

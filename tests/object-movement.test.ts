import { describe, expect, it } from 'vitest';
import type { AssetNode } from '@opsorama/core';
import { assetInteractionSlots, assetMotionProfiles } from '@opsorama/renderer-three';
import { motionProfileRows, movementFacts } from '../src/features/docs/object-movement';
import { catalogObjects, objectNode } from '../src/features/docs/objects';

const asset = (id: string) => objectNode(catalogObjects.find(item => item.asset === id)!, {}) as AssetNode;

describe('object page movement metadata', () => {
  it('lists the slots of the previewed node, following its count', () => {
    const { slots, profile } = movementFacts(asset('shelf'));
    expect(profile).toBeNull();
    expect(slots).toEqual([
      { name: 'pick-0', group: 'pick', pose: 'working', heading: '180°', position: '-0.75, 0.90', approach: '-0.75, 1.40', agents: 'person' },
      { name: 'pick-1', group: 'pick', pose: 'working', heading: '180°', position: '0.75, 0.90', approach: '0.75, 1.40', agents: 'person' },
    ]);
    const pod = asset('desk-pod');
    expect(movementFacts({ ...pod, count: 1 }).slots).toHaveLength(1);
    expect(movementFacts({ ...pod, count: 4 }).slots).toHaveLength(assetInteractionSlots['desk-pod']({ ...pod, count: 4 }).length);
  });

  it('describes catalog motion profiles with their defaults filled in', () => {
    expect(movementFacts(asset('forklift'))).toEqual({ slots: [], profile: motionProfileRows(assetMotionProfiles.forklift) });
    expect(motionProfileRows(assetMotionProfiles.forklift)).toContainEqual(['Corner radius', '1.2 m arcs at corners taken while moving']);
    expect(motionProfileRows(assetMotionProfiles.worker)).toContainEqual(['Turning in place', '7 rad/s (401°/s) at corners sharper than 45°']);
    expect(motionProfileRows({ speed: 1 })).toEqual([
      ['Speed', '1 m/s'], ['Acceleration', 'Instant speed changes'], ['Turning in place', 'Never pivots; the renderer blends heading changes'],
      ['Corner speed', 'Full speed through corners'], ['Corner radius', 'Sharp corners on the graph polyline'],
    ]);
  });

  it('covers every catalog object with slots or a profile, and nothing else', () => {
    const covered = catalogObjects.filter(item => item.asset && (assetInteractionSlots[item.asset] || assetMotionProfiles[item.asset]));
    expect(covered.length).toBeGreaterThan(15);
    for (const item of covered) { const facts = movementFacts(objectNode(item, {}) as AssetNode); expect(facts.slots.length > 0 || facts.profile !== null).toBe(true); }
    expect(movementFacts(asset('parcel'))).toEqual({ slots: [], profile: null });
    // Every catalog motion profile and slot source belongs to a catalog object page.
    for (const kind of [...Object.keys(assetMotionProfiles), ...Object.keys(assetInteractionSlots)]) expect(catalogObjects.some(item => item.asset === kind)).toBe(true);
  });
});

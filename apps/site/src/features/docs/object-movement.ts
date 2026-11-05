import type { AssetNode, NavAgentRule, Vec3 } from '@opsorama/core';
import { assetInteractionSlots, assetMotionProfiles } from '@opsorama/objects';

/** One interaction slot as shown on an object page: local metres (x, z), heading in degrees (0° faces +z). */
export interface SlotFact { name: string; group: string; pose: string; heading: string; position: string; approach: string; agents: string }
export interface MovementFacts { slots: readonly SlotFact[]; profile: readonly (readonly [string, string])[] | null }

const point = (value: Vec3) => `${value[0].toFixed(2)}, ${value[2].toFixed(2)}`;
const degrees = (radians: number) => `${Math.round(radians * 180 / Math.PI)}°`;

/** Readable rows for a movement-graph agent rule, with the documented defaults filled in. */
export function motionProfileRows(rule: NavAgentRule): readonly (readonly [string, string])[] {
  const turnInPlace = rule.turnInPlaceAngle ?? (rule.turnRate ? Math.PI / 4 : Math.PI);
  return [
    ['Speed', `${rule.speed} m/s`],
    ['Acceleration', rule.acceleration ? `${rule.acceleration} m/s² (starts, stops and lane speed changes ramp)` : 'Instant speed changes'],
    ['Turning in place', rule.turnRate && turnInPlace < Math.PI ? `${rule.turnRate} rad/s (${degrees(rule.turnRate)}/s) at corners sharper than ${degrees(turnInPlace)}` : 'Never pivots; the renderer blends heading changes'],
    ['Corner speed', rule.cornerSpeed ? `${rule.cornerSpeed} m/s through a 90° corner taken while moving` : 'Full speed through corners'],
    ['Corner radius', rule.cornerRadius ? `${rule.cornerRadius} m arcs at corners taken while moving` : 'Sharp corners on the graph polyline'],
  ];
}

/**
 * Interaction slots of a node (so its count and variant apply) and the catalog
 * motion profile of its asset, read from the same runtime data that
 * `resolveSceneSlots` and movement graphs use.
 */
export function movementFacts(node: AssetNode): MovementFacts {
  const slots = (assetInteractionSlots[node.asset]?.(node) ?? []).map(slot => ({ name: slot.name, group: slot.group ?? '—', pose: slot.pose, heading: degrees(slot.yaw), position: point(slot.position), approach: point(slot.approach), agents: (slot.agents ?? ['person']).join(', ') }));
  const profile = assetMotionProfiles[node.asset];
  return { slots, profile: profile ? motionProfileRows(profile) : null };
}

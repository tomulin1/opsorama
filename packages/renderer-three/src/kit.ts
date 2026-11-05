import * as THREE from 'three';
import type { AssetNode, MaterialPalette } from '@opsorama/core';
import { resolveLabPalette, type MaterialContext } from './laboratory';
import { block, type PartOptions } from './parts';

/** Semantic roles without the legacy `color` → accent mapping; each factory applies `color` to its own body part. */
export function kitPalette(node: AssetNode, context?: MaterialContext): MaterialPalette { return resolveLabPalette({ ...node, color: undefined }, context); }

export function variantOf<T extends string>(node: AssetNode, values: readonly T[], label: string): T {
  const variant = node.variant ?? values[0];
  if (!values.includes(variant as T)) throw new Error(`Unknown ${label} variant: ${node.variant}.`);
  return variant as T;
}

type Axis = 'x' | 'y' | 'z';
const along = (axis: Axis, t: number, center: readonly [number, number, number], u: number, v: number): [number, number, number] =>
  axis === 'x' ? [t, center[1] + u, center[2] + v] : axis === 'y' ? [center[0] + u, t, center[2] + v] : [center[0] + u, center[1] + v, t];

/**
 * Square lattice truss running along `axis` from `start` to `end`: four chord boxes plus zig-zag lacing on each face,
 * appended to `lacing` so a whole structure shares one LineSegments object.
 */
export function truss(group: THREE.Object3D, lacing: number[], axis: Axis, start: number, end: number, center: readonly [number, number, number], half: number, step: number, color: string, name: string, chord = .08, options: PartOptions = {}): void {
  const length = end - start, mid = (start + end) / 2;
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]] as const;
  for (const [u, v] of corners) {
    const size: [number, number, number] = axis === 'x' ? [length, chord, chord] : axis === 'y' ? [chord, length, chord] : [chord, chord, length];
    block(group, size, along(axis, mid, center, u, v), color, name, options);
  }
  for (let face = 0; face < 4; face++) {
    const [u0, v0] = corners[face], [u1, v1] = corners[(face + 1) % 4];
    let flip = false;
    for (let t = start; t < end - 1e-6; t += step) {
      const t1 = Math.min(end, t + step), a = flip ? along(axis, t, center, u1, v1) : along(axis, t, center, u0, v0), b = flip ? along(axis, t1, center, u0, v0) : along(axis, t1, center, u1, v1);
      lacing.push(...a, ...b); flip = !flip;
    }
  }
}

import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import { resolveCountRepresentation, type AssetNode, type MaterialPalette } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { resolveLabPalette } from './laboratory';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, cylinder, gridWires, part, wires } from './parts';

export type FenceVariant = 'mesh' | 'gate';
export type WasteBinVariant = 'general' | 'recycling' | 'organic';

function palette(node: AssetNode, context?: MaterialContext): MaterialPalette { return resolveLabPalette({ ...node, color: undefined }, context); }

const FENCE = { length: 3, height: 2, gate: 1.2 } as const;
/**
 * Welded-mesh fence spanning x −1.5…1.5 m with start/end anchors for chaining, like `wall-segment`.
 * The gate variant adds a closed 1.2 m leaf and an `opening` anchor; access rules stay with the host. Color changes posts and rails.
 */
export function createFenceSegment(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = (node.variant ?? 'mesh') as FenceVariant;
  if (variant !== 'mesh' && variant !== 'gate') throw new Error(`Unknown fence variant: ${node.variant}.`);
  const p = palette(node, context), frame = node.materials?.structure ?? node.color ?? p.structure, { length, height, gate } = FENCE, metal = { metalness: .3, roughness: .45 };
  const fence = new THREE.Group(); fence.name = `fence-${variant}`;
  const posts = variant === 'gate' ? [-length / 2, -gate / 2 - .04, gate / 2 + .04, length / 2] : [-length / 2, 0, length / 2];
  for (const x of posts) { cylinder(fence, .035, height + .05, (height + .05) / 2, frame, 'fence-post', { segments: 12, ...metal }).position.x = x; block(fence, [.14, .02, .14], [x, .01, 0], frame, 'fence-foot'); }
  const rail = (x0: number, x1: number, y: number) => { const mesh = cylinder(fence, .02, x1 - x0, 0, frame, 'fence-rail', { segments: 10, ...metal }); mesh.rotation.z = Math.PI / 2; mesh.position.set((x0 + x1) / 2, y, 0); };
  const spans = variant === 'gate' ? [[-length / 2, -gate / 2 - .04], [gate / 2 + .04, length / 2]] : [[-length / 2, length / 2]];
  const grid: number[] = [];
  for (const [x0, x1] of spans) { rail(x0, x1, height - .02); rail(x0, x1, .08); gridWires(grid, [(x0 + x1) / 2, (height + .06) / 2, 0], [x1 - x0, height - .1], .1, 'z'); block(fence, [x1 - x0, height - .1, .01], [(x0 + x1) / 2, (height + .06) / 2, 0], p.trim, 'fence-mesh', { opacity: .1 }); }
  if (variant === 'gate') {
    // Closed leaf: tube frame with a diagonal brace, its own mesh and a latch.
    const leaf = gate - .04, y0 = .08, y1 = height - .08;
    for (const x of [-leaf / 2, leaf / 2]) block(fence, [.04, y1 - y0, .04], [x, (y0 + y1) / 2, .03], frame, 'fence-gate-frame', metal);
    for (const y of [y0, y1]) block(fence, [leaf, .04, .04], [0, y, .03], frame, 'fence-gate-frame', metal);
    block(fence, [.03, Math.hypot(leaf, y1 - y0), .03], [0, (y0 + y1) / 2, .03], frame, 'fence-gate-frame', metal).rotation.z = Math.atan2(leaf, y1 - y0);
    gridWires(grid, [0, (y0 + y1) / 2, .03], [leaf - .04, y1 - y0 - .04], .1, 'z');
    block(fence, [leaf - .04, y1 - y0 - .04, .01], [0, (y0 + y1) / 2, .03], p.trim, 'fence-mesh', { opacity: .1 });
    block(fence, [.08, .06, .06], [leaf / 2 - .02, 1.05, .07], p.warning, 'fence-latch', { bevel: .01 });
    anchor(fence, 'opening', [0, 0, 0]);
  }
  wires(fence, grid, p.trim, 'fence-wire');
  anchor(fence, 'start', [-length / 2, 0, 0]); anchor(fence, 'end', [length / 2, 0, 0]);
  return fence;
}

/**
 * Two-wheeled 240 l wheelie bin facing +z (handle and wheels at −z). The variant selects the lid role
 * (general: structure, recycling: accent, organic: normal); color changes the body. Fill level is host data.
 */
export function createWasteBin(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = (node.variant ?? 'general') as WasteBinVariant;
  if (!['general', 'recycling', 'organic'].includes(variant)) throw new Error(`Unknown waste bin variant: ${node.variant}.`);
  const p = palette(node, context), body = node.materials?.trim ?? node.color ?? p.trim, lid = variant === 'recycling' ? p.accent : variant === 'organic' ? p.normal : p.structure;
  const bin = new THREE.Group(); bin.name = `waste-bin-${variant}`;
  // Square tapered body: a four-sided frustum turned 45°.
  const shell = part(bin, new THREE.CylinderGeometry(.42, .35, .95, 4, 1), body, 'bin-body', { roughness: .55, flat: true }); shell.rotation.y = Math.PI / 4; shell.scale.z = .9; shell.position.y = .525;
  block(bin, [.62, .05, .6], [0, 1.025, .01], lid, 'bin-lid', { bevel: .015, roughness: .5 });
  block(bin, [.6, .06, .03], [0, 1.0, .3], lid, 'bin-lid', { bevel: .01, roughness: .5 });
  const handle = cylinder(bin, .025, .5, 0, p.structure, 'bin-handle', { segments: 10 }); handle.rotation.z = Math.PI / 2; handle.position.set(0, .96, -.33);
  for (const x of [-.25, .25]) { const wheel = part(bin, new THREE.CylinderGeometry(.1, .1, .06, 16), p.screen, 'bin-wheel', { roughness: .8 }); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .1, -.27); }
  block(bin, [.16, .16, .006], [0, .72, .285], lid, 'bin-label').rotation.x = -.07;
  anchor(bin, 'lid', [0, 1.05, 0]);
  return bin;
}

export const TRAFFIC_CONES = Object.freeze({ slots: 6, spacing: .6 });
/**
 * Row of traffic cones in six fixed slots along x (−1.5…1.5 m); `count` places 1–6 from −x. The row marks a temporary
 * area and does not encode a blocked route or reservation. Color changes the cone bodies; the bands stay reflective white.
 */
export function createTrafficCone(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), cone = resolveObjectColor(node, context, 'accent', '#ee7b30'), { slots, spacing } = TRAFFIC_CONES;
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['traffic-cone']);
  const row = new THREE.Group(); row.name = 'traffic-cone';
  const radius = (y: number) => .15 - (y - .04) / .7 * .125;
  for (let i = 0; i < count; i++) {
    const item = new THREE.Group(); item.name = `count-part-${i}`; item.position.x = (i - (slots - 1) / 2) * spacing; row.add(item);
    block(item, [.36, .04, .36], [0, .02, 0], p.screen, 'cone-base', { bevel: .01, roughness: .8 });
    cylinder(item, .025, .7, .39, cone, 'cone-body', { bottomRadius: .15, segments: 20, roughness: .5 });
    for (const y of [.33, .52]) cylinder(item, radius(y + .035) + .003, .07, y, '#f6f8fb', 'cone-band', { bottomRadius: radius(y - .035) + .003, segments: 20, roughness: .3 });
  }
  anchor(row, 'start', [-(slots - 1) / 2 * spacing, 0, 0]); anchor(row, 'end', [(slots - 1) / 2 * spacing, 0, 0]);
  return row;
}

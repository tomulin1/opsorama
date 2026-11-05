import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { anchor, block } from './parts';
import { resolveLabPalette } from './laboratory';
import type { MaterialContext } from '@opsorama/three';
import { addActivityLeds, type ActivityLed } from './activity-leds';

export type WallVariant = 'solid' | 'door' | 'window';
export type EquipmentCabinetVariant = 'detailed' | 'overview';
const WALL = { length: 4, height: 2.6, thickness: .15 } as const;
const OPENINGS = { door: { width: 1, bottom: 0, top: 2.1 }, window: { width: 1.4, bottom: 1, top: 2 } } as const;

/** Spans x −2…2 m with start/end anchors for chaining; door and window variants add a centered opening anchor. */
export function createWallSegment(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = (node.variant ?? 'solid') as WallVariant;
  if (variant !== 'solid' && variant !== 'door' && variant !== 'window') throw new Error(`Unknown wall variant: ${node.variant}.`);
  const wall = new THREE.Group(); wall.name = `wall-${variant}`;
  const surface = resolveObjectColor(node, context, 'surface', '#dfe7f1'), trim = '#a9b8cb', { length, height, thickness } = WALL;
  const panel = (x0: number, x1: number, y0: number, y1: number) => block(wall, [x1 - x0, y1 - y0, thickness], [(x0 + x1) / 2, (y0 + y1) / 2, 0], surface, 'wall-panel');
  if (variant === 'solid') panel(-length / 2, length / 2, 0, height);
  else {
    const { width, bottom, top } = OPENINGS[variant], half = width / 2;
    panel(-length / 2, -half, 0, height); panel(half, length / 2, 0, height); panel(-half, half, top, height);
    if (bottom > 0) panel(-half, half, 0, bottom);
    for (const x of [-half - .03, half + .03]) block(wall, [.06, top - bottom, thickness + .04], [x, (top + bottom) / 2, 0], trim, 'wall-trim');
    block(wall, [width + .12, .06, thickness + .04], [0, top + .03, 0], trim, 'wall-trim');
    if (variant === 'window') {
      block(wall, [width + .16, .05, thickness + .1], [0, bottom - .025, 0], trim, 'wall-trim');
      block(wall, [width, top - bottom, .03], [0, (top + bottom) / 2, 0], '#a9cbe8', 'wall-glass', { opacity: .45, roughness: .1 });
      block(wall, [.04, top - bottom, .05], [0, (top + bottom) / 2, 0], trim, 'wall-trim');
    }
    anchor(wall, 'opening', [0, bottom, 0]);
  }
  block(wall, [length + .02, .05, thickness + .04], [0, height + .025, 0], trim, 'wall-cap', { bevel: .01 });
  // Skirting board on both faces, interrupted by a door opening.
  const skirting = variant === 'door' ? [[-length / 2, -OPENINGS.door.width / 2 - .06], [OPENINGS.door.width / 2 + .06, length / 2]] : [[-length / 2, length / 2]];
  for (const [x0, x1] of skirting) block(wall, [x1 - x0, .1, thickness + .03], [(x0 + x1) / 2, .05, 0], trim, 'wall-skirting');
  anchor(wall, 'start', [-length / 2, 0, 0]); anchor(wall, 'end', [length / 2, 0, 0]);
  return wall;
}

/** Bottom of the 42-unit mounting rail, where the first rack-mounted unit's `mount` rests. Decorative count units are separate. */
export const CABINET_RAIL = [0, .14, .034] as const;
/** Open-front rack; `count` mounts 0–12 units from the bottom. Activity LEDs are decorative; localMotion controls their animation. */
export function createEquipmentCabinet(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  if (node.variant !== undefined && node.variant !== 'detailed' && node.variant !== 'overview') throw new Error(`Unknown equipment cabinet variant: ${node.variant}.`);
  if (node.variant === 'overview') return createOverviewCabinet(node, context);
  const p = resolveLabPalette(node, context);
  const cabinet = new THREE.Group(); cabinet.name = 'equipment-cabinet';
  const activity: ActivityLed[] = [];
  const frame = node.materials?.structure ?? node.color ?? p.structure;
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['equipment-cabinet']);
  for (const x of [-.4, .4]) for (const z of [-.42, .42]) block(cabinet, [.06, .06, .06], [x, .03, z], '#273545', 'cabinet-foot');
  for (const x of [-.4, .4]) block(cabinet, [.06, 2.04, .9], [x, 1.08, 0], frame, 'cabinet-side', { metalness: .25, roughness: .5 });
  block(cabinet, [.86, .06, .9], [0, .09, 0], frame, 'cabinet-frame'); block(cabinet, [.86, .06, .9], [0, 2.13, 0], frame, 'cabinet-frame');
  block(cabinet, [.74, 1.98, .04], [0, 1.11, -.43], p.screen, 'cabinet-back');
  block(cabinet, [.62, 1.25, .008], [0, 1.25, -.452], p.structure, 'cabinet-exhaust-panel');
  for (const y of [.76, .94, 1.12, 1.3, 1.48, 1.66, 1.84]) block(cabinet, [.52, .018, .008], [0, y, -.46], p.trim, 'cabinet-exhaust-louver');
  for (const x of [-.18, .18]) {
    block(cabinet, [.29, .27, .008], [x, .36, -.452], p.surface, 'cabinet-rear-psu');
    block(cabinet, [.16, .03, .012], [x, .36, -.46], p.trim, 'cabinet-psu-handle');
  }
  for (const x of [-.24, -.12, 0, .12, .24]) block(cabinet, [.035, .004, .58], [x, 2.162, 0], p.screen, 'cabinet-roof-vent');
  for (const x of [-.34, .34]) {
    block(cabinet, [.04, 1.98, .03], [x, 1.11, .4], p.trim, 'cabinet-rail');
    for (const y of [.25, .8, 1.35, 1.9]) block(cabinet, [.012, .014, .004], [x, y, .418], p.screen, 'cabinet-rail-hole');
  }
  block(cabinet, [.74, .1, .02], [0, 2.04, .44], p.screen, 'cabinet-header');
  for (let i = 0; i < count; i++) {
    const unit = new THREE.Group(); unit.name = `count-part-${i}`; unit.position.set(0, .22 + i * .155, 0); cabinet.add(unit);
    block(unit, [.66, .13, .8], [0, 0, 0], p.surface, 'cabinet-unit');
    block(unit, [.5, .07, .01], [-.04, 0, .405], p.screen, 'cabinet-unit-vent');
    for (const x of [-.22, -.1, .02, .14]) block(unit, [.008, .056, .012], [x, 0, .408], p.trim, 'cabinet-drive-divider');
    const y = unit.position.y;
    for (const x of [-.26, -.14, -.02, .1]) activity.push({ position: [x, y - .02, .418], activity: true }, { position: [x + .03, y - .02, .418], activity: false });
    for (const x of [.15, .25]) activity.push({ position: [x, y + .02, -.46], activity: true }, { position: [x + .03, y + .02, -.46], activity: false });
  }
  anchor(cabinet, 'front', [0, 0, .45]);
  anchor(cabinet, 'rear', [0, 0, -.45]); anchor(cabinet, 'top', [0, 2.16, 0]); anchor(cabinet, 'rail', CABINET_RAIL);
  addActivityLeds(cabinet, node, activity, p.normal, [.018, .012, .006], 'cabinet-activity-led');
  return cabinet;
}

/** Same count slots and exterior envelope with fewer structural meshes for facility overviews. */
function createOverviewCabinet(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette(node, context), group = new THREE.Group(); group.name = 'equipment-cabinet-overview';
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['equipment-cabinet']), frame = node.materials?.structure ?? node.color ?? p.structure;
  const activity: ActivityLed[] = [];
  for (const x of [-.4, .4]) block(group, [.06, 2.16, .9], [x, 1.08, 0], frame, 'cabinet-side');
  block(group, [.86, .12, .9], [0, .06, 0], frame, 'cabinet-base');
  block(group, [.86, .064, .9], [0, 2.132, 0], frame, 'cabinet-roof');
  block(group, [.74, 1.98, .04], [0, 1.11, -.43], p.screen, 'cabinet-back');
  block(group, [.74, .06, .012], [0, .09, -.46], p.trim, 'cabinet-rear-trim');
  block(group, [.74, .1, .02], [0, 2.04, .44], p.screen, 'cabinet-header');
  for (let i = 0; i < count; i++) {
    const y = .22 + i * .155, unit = new THREE.Group(); unit.name = `count-part-${i}`; unit.position.y = y; group.add(unit);
    block(unit, [.66, .13, .8], [0, 0, 0], p.surface, 'cabinet-unit');
    for (const x of [-.26, -.14, -.02, .1]) activity.push({ position: [x, y - .02, .418], activity: true }, { position: [x + .03, y - .02, .418], activity: false });
    for (const x of [.15, .25]) activity.push({ position: [x, y + .02, -.46], activity: true }, { position: [x + .03, y + .02, -.46], activity: false });
  }
  addActivityLeds(group, node, activity, p.normal, [.018, .012, .006], 'cabinet-activity-led');
  anchor(group, 'front', [0, 0, .45]); anchor(group, 'rear', [0, 0, -.45]); anchor(group, 'top', [0, 2.16, 0]); anchor(group, 'rail', CABINET_RAIL);
  return group;
}

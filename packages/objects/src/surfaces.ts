import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import { resolveFootprint, validateMaterialOverrides, type AssetNode, type Footprint, type FootprintDefinition, type MaterialPalette } from '@opsorama/core';
import { cropFieldFootprint } from './farm';
import { LAB_PALETTES } from './laboratory';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, part } from './parts';

export const ROAD_VARIANTS = Object.freeze(['straight', 'crosswalk', 'corner', 't-junction', 'crossroads'] as const);
export const SIDEWALK_VARIANTS = Object.freeze(['straight', 'corner'] as const);
export const FLOOR_FINISHES = Object.freeze(['concrete', 'tiles', 'wood', 'epoxy', 'carpet'] as const);
export const TERRAIN_FINISHES = Object.freeze(['grass', 'gravel', 'pavers', 'asphalt', 'parking'] as const);
export type RoadVariant = typeof ROAD_VARIANTS[number];
export type SidewalkVariant = typeof SIDEWALK_VARIANTS[number];
export type FloorFinish = typeof FLOOR_FINISHES[number];
export type TerrainFinish = typeof TERRAIN_FINISHES[number];

/**
 * Walkable top heights in metres. The Ground primitive's top is -0.04. Terrain sits just below floors and roads,
 * so those can overlap it without z-fighting; sidewalks are raised by their curb. Place objects on a surface at its level.
 */
export const SURFACE_LEVELS = Object.freeze({ ground: -.04, terrain: -.01, floor: 0, road: 0, sidewalk: .12 });
/** Road tiles are square modules; chain them by placing neighbours one module apart. */
export const ROAD_MODULE = 6;
export const PARKING_BAY = Object.freeze({ width: 2.5, depth: 5 });

const size = (width: number, depth: number) => Object.freeze([width, depth] as const) as Footprint;
export const assetFootprintDefinitions: Readonly<Record<string, FootprintDefinition>> = Object.freeze({
  floor: Object.freeze({ min: size(1, 1), max: size(100, 100), default: size(6, 6) }),
  terrain: Object.freeze({ min: size(1, 1), max: size(100, 100), default: size(8, 8), variantDefaults: Object.freeze({ parking: size(10, 5) }) }),
  sidewalk: Object.freeze({ min: size(1, 1), max: size(100, 6), default: size(6, 2), variantDefaults: Object.freeze({ corner: size(2, 2) }) }),
  'crop-field': cropFieldFootprint,
});

/** Material-specific base tones per theme; `color` replaces the base tone. Concrete and sidewalk paving inherit the `surface` role instead. */
const TONES = {
  asphalt: ['#6c7888', '#2e3a4b'], tiles: ['#e8ecf1', '#5d6d81'], wood: ['#c8a27c', '#7b6450'], epoxy: ['#a9bccb', '#47596f'], carpet: ['#8d9cc2', '#414e70'],
  grass: ['#9fca9b', '#3f6b56'], gravel: ['#cbc4b7', '#6d685f'], pavers: ['#d4c8bb', '#6f675f'],
} as const satisfies Record<string, readonly [string, string]>;
/** Default light-theme base tone for each surface variant, for documentation color pickers. */
export const surfaceVariantTones: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  road: Object.fromEntries(ROAD_VARIANTS.map(variant => [variant, TONES.asphalt[0]])),
  sidewalk: Object.fromEntries(SIDEWALK_VARIANTS.map(variant => [variant, LAB_PALETTES.light.surface])),
  floor: Object.fromEntries(FLOOR_FINISHES.map(finish => [finish, finish === 'concrete' ? LAB_PALETTES.light.surface : TONES[finish][0]])),
  terrain: Object.fromEntries(TERRAIN_FINISHES.map(finish => [finish, TONES[finish === 'parking' ? 'asphalt' : finish][0]])),
});

type Rect = readonly [x: number, z: number, width: number, depth: number, angle?: number];
const JOINT = .002, MARK = .004, EPSILON = 1e-6;

function palette(node: AssetNode, context?: MaterialContext): MaterialPalette {
  if (node.materials !== undefined) validateMaterialOverrides(node.materials);
  if (context?.palette !== undefined) validateMaterialOverrides(context.palette);
  return { ...LAB_PALETTES[context?.theme ?? 'light'], ...context?.palette, ...node.materials };
}
const tone = (key: keyof typeof TONES, context?: MaterialContext) => TONES[key][context?.theme === 'midnight' ? 1 : 0];
const shade = (color: string, factor: number) => `#${new THREE.Color(color).multiplyScalar(factor).getHexString()}`;
const tint = (color: string, amount: number) => `#${new THREE.Color(color).lerp(new THREE.Color('#ffffff'), amount).getHexString()}`;
function variantOf<T extends string>(node: AssetNode, values: readonly T[], label: string): T {
  const variant = node.variant ?? values[0];
  if (!values.includes(variant as T)) throw new Error(`Unknown ${label}: ${node.variant}.`);
  return variant as T;
}

/** A flat box whose top face is the walkable level; flat parts receive but never cast shadows. */
function slab(group: THREE.Object3D, [width, depth]: Footprint, top: number, thickness: number, color: string, name: string, offset: readonly [number, number] = [0, 0], roughness = .9): THREE.Mesh {
  const mesh = block(group, [width, thickness, depth], [offset[0], top - thickness / 2, offset[1]], color, name, { roughness }); mesh.castShadow = false; return mesh;
}
/** One merged mesh of flat rectangles (markings, stones, patches); decorative, so it never intercepts picking. */
function marks(group: THREE.Object3D, rects: readonly Rect[], y: number, color: string, name: string, roughness = .6): void {
  if (!rects.length) return;
  const positions: number[] = [], indices: number[] = [];
  for (const [x, z, width, depth, angle = 0] of rects) {
    const cos = Math.cos(angle), sin = Math.sin(angle), offset = positions.length / 3;
    for (const [u, v] of [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]) positions.push(x + u * cos - v * sin, y, z + u * sin + v * cos);
    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = part(group, geometry, color, name, { roughness }); mesh.castShadow = false; mesh.raycast = () => {};
}
/** One-pixel joint lines as a single LineSegments object; segments are flat [x1, z1, x2, z2] quadruples. */
function joints(group: THREE.Object3D, segments: readonly number[], y: number, color: string, name: string): void {
  if (!segments.length) return;
  const positions: number[] = [];
  for (let i = 0; i < segments.length; i += 4) positions.push(segments[i], y, segments[i + 1], segments[i + 2], y, segments[i + 3]);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color })); lines.name = name; lines.raycast = () => {}; group.add(lines);
}
/** Interior grid joints measured from the −x/−z edges, so pattern size never depends on the footprint. */
function grid([width, depth]: Footprint, stepX: number, stepZ: number, [ox, oz]: readonly [number, number] = [0, 0]): number[] {
  const segments: number[] = [];
  for (let i = 1; i * stepX < width - EPSILON; i++) segments.push(ox - width / 2 + i * stepX, oz - depth / 2, ox - width / 2 + i * stepX, oz + depth / 2);
  for (let i = 1; i * stepZ < depth - EPSILON; i++) segments.push(ox - width / 2, oz - depth / 2 + i * stepZ, ox + width / 2, oz - depth / 2 + i * stepZ);
  return segments;
}
/** Rows along x with staggered end joints; very large areas keep only the row joints to bound vertex count. */
export const RUNNING_BOND_SEAM_LIMIT = 12000;
function runningBond([width, depth]: Footprint, row: number, length: number, stagger: number): number[] {
  const segments: number[] = [], rows = Math.ceil(depth / row - EPSILON);
  for (let r = 1; r * row < depth - EPSILON; r++) segments.push(-width / 2, -depth / 2 + r * row, width / 2, -depth / 2 + r * row);
  if (rows * Math.ceil(width / length) > RUNNING_BOND_SEAM_LIMIT) return segments;
  for (let r = 0; r < rows; r++) {
    const z0 = -depth / 2 + r * row, z1 = Math.min(depth / 2, z0 + row), start = (r % stagger) * length / stagger;
    for (let x = -width / 2 + (start || length); x < width / 2 - EPSILON; x += length) segments.push(x, z0, x, z1);
  }
  return segments;
}
/** Deterministic per-node pseudo-random generator; the same node always renders the same pattern. */
function random(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** One non-overlapping item per jittered grid cell (no coplanar overlap), sampled down to `limit` items. */
function scatter([width, depth]: Footprint, cell: number, min: number, max: number, tones: number, limit: number, seed: string): Rect[][] {
  const next = random(seed), columns = Math.floor(width / cell), rows = Math.floor(depth / cell), result: Rect[][] = Array.from({ length: tones }, () => []);
  const keep = Math.min(1, limit / Math.max(1, columns * rows));
  for (let c = 0; c < columns; c++) for (let r = 0; r < rows; r++) {
    if (next() > keep) continue;
    const extent = min + next() * (max - min), slack = Math.max(0, (cell - extent * Math.SQRT2) / 2);
    const x = -columns * cell / 2 + (c + .5) * cell + (next() * 2 - 1) * slack, z = -rows * cell / 2 + (r + .5) * cell + (next() * 2 - 1) * slack;
    result[Math.floor(next() * tones)].push([x, z, extent, extent * (.6 + next() * .4), next() * Math.PI]);
  }
  return result;
}
function finish(group: THREE.Group, level: number): THREE.Group {
  const bounds = new THREE.Box3().setFromObject(group);
  group.userData.surfaceLevel = level;
  group.userData.surfaceBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  return group;
}

/** A 6 × 6 m two-lane tile running along x. Open edges carry `start`/`end` (±x) and `branch-front`/`branch-back` (±z) anchors. */
export function createRoad(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ROAD_VARIANTS, 'road variant'), p = palette(node, context);
  const group = new THREE.Group(); group.name = `road-${variant}`;
  const half = ROAD_MODULE / 2, line = .12, edge = half - .25, inner = edge + line / 2, level = SURFACE_LEVELS.road;
  slab(group, [ROAD_MODULE, ROAD_MODULE], level, .04, resolveObjectColor(node, context, 'surface', tone('asphalt', context)), 'road-surface');
  const rects: Rect[] = [];
  const along = (z: number, from: number, to: number) => rects.push([(from + to) / 2, z, to - from, line]);
  const across = (x: number, from: number, to: number) => rects.push([x, (from + to) / 2, line, to - from]);
  // Short edge pieces at a tile corner continue the edge lines of the neighbouring tiles.
  const corner = (sx: number, sz: number) => { along(sz * edge, sx > 0 ? edge - line / 2 : -half, sx > 0 ? half : -edge + line / 2); across(sx * edge, sz > 0 ? inner : -half, sz > 0 ? half : -inner); };
  // Dashes are 1.5 m with 1.5 m gaps, aligned so chained tiles continue the rhythm.
  if (variant === 'straight' || variant === 't-junction') for (const x of [-1.5, 1.5]) along(0, x - .75, x + .75);
  if (variant === 'crosswalk') {
    for (const x of [-1.875, 1.875]) along(0, x - .375, x + .375);
    for (const z of [-2, -1, 0, 1, 2]) rects.push([0, z, 2.4, .5]);
  }
  if (variant === 'straight' || variant === 'crosswalk') { along(edge, -half, half); along(-edge, -half, half); }
  if (variant === 't-junction') { along(-edge, -half, half); corner(-1, 1); corner(1, 1); }
  if (variant === 'crossroads') for (const sx of [-1, 1]) for (const sz of [-1, 1]) corner(sx, sz);
  if (variant === 'corner') {
    along(0, -2.25, -.75); across(0, .75, 2.25);
    along(-edge, -half, inner); across(edge, -edge + line / 2, half); corner(-1, 1);
  }
  marks(group, rects, level + MARK, p.text, 'road-marking', .5);
  anchor(group, 'start', [-half, level, 0]);
  if (variant !== 'corner') anchor(group, 'end', [half, level, 0]);
  if (variant === 'corner' || variant === 't-junction' || variant === 'crossroads') anchor(group, 'branch-front', [0, level, half]);
  if (variant === 'crossroads') anchor(group, 'branch-back', [0, level, -half]);
  if (variant === 'crosswalk') { anchor(group, 'crossing-front', [0, level, half]); anchor(group, 'crossing-back', [0, level, -half]); }
  return finish(group, level);
}

/** Raised paving with a curb along the road-facing +z edge; the corner piece adds a curb along +x. */
export function createSidewalk(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, SIDEWALK_VARIANTS, 'sidewalk variant'), p = palette(node, context);
  const [width, depth] = resolveFootprint(node, assetFootprintDefinitions.sidewalk), curb = .15, level = SURFACE_LEVELS.sidewalk, thickness = level + .04;
  const group = new THREE.Group(); group.name = `sidewalk-${variant}`;
  const right = variant === 'corner' ? curb : 0, paving = [width - right, depth - curb] as const, offset = [-right / 2, -curb / 2] as const, base = resolveObjectColor(node, context, 'surface', p.surface);
  slab(group, paving, level, thickness, base, 'sidewalk-paving', offset);
  slab(group, [width, curb], level, thickness, p.trim, 'sidewalk-curb', [0, depth / 2 - curb / 2], .75);
  if (right) slab(group, [curb, depth - curb], level, thickness, p.trim, 'sidewalk-curb', [width / 2 - curb / 2, -curb / 2], .75);
  joints(group, grid(paving, 1, 1, offset), level + JOINT, shade(base, .8), 'sidewalk-joint');
  anchor(group, 'top', [offset[0], level, offset[1]]); anchor(group, 'curb', [0, 0, depth / 2]);
  if (variant === 'straight') { anchor(group, 'start', [-width / 2, 0, 0]); anchor(group, 'end', [width / 2, 0, 0]); }
  return finish(group, level);
}

/** Sized indoor finish with true-scale joints: 3 m saw cuts, 0.6 m tiles, 0.2 × 1.8 m planks, an epoxy walkway outline or 0.5 m carpet tiles. */
export function createFloor(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const finishType = variantOf(node, FLOOR_FINISHES, 'floor finish'), p = palette(node, context), footprint = resolveFootprint(node, assetFootprintDefinitions.floor);
  const group = new THREE.Group(); group.name = `floor-${finishType}`;
  const level = SURFACE_LEVELS.floor, base = resolveObjectColor(node, context, 'surface', finishType === 'concrete' ? p.surface : tone(finishType, context)), y = level + JOINT;
  slab(group, footprint, level, .04, base, 'floor-surface', [0, 0], ({ concrete: .9, tiles: .45, wood: .7, epoxy: .3, carpet: 1 } as const)[finishType]);
  if (finishType === 'concrete') joints(group, grid(footprint, 3, 3), y, shade(base, .84), 'floor-joint');
  if (finishType === 'tiles') joints(group, grid(footprint, .6, .6), y, shade(base, .8), 'floor-joint');
  if (finishType === 'wood') joints(group, runningBond(footprint, .2, 1.8, 3), y, shade(base, .76), 'floor-joint');
  if (finishType === 'carpet') joints(group, grid(footprint, .5, .5), y, shade(base, .9), 'floor-joint');
  if (finishType === 'epoxy') {
    // Decorative walkway outline 0.4 m inside the edge; it marks no route, zone or restriction.
    const [width, depth] = footprint, inset = .4, line = .1, w = width / 2 - inset, d = depth / 2 - inset;
    if (w > line && d > line) marks(group, [[0, d, 2 * w, line], [0, -d, 2 * w, line], [w, 0, line, 2 * d - line], [-w, 0, line, 2 * d - line]], level + MARK, p.accent, 'floor-marking', .4);
  }
  return finish(group, level);
}

/** Sized outdoor cover: grass or gravel patterns, 0.6 × 0.3 m pavers, plain asphalt, or 2.5 × 5 m parking bays with `bay-*` anchors. */
export function createTerrain(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const finishType = variantOf(node, TERRAIN_FINISHES, 'terrain finish'), p = palette(node, context), footprint = resolveFootprint(node, assetFootprintDefinitions.terrain);
  const group = new THREE.Group(); group.name = `terrain-${finishType}`;
  const [width, depth] = footprint, level = SURFACE_LEVELS.terrain, base = resolveObjectColor(node, context, 'surface', tone(finishType === 'parking' ? 'asphalt' : finishType, context)), y = level + MARK, seed = `${node.id}:${finishType}`;
  slab(group, footprint, level, .03, base, 'terrain-surface', [0, 0], finishType === 'asphalt' || finishType === 'parking' ? .85 : 1);
  if (finishType === 'grass') scatter(footprint, 1.6, .5, 1.1, 2, 1600, seed).forEach((rects, i) => marks(group, rects, y, i ? tint(base, .1) : shade(base, .88), 'terrain-detail', 1));
  if (finishType === 'gravel') scatter(footprint, .3, .08, .2, 2, 3000, seed).forEach((rects, i) => marks(group, rects, y, i ? tint(base, .3) : shade(base, .75), 'terrain-detail', 1));
  if (finishType === 'pavers') joints(group, runningBond(footprint, .3, .6, 2), level + JOINT, shade(base, .78), 'terrain-joint');
  if (finishType === 'parking') {
    // Bays along the back edge, plus a facing row when an aisle fits; bay count follows the footprint and encodes no occupancy.
    const columns = Math.floor(width / PARKING_BAY.width + EPSILON), bay = Math.min(PARKING_BAY.depth, depth), rows = depth >= 2 * PARKING_BAY.depth + 6 ? [-1, 1] : [-1], rects: Rect[] = [];
    let index = 0;
    for (const side of rows) {
      const z = side * (depth / 2 - bay / 2);
      for (let c = 0; c <= columns; c++) rects.push([Math.max(.05 - width / 2, Math.min(width / 2 - .05, (c - columns / 2) * PARKING_BAY.width)), z, .1, bay - .2]);
      for (let c = 0; c < columns; c++) { const point = anchor(group, `bay-${index++}`, [(c + .5 - columns / 2) * PARKING_BAY.width, 0, z]); if (side > 0) point.rotation.y = Math.PI; }
    }
    marks(group, rects, y, p.text, 'terrain-marking', .5);
  }
  return finish(group, level);
}

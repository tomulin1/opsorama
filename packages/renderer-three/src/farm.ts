import { validateOperatingProperties } from '@opsorama/core';
import * as THREE from 'three';
import { resolveFootprint, type AssetNode, type FootprintDefinition } from '@opsorama/core';
import type { MaterialContext } from './laboratory';
import { objectPalette } from './object-palette';
import { anchor, block, merged, part } from './parts';
import { variantOf } from './kit';

export type BarnVariant = 'closed' | 'open';
export type PaddockFenceVariant = 'rail' | 'gate' | 'gate-open';
export type HayBaleVariant = 'round' | 'square';
export type TroughVariant = 'water' | 'feed';
export type ChickenCoopVariant = 'open' | 'closed';
/** Growth stage of a crop field, from bare soil to stubble. */
export const CROP_STAGES = ['plowed', 'sprouting', 'growing', 'ripe', 'harvested'] as const;
export type CropStage = typeof CROP_STAGES[number];
/** Stage of a field node without a variant. */
export const CROP_DEFAULT_STAGE: CropStage = 'growing';

type Vec = readonly [number, number, number];
/** Natural tones that no palette role changes. */
const DARK = '#2b2522', GRAIN = '#d8b456', STUBBLE = '#c9b27a';
const shade = (color: string, amount: number) => `#${new THREE.Color(color).multiplyScalar(amount).getHexString()}`;
/** Box geometry between two points in the x/y plane at depth z, for braces and roof slopes. */
function slab(a: readonly [number, number], b: readonly [number, number], thickness: number, depth: number, z = 0): THREE.BufferGeometry {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return new THREE.BoxGeometry(length, thickness, depth).rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0])).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
}
/** Shifts every part so the bounds centre over the pivot in x and z; anchors move with the parts. */
function centred(group: THREE.Group): THREE.Group {
  const box = new THREE.Box3().setFromObject(group), x = (box.min.x + box.max.x) / 2, z = (box.min.z + box.max.z) / 2;
  for (const child of group.children) { child.position.x -= x; child.position.z -= z; }
  return group;
}

export const BARN = Object.freeze({ width: 10, depth: 14, eave: 4.2, knee: [3.6, 6.6] as const, ridge: 7.8, door: [4, 4] as const });
const BARN_TONES = { surface: '#a63a2e', trim: '#f2efe8', structure: '#4b4f57', glass: '#c3d4e2' } as const;
/**
 * Gambrel-roof barn, 10 × 14 m with the gable and its 4 m sliding doors facing +z, a hayloft door, side windows, white
 * corner and door trim and a ridge cupola. `open` slides the doors aside onto a dark interior; the interior is not
 * modelled. Static. Color changes the walls and doors.
 */
export function createBarn(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['closed', 'open'] as const, 'barn'), p = objectPalette(node, context, 'surface', BARN_TONES);
  const { width: W, depth: D, eave, knee, ridge, door } = BARN, half = W / 2, barn = new THREE.Group(); barn.name = `barn-${variant}`;
  block(barn, [W + .3, .2, D + .3], [0, .1, 0], '#9ea3a8', 'barn-plinth');
  const profile = (notch: boolean) => {
    const points: [number, number][] = [[-half, 0], ...(notch ? [[-door[0] / 2, 0], [-door[0] / 2, door[1]], [door[0] / 2, door[1]], [door[0] / 2, 0]] as [number, number][] : []), [half, 0], [half, eave], [knee[0], knee[1]], [0, ridge], [-knee[0], knee[1]], [-half, eave]];
    return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  };
  merged(barn, [
    new THREE.ExtrudeGeometry(profile(true), { depth: .2, bevelEnabled: false }).translate(0, .2, D / 2 - .2),
    new THREE.ExtrudeGeometry(profile(false), { depth: .2, bevelEnabled: false }).translate(0, .2, -D / 2),
    ...[-1, 1].map(s => new THREE.BoxGeometry(.2, eave, D - .4).translate(s * (half - .1), .2 + eave / 2, 0)),
  ], p.surface, 'barn-wall', { roughness: .8 });
  // Gambrel roof: a steep lower and a shallow upper slope per side, overhanging both gables.
  merged(barn, [-1, 1].flatMap(s => [slab([s * (half + .3), eave + .05], [s * knee[0], knee[1] + .2], .16, D + .6), slab([s * knee[0], knee[1] + .2], [0, ridge + .26], .16, D + .6)]), p.structure, 'barn-roof', { roughness: .6 });
  // White trim: corner boards, eave fascia over the gables and the door frame.
  merged(barn, [
    ...[-1, 1].flatMap(sx => [-1, 1].map(sz => new THREE.BoxGeometry(.24, eave, .24).translate(sx * (half - .02), .2 + eave / 2, sz * (D / 2 - .02)))),
    ...[-1, 1].flatMap(sz => [-1, 1].flatMap(sx => [slab([sx * half, eave + .2], [sx * knee[0], knee[1] + .2], .16, .1, sz * (D / 2 + .01)), slab([sx * knee[0], knee[1] + .2], [0, ridge + .2], .16, .1, sz * (D / 2 + .01))])),
    new THREE.BoxGeometry(door[0] + .3, .2, .14).translate(0, door[1] + .3, D / 2 + .02), ...[-1, 1].map(s => new THREE.BoxGeometry(.15, door[1], .14).translate(s * (door[0] / 2 + .08), .2 + door[1] / 2, D / 2 + .02)),
  ], p.trim, 'barn-trim', { roughness: .6 });
  // Hayloft door and side windows.
  block(barn, [1.6, 1.5, .08], [0, 5.55, D / 2 + .03], p.surface, 'barn-loft-door', { roughness: .8 });
  merged(barn, [slab([-.8, 4.8], [.8, 6.3], .1, .1, D / 2 + .08), slab([-.8, 6.3], [.8, 4.8], .1, .1, D / 2 + .08), new THREE.BoxGeometry(1.8, .12, .1).translate(0, 4.75, D / 2 + .08), new THREE.BoxGeometry(1.8, .12, .1).translate(0, 6.35, D / 2 + .08)], p.trim, 'barn-trim');
  merged(barn, [-1, 1].flatMap(s => [-4, 0, 4].map(z => new THREE.BoxGeometry(.06, .9, 1.2).translate(s * (half + .01), 2.6, z))), p.glass, 'barn-window', { roughness: .2 });
  // Sliding door leaves with X braces; open slides them beside the opening onto a dark interior.
  const open = variant === 'open', leaves = new THREE.Group(); leaves.name = 'barn-doors'; barn.add(leaves);
  if (open) block(barn, [door[0], door[1], .05], [0, .2 + door[1] / 2, D / 2 - .25], DARK, 'barn-interior');
  for (const s of [-1, 1]) {
    const x = s * (open ? door[0] * .75 + .1 : door[0] / 4);
    block(leaves, [door[0] / 2, door[1], .08], [x, .2 + door[1] / 2, D / 2 + .12], p.surface, 'barn-door', { roughness: .8 });
    merged(leaves, [slab([x - door[0] / 4 + .1, .4], [x + door[0] / 4 - .1, door[1]], .1, .06, D / 2 + .18), slab([x - door[0] / 4 + .1, door[1]], [x + door[0] / 4 - .1, .4], .1, .06, D / 2 + .18)], p.trim, 'barn-door-brace');
  }
  block(barn, [door[0] * 2 + .4, .1, .1], [0, door[1] + .45, D / 2 + .15], p.structure, 'barn-door-rail');
  // Ridge cupola.
  block(barn, [1, 1, 1], [0, ridge + .7, 0], p.trim, 'barn-cupola', { roughness: .6 });
  merged(barn, [slab([-.75, ridge + 1.15], [0, ridge + 1.6], .08, 1.3), slab([0, ridge + 1.6], [.75, ridge + 1.15], .08, 1.3)], p.structure, 'barn-cupola-roof');
  anchor(barn, 'door', [0, 0, D / 2 + .6]); anchor(barn, 'loft', [0, 5.55, D / 2 + .1]); anchor(barn, 'top', [0, ridge + 1.8, 0]);
  return barn;
}

export const PADDOCK_FENCE = Object.freeze({ span: 3, height: 1.3, gate: 2.6 });
const FENCE_TONES = { wood: '#9b7653', structure: '#5f6670' } as const;
/**
 * Wooden post-and-rail paddock fence spanning x −1.5…1.5 m with three rails on the +z face, like `fence-segment`.
 * `gate` hangs a five-bar field gate between the posts, hinged at −x; `gate-open` swings it 90° toward +z. Start and
 * end anchors chain segments; `opening` marks the gateway. Static. Color changes the posts, rails and gate.
 */
export function createPaddockFence(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['rail', 'gate', 'gate-open'] as const, 'paddock fence'), p = objectPalette(node, context, 'wood', FENCE_TONES);
  const { span, height, gate: G } = PADDOCK_FENCE, half = span / 2, fence = new THREE.Group(); fence.name = `paddock-fence-${variant}`;
  merged(fence, [-1, 1].flatMap(s => [new THREE.BoxGeometry(.13, height, .13).translate(s * half, height / 2, 0), new THREE.ConeGeometry(.095, .1, 4).rotateY(Math.PI / 4).translate(s * half, height + .05, 0)]), p.wood, 'fence-post', { roughness: .9 });
  if (variant === 'rail') {
    merged(fence, [.45, .8, 1.15].map(y => new THREE.BoxGeometry(span, .14, .04).translate(0, y, .07)), p.wood, 'fence-rail', { roughness: .9 });
  } else {
    // Five bars and a diagonal brace, hinged on the −x post; hinges and latch are metal.
    const leaf = new THREE.Group(); leaf.name = 'fence-gate'; leaf.position.set(-half + .15, 0, .02); fence.add(leaf);
    merged(leaf, [
      ...[.25, .45, .65, .85, 1.05].map(y => new THREE.BoxGeometry(G, .09, .04).translate(G / 2, y, 0)),
      ...[.05, G - .05].map(x => new THREE.BoxGeometry(.1, 1, .05).translate(x, .65, 0)), slab([.1, .3], [G - .1, 1.03], .08, .04),
    ], p.wood, 'fence-gate-bar', { roughness: .9 });
    merged(leaf, [...[.35, .95].map(y => new THREE.BoxGeometry(.16, .05, .06).translate(.02, y, 0)), new THREE.BoxGeometry(.12, .06, .07).translate(G - .02, .85, 0)], p.structure, 'fence-gate-hardware', { metalness: .3, roughness: .5 });
    if (variant === 'gate-open') leaf.rotation.y = -Math.PI / 2;
    anchor(fence, 'opening', [0, 0, 0]);
  }
  anchor(fence, 'start', [-half, 0, 0]); anchor(fence, 'end', [half, 0, 0]);
  return fence;
}

const BALE_TONES = { surface: '#d6b25e', trim: '#efe7d2' } as const;
/**
 * Hay or straw bale. `round` is a 1.5 m bale lying on its side, axis along x, with net wrap bands and spiral ends;
 * `square` is a 2.4 × 1.2 × 0.9 m large square bale along z, tied with twine. Static. Color changes the hay.
 */
export function createHayBale(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['round', 'square'] as const, 'hay bale'), p = objectPalette(node, context, 'surface', BALE_TONES);
  const bale = new THREE.Group(); bale.name = `hay-bale-${variant}`;
  if (variant === 'round') {
    const r = .75, w = 1.2;
    part(bale, new THREE.CylinderGeometry(r, r, w, 28).rotateZ(Math.PI / 2).translate(0, r, 0), p.surface, 'bale-hay', { roughness: 1 });
    merged(bale, [-.42, 0, .42].map(x => new THREE.CylinderGeometry(r + .006, r + .006, .12, 28, 1, true).rotateZ(Math.PI / 2).translate(x, r, 0)), p.trim, 'bale-wrap', { roughness: .8 });
    merged(bale, [-1, 1].flatMap(s => [.18, .36, .54].map(ring => new THREE.TorusGeometry(ring, .012, 4, 28).rotateY(Math.PI / 2).translate(s * (w / 2 + .002), r, 0))), shade(p.surface, .78), 'bale-spiral', { roughness: 1 });
    anchor(bale, 'top', [0, 2 * r, 0]);
  } else {
    block(bale, [1.2, .9, 2.4], [0, .45, 0], p.surface, 'bale-hay', { bevel: .06, roughness: 1 });
    merged(bale, [-.75, -.25, .25, .75].flatMap(z => [new THREE.BoxGeometry(1.22, .015, .025).translate(0, .906, z), ...[-1, 1].map(s => new THREE.BoxGeometry(.015, .9, .025).translate(s * .606, .45, z))]), p.trim, 'bale-twine');
    anchor(bale, 'top', [0, .9, 0]);
  }
  return bale;
}

const WATER_TROUGH_TONES = { structure: '#aab5be', trim: '#d6dde3', liquid: '#5a9fc4' } as const;
const FEED_TROUGH_TONES = { structure: '#8c6a4a', trim: '#6e5038', surface: '#c9a35a' } as const;
/**
 * Livestock trough, 2.4 m along x with animals drinking or eating from either long side (±z). `water` is an oval
 * galvanised stock tank with a float-valve box at +x; `feed` is a wooden trough on legs filled with feed. fillLevel (0–1, default 1) sets the visible contents; zero is empty. Static. Color changes the
 * tank or trough body.
 */
export function createTrough(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  validateOperatingProperties(node);
  const variant = variantOf(node, ['water', 'feed'] as const, 'trough'), p = objectPalette(node, context, 'structure', variant === 'water' ? WATER_TROUGH_TONES : FEED_TROUGH_TONES);
  const level = node.fillLevel ?? 1, empty = level === 0, trough = new THREE.Group(); trough.name = `trough-${variant}`;
  if (variant === 'water') {
    // Oval tank: a unit circle stretched to 2.4 × 1.0 m.
    const oval = (geometry: THREE.BufferGeometry) => geometry.scale(1.2, 1, .5);
    (part(trough, oval(new THREE.CylinderGeometry(1, 1, .6, 32, 1, true).translate(0, .3, 0)), p.structure, 'trough-tank', { metalness: .35, roughness: .4 }).material as THREE.Material).side = THREE.DoubleSide;
    part(trough, oval(new THREE.CylinderGeometry(1, 1, .02, 32).translate(0, .01, 0)), p.structure, 'trough-tank', { metalness: .35, roughness: .4 });
    part(trough, new THREE.TorusGeometry(1, .03, 6, 40).rotateX(Math.PI / 2).scale(1.2, 1, .5).translate(0, .6, 0), p.trim, 'trough-rim', { metalness: .4, roughness: .35 });
    merged(trough, [-.6, 0, .6].map(x => new THREE.TorusGeometry(1, .012, 4, 40).rotateX(Math.PI / 2).scale(1.2, 1, .5).translate(0, .3 + x * .25, 0)), p.trim, 'trough-rib', { metalness: .4, roughness: .35 });
    if (!empty) part(trough, oval(new THREE.CylinderGeometry(.98, .98, .02, 32).translate(0, .04 + level * .46, 0)), p.liquid, 'trough-water', { opacity: .75, roughness: .1 });
    block(trough, [.28, .3, .3], [1.32, .55, 0], p.trim, 'trough-valve-box', { bevel: .03, metalness: .3, roughness: .4 });
    anchor(trough, 'top', [0, .9, 0]);
  } else {
    block(trough, [2.4, .08, .5], [0, .44, 0], p.structure, 'trough-body', { roughness: .85 });
    merged(trough, [-1, 1].map(s => new THREE.BoxGeometry(2.4, .3, .06).rotateX(s * .25).translate(0, .6, s * .27)), p.structure, 'trough-body', { roughness: .85 });
    merged(trough, [-1, 1].map(s => new THREE.BoxGeometry(.06, .34, .62).translate(s * 1.17, .6, 0)), p.trim, 'trough-end', { roughness: .85 });
    merged(trough, [-1, 1].flatMap(sx => [-1, 1].map(sz => new THREE.BoxGeometry(.08, .42, .08).translate(sx * 1.05, .21, sz * .18))), p.trim, 'trough-leg', { roughness: .9 });
    if (!empty) block(trough, [2.26, .12 * level, .5], [0, .48 + .14 * level, 0], p.surface, 'trough-feed', { roughness: 1 });
    block(trough, [.08, .9, .08], [1.3, .45, 0], p.trim, 'trough-post', { roughness: .9 });
    anchor(trough, 'top', [0, 1.1, 0]);
  }
  anchor(trough, 'front', [0, 0, .9]); anchor(trough, 'back', [0, 0, -.9]);
  return centred(trough);
}

const COOP_TONES = { surface: '#ece3cf', structure: '#5a4f4a', wood: '#8e6b4b', accent: '#bf5a3e' } as const;
/**
 * Raised chicken coop: a 1.6 × 1.2 m house on legs with a pitched roof, a pop hole facing +z with a ramp down to the
 * ground, a nest box on the +x side and a small window. `open` lowers the pop-hole door onto a dark opening; `closed`
 * shuts it. Static. Color changes the walls.
 */
export function createChickenCoop(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['open', 'closed'] as const, 'chicken coop'), p = objectPalette(node, context, 'surface', COOP_TONES);
  const floor = .55, wall = 1, coop = new THREE.Group(); coop.name = `chicken-coop-${variant}`;
  merged(coop, [-1, 1].flatMap(sx => [-1, 1].map(sz => new THREE.BoxGeometry(.08, floor, .08).translate(sx * .74, floor / 2, sz * .54))), p.wood, 'coop-leg', { roughness: .9 });
  block(coop, [1.6, wall, 1.2], [0, floor + wall / 2, 0], p.surface, 'coop-house', { roughness: .85 });
  // Corner boards and a pitched roof with its ridge along x.
  merged(coop, [-1, 1].flatMap(sx => [-1, 1].map(sz => new THREE.BoxGeometry(.07, wall, .07).translate(sx * .8, floor + wall / 2, sz * .6))), p.wood, 'coop-trim', { roughness: .9 });
  // Slabs are built in the x/y plane and turned so that their slope runs along z.
  merged(coop, [-1, 1].map(s => slab([s * .78, floor + wall - .02], [0, floor + wall + .48], .06, 1.86).rotateY(-Math.PI / 2)), p.structure, 'coop-roof', { roughness: .6 });
  merged(coop, [-1, 1].map(s => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-.6, 0), new THREE.Vector2(.6, 0), new THREE.Vector2(0, .46)]), { depth: .04, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(s > 0 ? .8 : -.76, floor + wall, 0)), p.surface, 'coop-gable', { roughness: .85 });
  // Pop hole with ramp to the ground at +z.
  const hole: Vec = [.35, floor + .22, .605];
  block(coop, [.32, .34, .02], [hole[0], hole[1], hole[2]], DARK, 'coop-pop-hole');
  if (variant === 'open') block(coop, [.32, .34, .03], [hole[0], floor + .02, hole[2] + .17], p.accent, 'coop-door').rotation.x = Math.PI / 2;
  else block(coop, [.34, .36, .03], [hole[0], hole[1], hole[2] + .015], p.accent, 'coop-door');
  part(coop, slab([.62, floor], [1.65, .02], .04, .3).rotateY(-Math.PI / 2).translate(hole[0], 0, 0), p.wood, 'coop-ramp', { roughness: .9 });
  merged(coop, [.2, .4, .6, .8].map(t => new THREE.BoxGeometry(.3, .02, .03).translate(hole[0], floor * (1 - t) + .03, .62 + t * 1.03)), p.wood, 'coop-ramp-cleat');
  // Nest box with a lid on +x, and a small window on the front.
  block(coop, [.4, .45, .9], [1, floor + .3, 0], p.surface, 'coop-nest-box', { roughness: .85 });
  block(coop, [.48, .05, 1], [1.02, floor + .56, 0], p.structure, 'coop-nest-lid', { roughness: .6 }).rotation.z = -.25;
  block(coop, [.36, .26, .02], [-.35, floor + .62, .61], '#c3d4e2', 'coop-window', { roughness: .2 });
  anchor(coop, 'entrance', [hole[0], 0, 1.75]); anchor(coop, 'top', [0, floor + wall + .7, 0]);
  return centred(coop);
}

/** x, y, z of a copy and its height scale. */
type Spot = readonly [number, number, number, number];
/** Copies one template into a single buffer at many spots, scaling its height; far cheaper than merging thousands of geometries. */
function scatter(template: THREE.BufferGeometry, spots: readonly Spot[]): THREE.BufferGeometry {
  const source = template.toNonIndexed(), position = source.getAttribute('position'), normal = source.getAttribute('normal'), n = position.count;
  const positions = new Float32Array(n * 3 * spots.length), normals = new Float32Array(n * 3 * spots.length);
  spots.forEach(([x, y, z, scale], i) => {
    for (let v = 0; v < n; v++) {
      const o = (i * n + v) * 3;
      positions[o] = position.getX(v) + x; positions[o + 1] = position.getY(v) * scale + y; positions[o + 2] = position.getZ(v) + z;
      normals[o] = normal.getX(v); normals[o + 1] = normal.getY(v); normals[o + 2] = normal.getZ(v);
    }
  });
  template.dispose(); source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/** Crop rows run along x every 0.75 m; plants stand every 0.5 m along a row. */
export const CROP_FIELD = Object.freeze({ rowSpacing: .75, plantSpacing: .5, soil: .04 });
export const cropFieldFootprint: FootprintDefinition = Object.freeze({ min: Object.freeze([4, 4] as const), max: Object.freeze([60, 60] as const), default: Object.freeze([16, 10] as const) });
const FIELD_TONES = { surface: '#8a6a4c', foliage: '#6fa54a' } as const;
const STAGE_PLANT: Readonly<Record<CropStage, { height: number; radius: number } | null>> = { plowed: null, sprouting: { height: .12, radius: .07 }, growing: { height: .55, radius: .2 }, ripe: { height: .95, radius: .3 }, harvested: { height: .14, radius: .06 } };
/**
 * Sized crop field (footprint 4–60 m, default 16 × 10 m) of soil with furrows and rows of plants along x. The stage
 * (default `growing`) sets the plants: none when `plowed`, green shoots, green plants, golden ripe grain, or straw stubble when
 * `harvested`. Rows keep their real spacing; the footprint adds rows instead of stretching them. Static. Color changes
 * the green crop (foliage role).
 */
export function createCropField(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const stage = variantOf({ ...node, variant: node.variant ?? CROP_DEFAULT_STAGE }, CROP_STAGES, 'crop field'), p = objectPalette(node, context, 'foliage', FIELD_TONES), [W, D] = resolveFootprint(node, cropFieldFootprint);
  const { rowSpacing, plantSpacing, soil } = CROP_FIELD, field = new THREE.Group(); field.name = `crop-field-${stage}`;
  block(field, [W, soil, D], [0, soil / 2, 0], p.surface, 'field-soil', { roughness: 1 });
  const rows = Math.max(1, Math.floor((D - .5) / rowSpacing)), first = -(rows - 1) * rowSpacing / 2;
  merged(field, Array.from({ length: rows }, (_, i) => new THREE.BoxGeometry(W - .3, .05, .22).translate(0, soil + .02, first + i * rowSpacing)), shade(p.surface, .82), 'field-furrow', { roughness: 1 });
  const plant = STAGE_PLANT[stage];
  if (plant) {
    const color = stage === 'ripe' ? GRAIN : stage === 'harvested' ? STUBBLE : p.foliage, count = Math.max(1, Math.floor((W - .6) / plantSpacing)), start = -(count - 1) * plantSpacing / 2, spots: Spot[] = [];
    for (let r = 0; r < rows; r++) for (let k = 0; k < count; k++) {
      // A small deterministic stagger keeps the rows from looking machined.
      const jitter = ((r * 7 + k * 13) % 5 - 2) * .03, scale = 1 + ((r * 3 + k * 5) % 4 - 1.5) * .06;
      spots.push([start + k * plantSpacing + jitter, soil + .04 + plant.height * scale / 2, first + r * rowSpacing, scale]);
    }
    part(field, scatter(new THREE.ConeGeometry(plant.radius, plant.height, 5), spots), color, 'field-crop', { roughness: .9, flat: true });
  }
  anchor(field, 'entrance', [0, 0, D / 2 + .5]); anchor(field, 'top', [0, 1.4, 0]);
  return field;
}

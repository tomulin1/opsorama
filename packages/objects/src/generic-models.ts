/** Generic catalog models defined in one place: bag, shelf, station, pavilion and broadleaf tree. */
import type { MaterialContext } from '@opsorama/three';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AssetNode } from '@opsorama/core';
import { anchor } from './parts';
import { objectPalette } from './object-palette';
import { addInspectionKit, addPackingKit } from './fulfillment';
import { resolveCountRepresentation } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
function box(group: THREE.Group, size: readonly number[], position: readonly number[], color: string, bevel = 0) {
  const mesh = new THREE.Mesh(bevel ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, bevel) : new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshStandardMaterial({ color, roughness: .72 }));
  mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
/** Bag defaults that keep its sage body, dark rope handles and paper sticker in the default scene. */
const BAG_TONES = { surface: '#81b5a3', structure: '#385e54', text: '#f5f4ea' } as const;
/** Pavilion defaults that keep its blue walls, grey floor and pale sign strip in the default scene. */
const PAVILION_TONES = { structure: '#5481dc', surface: '#cfd8e3', text: '#e3efff' } as const;
/** Floor x positions of the three staging spots, 0.5 m in front of the back wall line. */
const PAVILION_STOCK = [-1.1, 0, 1.1] as const;
/** Workstation defaults that keep its blue frame, white top and dark terminal in the default scene. */
const STATION_TONES = { structure: '#6489d6', surface: '#f6f7fb', screen: '#2e465f', glass: '#bddfdf', trim: '#a9baca' } as const;
/** Shelf defaults that keep its blue frame, tan cartons and pale blue totes in the default scene. */
const SHELF_TONES = { structure: '#356dd8', surface: '#d8b487', accent: '#95b7df', trim: '#eee2c8' } as const;
/** Step-beam heights; deck tops are 0.04 m above. */
const SHELF_LEVELS = [.18, 1.05, 1.92] as const;
/** Storage slot floor points, four per level from left to right, bottom level first. */
export const SHELF_SLOTS: readonly (readonly [number, number])[] = SHELF_LEVELS.flatMap(y => [0, 1, 2, 3].map(i => [-1.06 + i * .7, y + .04] as const));
/** Shopping bag with rope handles and an optional surface label. */
export function createBag(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  // Body, handles and sticker use palette roles; status tints the body like the parcel, and the rim fold and creases are shades.
  const p = objectPalette(node, context, 'surface', BAG_TONES), group = new THREE.Group();
  const body = p.surface;
  const fold = `#${new THREE.Color(body).lerp(new THREE.Color('#ffffff'), .22).getHexString()}`, crease = `#${new THREE.Color(p.structure).offsetHSL(-.0047, -.0645, -.0273).getHexString()}`;
  // The body rests on the pivot (it used to float 3 cm above it).
  box(group, [.82, 1.04, .5], [0, .52, 0], body, .02);
  // Folded paper rim, side gusset creases and two rope handles instead of one solid loop.
  box(group, [.83, .09, .51], [0, 1, 0], fold);
  for (const x of [-.412, .412]) box(group, [.003, .88, .006], [x, .52, 0], crease).castShadow = false;
  for (const z of [-.17, .17]) { const handle = new THREE.Mesh(new THREE.TorusGeometry(.17, .014, 6, 18, Math.PI), new THREE.MeshStandardMaterial({ color: p.structure, roughness: .9 })); handle.position.set(0, 1.045, z); handle.castShadow = true; group.add(handle); }
  box(group, [.28, .19, .015], [0, .57, .26], p.text).name = 'bag-sticker';
  anchor(group, 'contents', [0, 0, 0]); anchor(group, 'top', [0, 1.045, 0]); anchor(group, 'handle', [0, 1.215, 0]); anchor(group, 'front', [0, .57, .268]);
  return group;
}

/** Storage shelf with step beams and 0–12 counted cartons and totes. */
export function createShelf(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  // Frame, stored cartons, totes and label strips use palette roles; decks and step beams are lighter shades of the frame.
  const p = objectPalette(node, context, 'structure', SHELF_TONES), frame = new THREE.Color(p.structure);
  const beam = `#${frame.clone().lerp(new THREE.Color('#ffffff'), .22).getHexString()}`, deck = `#${frame.clone().lerp(new THREE.Color('#dfe5ec'), .85).getHexString()}`;
  const group = new THREE.Group();
  const { count } = resolveCountRepresentation(node, assetCountDefinitions.shelf);
  for (const x of [-1.45, 1.45]) {
    for (const z of [-.48, .48]) { box(group, [.075, 2.8, .075], [x, 1.4, z], p.structure); box(group, [.15, .02, .15], [x, .01, z], '#273545'); }
    // Zig-zag end-frame bracing between the uprights.
    for (const [i, [y0, y1]] of [[.1, 1.05], [1.05, 1.92], [1.92, 2.7]].entries()) {
      const brace = box(group, [.035, Math.hypot(.96, y1 - y0), .035], [x, (y0 + y1) / 2, 0], p.structure); brace.rotation.x = (i % 2 ? 1 : -1) * Math.atan2(.96, y1 - y0);
    }
  }
  // Front and back step beams carry a lighter deck at each level.
  for (const y of SHELF_LEVELS) { for (const z of [-.5, .5]) box(group, [3.05, .1, .05], [0, y, z], beam); box(group, [2.9, .03, 1], [0, y + .025, 0], deck); }
  // Twelve named storage slots, four per level. Count boxes are decorative and fill the slots in order; real inventory attaches to the slot anchors.
  SHELF_SLOTS.forEach(([x, y], i) => anchor(group, `slot-${i}`, [x, y, 0]));
  for (let i = 0; i < count; i++) {
    const [x, y] = SHELF_SLOTS[i], carton = i % 2 === 1;
    const part = new THREE.Group(); part.name = `count-part-${i}`; part.userData.decorative = true; part.position.set(x, y, 0); group.add(part);
    box(part, [.57, .57, .75], [0, .285, 0], carton ? p.surface : p.accent, .02); box(part, [.075, .58, .76], [0, .29, 0], p.trim);
  }
  anchor(group, 'top', [0, 2.8, 0]); anchor(group, 'front', [0, SHELF_SLOTS[0][1], .53]);
  return group;
}

/** Workstation with a terminal; variants include packing and inspection kits. */
export function createStation(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = node.variant ?? 'standard';
  if (variant !== 'standard' && variant !== 'packing' && variant !== 'inspection') throw new Error(`Unknown station variant: ${variant}.`);
  // Frame, bench top, terminal and keyboard use palette roles; accessories keep their natural tones.
  const p = objectPalette(node, context, 'structure', STATION_TONES), group = new THREE.Group();
  for (const x of [-1.4, 1.4]) for (const z of [-.5, .5]) { box(group, [.12, 1.1, .12], [x, .55, z], p.structure); box(group, [.16, .03, .16], [x, .015, z], '#273545'); }
  // Lower stretchers make the bench read as a welded frame rather than four loose posts.
  for (const z of [-.5, .5]) box(group, [2.68, .07, .06], [0, .22, z], p.structure);
  for (const x of [-1.4, 1.4]) box(group, [.06, .07, .88], [x, .22, 0], p.structure);
  // The back panel sits on the rear edge of the top, so the bench is centred on its pivot.
  box(group, [3.3, .16, 1.4], [0, 1.15, 0], p.surface, .025); box(group, [3.1, .6, .1], [0, 1.58, -.65], p.structure, .02);
  if (variant === 'packing') addPackingKit(group);
  else if (variant === 'inspection') addInspectionKit(group);
  else { box(group, [.72, .54, .62], [-.6, 1.5, 0], '#e0bc8d', .02); box(group, [.075, .55, .63], [-.6, 1.5, 0], '#f8eaca'); }
  box(group, [.63, .45, .07], [.73, 1.65, -.3], p.screen, .015); box(group, [.53, .33, .08], [.73, 1.65, -.24], p.glass);
  // Monitor neck and foot so the screen stands on the bench.
  box(group, [.06, .2, .05], [.73, 1.33, -.36], p.screen); box(group, [.26, .02, .16], [.73, 1.24, -.36], p.screen);
  box(group, [.62, .06, .27], [.73, 1.27, .12], p.trim, .01);
  anchor(group, 'input', [-1.65, 1.23, 0]); anchor(group, 'output', [1.65, 1.23, 0]);
  anchor(group, 'surface', [0, 1.23, .3]); anchor(group, 'top', [0, 1.88, -.65]); anchor(group, 'front', [0, 1.23, .7]);
  return group;
}

/** Dispatch shelter with walls, a sign strip and 0–3 staged parcels. */
export function createPavilion(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  // Walls and roof use the structure role; the right wall, kick plates, gutter and roof ribs are shades of it.
  const p = objectPalette(node, context, 'structure', PAVILION_TONES), wall = new THREE.Color(p.structure);
  // HSL offsets reproduce the original #729be4 / #3463be shades for the default walls and keep that relation for any color.
  const light = `#${wall.clone().offsetHSL(-.009, -.136, .0699).getHexString()}`, dark = `#${wall.clone().offsetHSL(.0034, .0954, -.1275).getHexString()}`;
  const group = new THREE.Group(), { count } = resolveCountRepresentation(node, assetCountDefinitions.pavilion);
  box(group, [4.3, .04, 3.25], [0, .02, 0], p.surface);
  box(group, [4.4, 2.3, .15], [0, 1.15, -1.6], p.structure); box(group, [.16, 2.3, 3.25], [-2.15, 1.15, 0], p.structure);
  box(group, [.16, 2.3, 3.25], [2.15, 1.15, 0], light); box(group, [4.8, .18, 3.8], [0, 2.42, 0], p.structure);
  // Kick plates at the wall feet and a front gutter under the corrugated roof; the roof is centred on the floor.
  box(group, [4.42, .2, .17], [0, .1, -1.6], dark); for (const x of [-2.15, 2.15]) box(group, [.18, .2, 3.27], [x, .1, 0], dark);
  box(group, [4.82, .1, .1], [0, 2.3, 1.85], dark);
  for (let i = 0; i < 22; i++) box(group, [.035, .035, 3.75], [-2.3 + i * .215, 2.53, 0], dark);
  // Sign strip on the back wall; host text or SVG artwork goes on it through surfaceLabel.
  box(group, [3.6, .25, .02], [0, 2.13, -1.5], p.text).name = 'pavilion-sign';
  // Three staging spots on the floor. Count parcels are decorative; real staged stock attaches to the stock anchors.
  PAVILION_STOCK.forEach((x, i) => anchor(group, `stock-${i}`, [x, .04, -.5]));
  for (let i = 0; i < count; i++) {
    const part = new THREE.Group(); part.name = `count-part-${i}`; part.userData.decorative = true; part.position.set(PAVILION_STOCK[i], .04, -.5); group.add(part);
    box(part, [.85, .55, .85], [0, .275, 0], '#d7b38b', .02); box(part, [.09, .56, .86], [0, .28, 0], '#f2e2c4');
  }
  anchor(group, 'entrance', [0, .04, 1.625]); anchor(group, 'interior', [0, .04, 0]); anchor(group, 'sign', [0, 2.13, -1.489]); anchor(group, 'top', [0, 2.55, 0]);
  return group;
}

/** Broadleaf tree with a trunk and a three-lobed crown. */
export function createTree(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  // Trunk and crown use the wood and foliage roles; the three crown lobes are fixed shades of the foliage color.
  const p = objectPalette(node, context, 'foliage', { wood: '#a8896a', foliage: '#8bbcaa' }), foliage = new THREE.Color(p.foliage), group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.065, .11, 1.15, 8), new THREE.MeshStandardMaterial({ color: p.wood, roughness: .95 })); trunk.name = 'trunk'; trunk.position.y = .575; trunk.castShadow = true; group.add(trunk);
  // Three faceted lobes read as a leafy crown instead of a single smooth egg; the crown is centred over the trunk.
  for (const [radius, x, y, z, shade] of [[.66, -.04, 1.55, 0, [0, 0, 0]], [.46, .32, 1.28, .16, [-.0006, .0383, -.049]], [.44, -.34, 1.98, -.12, [-.0033, -.0347, .0534]]] as const) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), new THREE.MeshStandardMaterial({ color: foliage.clone().offsetHSL(shade[0], shade[1], shade[2]), roughness: .9, flatShading: true }));
    crown.name = 'foliage'; crown.position.set(x, y, z); crown.scale.y = 1.15; crown.castShadow = true; group.add(crown);
  }
  anchor(group, 'top', [0, 2.49, 0]);
  return group;
}

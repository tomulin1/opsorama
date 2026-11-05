import { validateOperatingProperties } from '@opsorama/core';
import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import { resolveCountRepresentation, type AssetNode, type MaterialPalette } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { setAssetAnimator } from './animation';
import type { MaterialContext } from './laboratory';
import { anchor, block, cylinder, gridWires, merged, part, wires } from './parts';
import { kitPalette, variantOf } from './kit';

export type DiningTableVariant = 'square' | 'round';
export type PatioUmbrellaVariant = 'open' | 'closed';

const OAK = '#c79a68', WALNUT = '#8a5a3c', LINEN = '#f4efe6', PLATE = '#fbfcfe', BRASS = '#c9a45c', COPPER = '#b87333', KRAFT = '#c9a274', CHALK = '#27322f', BRICK = '#b0644a', STONE = '#d8d0c2', EMBER = '#ff8a3d', WARM = '#ffd59a';
/** Plated food tones for decorative dishes; they never identify a menu item. */
const FOOD = ['#e2b75c', '#8f4b34', '#86b965', '#d5603f'] as const;
const metal = { metalness: .35, roughness: .35 } as const;
/** Seat-top height shared with the seated worker and other seat anchors. */
const SEAT = .52, TABLE = .76;

/** Seat anchor whose +z faces the table, ready for a seated worker. */
function seatAnchor(group: THREE.Object3D, index: number, position: readonly [number, number, number], facing: number) { anchor(group, `seat-${index}`, position).rotation.y = facing; }

/** Plate, napkin, cutlery and wine glass; local +z points toward the diner. One count part per setting. */
function placeSetting(group: THREE.Object3D, index: number, position: readonly [number, number, number], yaw: number, p: MaterialPalette): THREE.Group {
  const setting = new THREE.Group(); setting.name = `count-part-${index}`; setting.position.set(...position); setting.rotation.y = yaw; group.add(setting);
  cylinder(setting, .125, .012, .006, PLATE, 'setting-plate', { segments: 28, roughness: .25 });
  cylinder(setting, .08, .004, .014, '#eef1f4', 'setting-plate-well', { segments: 24, roughness: .25 });
  block(setting, [.09, .01, .15], [-.19, .005, .01], LINEN, 'setting-napkin', { bevel: .004, roughness: .9 });
  block(setting, [.014, .004, .16], [-.19, .012, .01], p.trim, 'setting-cutlery', metal);
  block(setting, [.014, .004, .18], [.17, .002, .01], p.trim, 'setting-cutlery', metal);
  const glass = new THREE.Group(); glass.position.set(.15, 0, -.15); setting.add(glass);
  cylinder(glass, .028, .004, .002, p.glass, 'setting-glass', { segments: 14, opacity: .55, roughness: .1 });
  cylinder(glass, .005, .07, .039, p.glass, 'setting-glass', { segments: 8, opacity: .55, roughness: .1 });
  cylinder(glass, .036, .07, .109, p.glass, 'setting-glass', { segments: 16, bottomRadius: .024, opacity: .45, roughness: .1 });
  return setting;
}
/** Neutral bud vase at the table center; service status belongs to the host composition. */
function centerpiece(group: THREE.Object3D, y: number, p: MaterialPalette) {
  cylinder(group, .022, .1, y + .05, p.glass, 'table-vase', { segments: 12, opacity: .5, roughness: .1 }).position.x = -.05;
  cylinder(group, .003, .12, y + .12, '#5e9c58', 'table-flower-stem', { segments: 6 }).position.x = -.05;
  part(group, new THREE.SphereGeometry(.026, 10, 8), '#e7b84c', 'table-flower', { roughness: .8 }).position.set(-.05, y + .19, 0);
}
/** Bistro chair facing local +z: wooden legs and back posts in one mesh, upholstered seat and back. */
function diningChair(group: THREE.Object3D, color: string): THREE.Group {
  const chair = new THREE.Group(); chair.name = 'dining-chair'; group.add(chair);
  const frame: THREE.BufferGeometry[] = [];
  for (const x of [-.18, .18]) for (const z of [-.18, .18]) frame.push(new THREE.CylinderGeometry(.018, .014, SEAT - .05, 8).translate(x, (SEAT - .05) / 2, z));
  for (const x of [-.17, .17]) frame.push(new THREE.CylinderGeometry(.016, .016, .46, 8).translate(x, SEAT + .2, -.19));
  frame.push(new THREE.BoxGeometry(.38, .03, .03).translate(0, .18, -.18), new THREE.BoxGeometry(.38, .03, .03).translate(0, .18, .18));
  merged(chair, frame, WALNUT, 'chair-frame', { roughness: .6 });
  block(chair, [.44, .06, .43], [0, SEAT - .03, 0], color, 'chair-seat', { bevel: .025, roughness: .85 });
  block(chair, [.4, .2, .04], [0, SEAT + .32, -.2], color, 'chair-back', { bevel: .015, roughness: .85 });
  return chair;
}

export const DINING_TABLE = Object.freeze({ chairOffset: .62, settingOffset: .25, height: TABLE });
/** Seat order: +z, −z, +x, −x. Facing angles turn the seat's +z toward the table center. */
export const DINING_SEATS = Object.freeze([[0, 1, Math.PI], [0, -1, 0], [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2]] as const);
/**
 * Four-seat dining table, square (0.8 m) or round (0.9 m), with four bistro chairs. `count` lays 0–4 place settings in
 * seat order (+z, −z, +x, −x); settings are decorative covers, not guests or orders. Service status belongs to the host composition.
 * Color changes chair upholstery.
 */
export function createDiningTable(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['square', 'round'] as const, 'dining table'), p = kitPalette(node, context), upholstery = resolveObjectColor(node, context, 'accent', '#c07a52');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['dining-table']), { chairOffset, settingOffset } = DINING_TABLE;
  const table = new THREE.Group(); table.name = `dining-table-${variant}`;
  if (variant === 'square') {
    block(table, [.8, .04, .8], [0, TABLE - .02, 0], OAK, 'table-top', { bevel: .012, roughness: .55 });
    block(table, [.68, .08, .68], [0, TABLE - .08, 0], WALNUT, 'table-apron', { roughness: .6 });
    merged(table, [-.33, .33].flatMap(x => [-.33, .33].map(z => new THREE.BoxGeometry(.05, TABLE - .04, .05).translate(x, (TABLE - .04) / 2, z))), WALNUT, 'table-leg', { roughness: .6 });
  } else {
    cylinder(table, .45, .04, TABLE - .02, OAK, 'table-top', { segments: 40, roughness: .55 });
    cylinder(table, .43, .03, TABLE - .055, WALNUT, 'table-apron', { segments: 32, roughness: .6 });
    cylinder(table, .045, TABLE - .1, (TABLE - .1) / 2 + .03, p.structure, 'table-pedestal', { segments: 14, ...metal });
    merged(table, [0, Math.PI / 2].map(angle => new THREE.BoxGeometry(.62, .035, .07).rotateY(angle + Math.PI / 4).translate(0, .018, 0)), p.structure, 'table-foot', metal);
  }
  DINING_SEATS.forEach(([x, z, facing], i) => {
    const offset = variant === 'round' ? chairOffset + .03 : chairOffset, chair = diningChair(table, upholstery);
    chair.position.set(x * offset, 0, z * offset); chair.rotation.y = facing;
    seatAnchor(table, i, [x * offset, SEAT, z * offset], facing);
    if (i < count) placeSetting(table, i, [x * settingOffset, TABLE, z * settingOffset], Math.atan2(x, z), p);
  });
  centerpiece(table, TABLE, p);
  anchor(table, 'top', [0, TABLE, 0]);
  return table;
}

export const BOOTH = Object.freeze({ seats: [[-.32, .7, Math.PI], [.32, .7, Math.PI], [-.32, -.7, 0], [.32, -.7, 0]] as const });
/**
 * Upholstered booth: two high-backed benches facing across a 1.2 × 0.7 m table. `count` lays 0–4 place settings in seat
 * order (+z left/right, then −z). Service status belongs to the host composition. Color changes the upholstery.
 */
export function createBoothSeating(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), upholstery = resolveObjectColor(node, context, 'accent', '#9a4450'), { count } = resolveCountRepresentation(node, assetCountDefinitions['booth-seating']);
  const booth = new THREE.Group(); booth.name = 'booth-seating';
  for (const side of [-1, 1]) {
    const bench = new THREE.Group(); bench.name = 'booth-bench'; bench.rotation.y = side > 0 ? 0 : Math.PI; booth.add(bench);
    block(bench, [1.44, .4, .48], [0, .2, .72], WALNUT, 'booth-base', { bevel: .015, roughness: .6 });
    block(bench, [1.4, .12, .5], [0, SEAT - .06, .7], upholstery, 'booth-cushion', { bevel: .045, roughness: .85 });
    block(bench, [1.5, 1.22, .1], [0, .61, 1.04], WALNUT, 'booth-shell', { bevel: .02, roughness: .6 });
    const back = block(bench, [1.4, .58, .12], [0, .86, .93], upholstery, 'booth-back', { bevel: .05, roughness: .85 }); back.rotation.x = .1;
    for (const x of [-.47, 0, .47]) { const seam = block(bench, [.012, .5, .012], [x, .86, .867], WALNUT, 'booth-tufting', { roughness: .9 }); seam.rotation.x = .1; }
    for (const x of [-.74, .74]) block(bench, [.05, 1.0, .6], [x, .5, .74], WALNUT, 'booth-end', { bevel: .015, roughness: .6 });
    block(bench, [1.5, .04, .14], [0, 1.24, 1.03], OAK, 'booth-cap', { bevel: .01, roughness: .55 });
  }
  block(booth, [1.2, .04, .7], [0, TABLE - .02, 0], OAK, 'table-top', { bevel: .012, roughness: .55 });
  for (const x of [-.42, .42]) { cylinder(booth, .04, TABLE - .06, (TABLE - .06) / 2 + .02, p.structure, 'table-pedestal', { segments: 12, ...metal }).position.x = x; block(booth, [.08, .03, .5], [x, .015, 0], p.structure, 'table-foot', metal); }
  BOOTH.seats.forEach(([x, z, facing], i) => {
    seatAnchor(booth, i, [x, SEAT, z], facing);
    if (i < count) placeSetting(booth, i, [x, TABLE, Math.sign(z) * .2], z > 0 ? 0 : Math.PI, p);
  });
  centerpiece(booth, TABLE, p);
  anchor(booth, 'top', [0, TABLE, 0]);
  return booth;
}

export const BAR_COUNTER = Object.freeze({ length: 3.2, height: 1.11, guests: [-1.2, -.4, .4, 1.2] as const, guestZ: .75, bartenderZ: -.7 });
/**
 * Bar counter 3.2 m along x with guests at +z: slatted front, walnut top with a warm under-glow, brass foot rail and a
 * four-tap beer tower. A lit back bar with bottles stands at −z behind the bartender aisle. Color changes the front panel.
 */
export function createBarCounter(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), front = node.materials?.structure ?? node.color ?? p.structure, { length, height, guests, guestZ, bartenderZ } = BAR_COUNTER;
  const bar = new THREE.Group(); bar.name = 'bar-counter';
  block(bar, [length - .04, .1, .56], [0, .05, -.03], p.screen, 'bar-plinth');
  block(bar, [length, height - .16, .62], [0, .1 + (height - .16) / 2, 0], front, 'bar-front', { bevel: .015, roughness: .55 });
  merged(bar, Array.from({ length: 19 }, (_, i) => new THREE.BoxGeometry(.012, height - .3, .006).translate(-length / 2 + .16 + i * (length - .32) / 18, .1 + (height - .16) / 2, .312)), p.screen, 'bar-panel-groove', { roughness: .8 });
  block(bar, [length + .1, .06, .8], [0, height - .03, .05], WALNUT, 'bar-top', { bevel: .015, roughness: .45 });
  block(bar, [length - .1, .015, .015], [0, height - .07, .43], WARM, 'bar-led', { emissive: WARM });
  const rail = cylinder(bar, .025, length - .2, 0, BRASS, 'bar-foot-rail', { segments: 12, ...metal }); rail.rotation.z = Math.PI / 2; rail.position.set(0, .22, .47);
  for (const x of [-1.3, -.45, .45, 1.3]) block(bar, [.035, .035, .17], [x, .22, .39], BRASS, 'bar-rail-bracket', metal);
  // Bartender side: stainless under-bar shelf at working height.
  block(bar, [length - .1, .05, .26], [0, .86, -.43], p.trim, 'bar-underbar', metal);
  // Four-tap beer tower with colored handles and a drip tray.
  const tower = new THREE.Group(); tower.name = 'bar-tap-tower'; tower.position.set(.85, height, .05); bar.add(tower);
  cylinder(tower, .035, .3, .15, p.trim, 'bar-tap-column', { segments: 14, ...metal });
  const beam = cylinder(tower, .03, .52, 0, p.trim, 'bar-tap-column', { segments: 14, ...metal }); beam.rotation.z = Math.PI / 2; beam.position.y = .3;
  ['#2f4a5e', '#c24a3e', '#dca644', '#3d8a6e'].forEach((tone, i) => {
    const x = -.2 + i * .135; cylinder(tower, .012, .07, .25, p.trim, 'bar-tap', { segments: 8, ...metal }).position.x = x;
    block(tower, [.026, .13, .026], [x, .4, 0], tone, 'bar-tap-handle', { bevel: .008, roughness: .5 });
  });
  block(tower, [.56, .02, .13], [0, .01, .02], p.screen, 'bar-drip-tray', { roughness: .4 });
  for (const [x, z] of [[-.45, .2], [-.35, .28], [1.28, .2]] as const) cylinder(bar, .038, .15, height + .075, p.glass, 'bar-glass', { segments: 14, bottomRadius: .03, opacity: .45, roughness: .1 }).position.set(x, height + .075, z);
  // Back bar: cabinet, lit shelves, mirror and bottles merged per tone.
  block(bar, [length, .9, .5], [0, .45, -1.25], WALNUT, 'bar-back-cabinet', { bevel: .015, roughness: .6 });
  block(bar, [length + .02, .04, .52], [0, .92, -1.25], p.trim, 'bar-back-counter', metal);
  block(bar, [length - .2, .9, .02], [0, 1.52, -1.48], p.glass, 'bar-mirror', { roughness: .08, metalness: .2, opacity: .75 });
  for (const x of [-length / 2, length / 2]) block(bar, [.08, 1.95, .5], [x, .975, -1.25], WALNUT, 'bar-back-post', { roughness: .6 });
  block(bar, [length + .08, .1, .54], [0, 2, -1.25], WALNUT, 'bar-back-cap', { bevel: .015, roughness: .6 });
  const bottles: THREE.BufferGeometry[][] = [[], [], [], []], necks: THREE.BufferGeometry[] = [];
  for (const [shelf, y] of [1.3, 1.7].entries()) {
    block(bar, [length - .16, .03, .26], [0, y, -1.36], p.glass, 'bar-shelf', { roughness: .1, opacity: .6 });
    block(bar, [length - .2, .012, .012], [0, y - .022, -1.25], WARM, 'bar-led', { emissive: WARM });
    for (let i = 0; i < 16; i++) {
      const x = -length / 2 + .22 + i * (length - .44) / 15 + (shelf ? .04 : 0), tall = .17 + ((i * 7 + shelf * 3) % 5) * .015, tone = (i + shelf * 2) % 4;
      bottles[tone].push(new THREE.CylinderGeometry(.032, .034, tall, 10).translate(x, y + .015 + tall / 2, -1.36));
      necks.push(new THREE.CylinderGeometry(.01, .014, .07, 8).translate(x, y + .015 + tall + .035, -1.36));
    }
  }
  ['#3f6b45', '#8a4a2e', '#c9b77a', '#d7e3ea'].forEach((tone, i) => merged(bar, bottles[i], tone, 'bar-bottle', { roughness: .2, opacity: i === 3 ? .7 : undefined }));
  merged(bar, necks, '#2d3a33', 'bar-bottle', { roughness: .3 });
  guests.forEach((x, i) => anchor(bar, `guest-${i}`, [x, 0, guestZ]));
  anchor(bar, 'bartender', [0, 0, bartenderZ]); anchor(bar, 'top', [-.75, height, .05]); anchor(bar, 'taps', [.85, height, .1]);
  return bar;
}

/** Backless bar stool: weighted base, chrome column, foot ring and a round cushion at 0.8 m. Color changes the cushion. */
export function createBarStool(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), cushion = resolveObjectColor(node, context, 'accent', '#9a4450'), stool = new THREE.Group(); stool.name = 'bar-stool';
  cylinder(stool, .22, .03, .015, p.structure, 'stool-base', { segments: 28, ...metal });
  cylinder(stool, .028, .7, .38, p.trim, 'stool-column', { segments: 12, ...metal });
  const ring = part(stool, new THREE.TorusGeometry(.17, .012, 8, 28), p.trim, 'stool-foot-ring', metal); ring.rotation.x = Math.PI / 2; ring.position.y = .3;
  merged(stool, [0, Math.PI * 2 / 3, Math.PI * 4 / 3].map(angle => new THREE.BoxGeometry(.17, .015, .015).translate(.085, .3, 0).rotateY(angle)), p.trim, 'stool-foot-ring', metal);
  cylinder(stool, .17, .025, .73, p.structure, 'stool-seat-pan', { segments: 24 });
  cylinder(stool, .2, .07, .775, cushion, 'stool-cushion', { segments: 28, bottomRadius: .19, roughness: .85 });
  anchor(stool, 'seat', [0, .81, 0]);
  return stool;
}

/**
 * Two-group espresso machine with a side grinder, for placing on a counter top (its base is the counter surface). Front
 * +z. Optional local motion lets steam rise from the wand; heatEnabled: false removes steam; motion-off keeps enabled puffs still. Color changes the body.
 */
export function createEspressoMachine(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  validateOperatingProperties(node);
  const p = kitPalette(node, context), body = resolveObjectColor(node, context, 'surface', COPPER), machine = new THREE.Group(); machine.name = 'espresso-machine';
  const unit = new THREE.Group(); unit.position.x = .14; machine.add(unit);
  for (const x of [-.34, .34]) for (const z of [-.2, .2]) cylinder(unit, .025, .03, .015, p.structure, 'espresso-foot', { segments: 10 }).position.set(x, .015, z);
  block(unit, [.78, .36, .5], [0, .21, 0], body, 'espresso-body', { bevel: .025, ...metal });
  block(unit, [.66, .17, .06], [0, .125, .23], p.screen, 'espresso-recess', { roughness: .6 });
  block(unit, [.66, .025, .2], [0, .045, .3], p.trim, 'espresso-drip-tray', metal);
  const grate: number[] = []; gridWires(grate, [0, .059, .3], [.62, .18], .04, 'z'); for (let i = 0; i < grate.length; i += 3) [grate[i + 1], grate[i + 2]] = [.059, .3 + grate[i + 1] - .059]; wires(unit, grate, p.structure, 'espresso-grate');
  block(unit, [.74, .04, .46], [0, .41, 0], p.trim, 'espresso-cup-tray', metal);
  for (const [x, z, w, d] of [[0, -.225, .74, .015], [0, .225, .74, .015], [-.365, 0, .015, .46], [.365, 0, .015, .46]] as const) block(unit, [w, .04, d], [x, .45, z], p.trim, 'espresso-rail', metal);
  for (let i = 0; i < 4; i++) cylinder(unit, .034, .045, .455, PLATE, 'espresso-cup', { segments: 14, bottomRadius: .026, roughness: .25 }).position.set(-.24 + i * .16, .455, -.05);
  block(unit, [.7, .1, .02], [0, .345, .256], p.trim, 'espresso-panel', metal);
  for (const x of [-.17, .17]) {
    cylinder(unit, .055, .06, .27, p.trim, 'espresso-group-head', { segments: 18, ...metal }).position.set(x, .27, .3);
    cylinder(unit, .046, .03, .225, p.trim, 'espresso-portafilter', { segments: 16, ...metal }).position.set(x, .225, .3);
    block(unit, [.03, .03, .15], [x, .225, .42], p.screen, 'espresso-portafilter-handle', { bevel: .01, roughness: .5 });
    for (const dx of [-.025, .025]) block(unit, [.022, .022, .012], [x + dx, .345, .27], p.screen, 'espresso-button', { bevel: .004 });
  }
  const gauge = cylinder(unit, .04, .012, 0, PLATE, 'espresso-gauge', { segments: 20 }); gauge.rotation.x = Math.PI / 2; gauge.position.set(0, .345, .27);
  const bezel = part(unit, new THREE.TorusGeometry(.042, .006, 6, 20), p.trim, 'espresso-gauge-bezel', metal); bezel.position.set(0, .345, .277);
  block(unit, [.004, .03, .003], [0, .352, .278], p.screen, 'espresso-gauge-needle').rotation.z = -.6;
  // Steam wand on the right with its knob.
  cylinder(unit, .008, .2, .3, p.trim, 'espresso-steam-wand', { segments: 8, ...metal }).position.set(.33, .3, .29);
  cylinder(unit, .02, .03, .4, p.screen, 'espresso-knob', { segments: 10 }).position.set(.33, .4, .26);
  // Grinder with a smoked hopper of beans.
  block(machine, [.2, .3, .24], [-.42, .15, .02], p.structure, 'espresso-grinder', { bevel: .02 });
  cylinder(machine, .095, .16, .38, p.glass, 'espresso-hopper', { segments: 18, bottomRadius: .05, opacity: .5, roughness: .1 }).position.set(-.42, .38, .02);
  cylinder(machine, .07, .07, .34, '#5b3a26', 'espresso-beans', { segments: 16, bottomRadius: .045, roughness: .9 }).position.set(-.42, .34, .02);
  block(machine, [.12, .03, .1], [-.42, .08, .16], p.trim, 'espresso-grinder-fork', metal);
  const steam: THREE.Mesh[] = [];
  if (node.heatEnabled !== false) for (let i = 0; i < 3; i++) steam.push(part(unit, new THREE.SphereGeometry(.035, 12, 8), '#ffffff', 'espresso-steam', { opacity: .3, roughness: 1 }));
  const puff = (time: number) => steam.forEach((mesh, i) => {
    const phase = (time * .7 + i / 3) % 1; mesh.position.set(.33 + Math.sin(phase * 5 + i) * .015, .2 + phase * .28, .3); mesh.scale.setScalar(.5 + phase * .9);
    (mesh.material as THREE.MeshStandardMaterial).opacity = .32 * (1 - phase);
  });
  puff(0); if (steam.length) setAssetAnimator(machine, ({ time }) => puff(time), steam);
  anchor(machine, 'cup', [.14 - .17, .06, .3]); anchor(machine, 'barista', [.14, 0, .7]);
  return machine;
}

function archShape(width: number, height: number): THREE.Shape {
  const r = width / 2, shape = new THREE.Shape(); shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, height - r); shape.absarc(0, height - r, r, 0, Math.PI, false); shape.lineTo(-r, 0); return shape;
}
/**
 * Wood-fired pizza oven: brick plinth with a log store, stone hearth, terracotta dome, arched mouth and chimney, with a
 * pizza on a peel on the landing. Front +z. A burning oven glows; optional local motion flickers the fire. heatEnabled: false shows a
 * cold oven without glow. Alerts are separate from the neutral thermometer. Color changes the dome.
 */
export function createPizzaOven(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  validateOperatingProperties(node);
  const p = kitPalette(node, context), dome = resolveObjectColor(node, context, 'surface', '#c8714f'), burning = node.heatEnabled !== false, oven = new THREE.Group(); oven.name = 'pizza-oven';
  block(oven, [1.6, .9, 1.5], [0, .45, 0], BRICK, 'oven-plinth', { bevel: .02, roughness: .9 });
  const mortar: number[] = [];
  for (let row = 1; row < 9; row++) { const y = row * .1; if (y > .52) mortar.push(-.8, y, .752, .8, y, .752); else mortar.push(-.8, y, .752, -.55, y, .752, .55, y, .752, .8, y, .752); for (let x = -.8 + (row % 2 ? .1 : .2); x < .8; x += .2) if (y > .55 || Math.abs(x) > .55) mortar.push(x, y, .752, x, y + .1, .752); }
  wires(oven, mortar, '#d9c3b2', 'oven-mortar');
  block(oven, [1.1, .44, .02], [0, .3, .742], '#2a2220', 'oven-log-store');
  for (const [i, [x, y]] of ([[-.36, .14], [-.24, .14], [-.12, .14], [0, .14], [.12, .14], [.24, .14], [.36, .14], [-.3, .25], [-.18, .25], [-.06, .25], [.06, .25], [.18, .25], [.3, .25], [-.12, .36], [0, .36], [.12, .36]] as const).entries()) {
    const log = cylinder(oven, .055, .08, 0, i % 2 ? '#8a5a3c' : '#9b6a45', 'oven-log', { segments: 10, roughness: .9 }); log.rotation.x = Math.PI / 2; log.position.set(x, y, .72);
  }
  block(oven, [1.72, .08, 1.62], [0, .94, 0], STONE, 'oven-hearth', { bevel: .015, roughness: .8 });
  block(oven, [.95, .06, .32], [0, .95, .92], STONE, 'oven-landing', { bevel: .012, roughness: .8 });
  const shell = part(oven, new THREE.SphereGeometry(.72, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), dome, 'oven-dome', { roughness: .85 }); shell.position.set(0, .98, -.05); shell.scale.y = .85;
  cylinder(oven, .75, .08, 1.02, p.structure, 'oven-dome-band', { segments: 36, roughness: .7 }).position.z = -.05;
  // Entrance vault with stone arch, dark mouth and glowing fire.
  block(oven, [.7, .48, .34], [0, 1.22, .62], dome, 'oven-vault', { bevel: .03, roughness: .85 });
  const layer = (width: number, height: number, z: number, color: string, name: string, emissive?: string) => { const mesh = part(oven, new THREE.ShapeGeometry(archShape(width, height), 12), color, name, emissive ? { emissive, roughness: .6 } : { roughness: .85 }); mesh.position.set(0, .98, z); return mesh; };
  layer(.64, .44, .795, STONE, 'oven-arch'); layer(.5, .36, .8, '#1d1715', 'oven-mouth');
  const fire = burning ? [layer(.36, .2, .805, EMBER, 'oven-fire', EMBER)] : [];
  if (burning) for (const [x, h] of [[-.08, .13], [0, .17], [.08, .11]] as const) { const flame = part(oven, new THREE.ConeGeometry(.04, h, 8), '#ffc35c', 'oven-flame', { emissive: '#ffb347', roughness: .6 }); flame.position.set(x, .98 + h / 2, .81); fire.push(flame); }
  for (const x of [-.12, 0, .12]) { const ember = cylinder(oven, .03, .22, 0, '#5b3a26', 'oven-log', { segments: 8, roughness: .9 }); ember.rotation.z = Math.PI / 2 + x; ember.position.set(x * .6, 1.0, .82); }
  cylinder(oven, .09, .8, 1.8, p.structure, 'oven-chimney', { segments: 16, ...metal }).position.z = .64;
  cylinder(oven, .16, .05, 2.24, p.structure, 'oven-chimney-cap', { segments: 16, bottomRadius: .1, ...metal }).position.z = .64;
  const dial = cylinder(oven, .05, .012, 0, PLATE, 'oven-thermometer', { segments: 20 }); dial.rotation.x = Math.PI / 2; dial.position.set(.55, .76, .757);
  const ring = part(oven, new THREE.TorusGeometry(.056, .009, 6, 22), p.trim, 'oven-gauge-rim', metal); ring.position.set(.55, .76, .762);
  block(oven, [.004, .04, .003], [.55, .77, .765], p.screen, 'oven-thermometer-needle').rotation.z = -.9;
  // Peel resting on the landing with a fresh pizza.
  const peel = new THREE.Group(); peel.name = 'oven-peel'; peel.position.set(.05, .98, .92); oven.add(peel);
  cylinder(peel, .16, .008, .004, OAK, 'oven-peel-blade', { segments: 24, roughness: .7 });
  const handle = cylinder(peel, .014, .8, 0, OAK, 'oven-peel-handle', { segments: 8, roughness: .7 }); handle.rotation.z = Math.PI / 2; handle.position.set(.56, .012, 0);
  cylinder(peel, .13, .016, .016, '#e8c27a', 'oven-pizza', { segments: 24, roughness: .8 });
  cylinder(peel, .112, .006, .027, '#c8503a', 'oven-pizza-sauce', { segments: 24, roughness: .7 });
  merged(peel, [[.04, .03], [-.05, .04], [.02, -.06], [-.04, -.03], [.07, -.02]].map(([x, z]) => new THREE.SphereGeometry(.018, 8, 6).scale(1, .4, 1).translate(x, .032, z)), '#f2ead5', 'oven-pizza-topping', { roughness: .8 });
  if (burning) setAssetAnimator(oven, ({ time }) => fire.forEach((mesh, i) => {
    (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = .85 + .25 * Math.sin(time * 9 + i * 1.7) + .1 * Math.sin(time * 23 + i);
    if (i > 0) mesh.scale.y = 1 + .18 * Math.sin(time * 11 + i * 2.1);
  }), fire);
  anchor(oven, 'mouth', [0, .98, .8]); anchor(oven, 'cook', [0, 0, 1.35]);
  return oven;
}

export const WALK_IN_COOLER = Object.freeze({ width: 2.4, depth: 2, height: 2.4, display: [.55, 2.02, 1.035] as const });
/**
 * Walk-in cold room, 2.4 × 2.0 × 2.4 m, door at +z with a viewing window, hinges, latch and kick plate; a condensing unit
 * with two fans sits on the roof. The display above the door is a surface-label area for a host-supplied temperature; the
 * host label or separate marker carries alerts. Static. Color changes the insulated panels.
 */
export function createWalkInCooler(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), panels = node.materials?.surface ?? node.color ?? p.surface, { width, depth, height, display } = WALK_IN_COOLER, cooler = new THREE.Group(); cooler.name = 'walk-in-cooler';
  block(cooler, [width + .02, .2, depth + .02], [0, .1, 0], p.trim, 'cooler-kick', metal);
  block(cooler, [width, height - .2, depth], [0, .2 + (height - .2) / 2, 0], panels, 'cooler-panel', { bevel: .02, roughness: .55 });
  block(cooler, [width + .04, .05, depth + .04], [0, height + .025, 0], p.trim, 'cooler-cap', metal);
  const seams: number[] = [];
  for (const x of [-.6, .6]) seams.push(x, .2, depth / 2 + .002, x, height, depth / 2 + .002, x, .2, -depth / 2 - .002, x, height, -depth / 2 - .002);
  for (const z of [-.5, .5]) for (const x of [-width / 2 - .002, width / 2 + .002]) seams.push(x, .2, z, x, height, z);
  wires(cooler, seams, p.trim, 'cooler-seam');
  block(cooler, [1.04, 2.06, .04], [-.35, 1.13, depth / 2 + .01], p.trim, 'cooler-door-frame', metal);
  block(cooler, [.9, 1.94, .1], [-.35, 1.14, depth / 2 + .04], panels, 'cooler-door', { bevel: .02, roughness: .5 });
  block(cooler, [.84, .26, .012], [-.35, .34, depth / 2 + .095], p.trim, 'cooler-door-kick', metal);
  block(cooler, [.3, .32, .012], [-.35, 1.6, depth / 2 + .095], p.glass, 'cooler-window', { roughness: .1, opacity: .7 });
  for (const y of [.62, 1.7]) block(cooler, [.08, .16, .08], [-.81, y, depth / 2 + .07], p.structure, 'cooler-hinge', metal);
  block(cooler, [.13, .14, .04], [.03, 1.14, depth / 2 + .1], p.structure, 'cooler-latch', metal);
  block(cooler, [.05, .3, .05], [.03, 1.09, depth / 2 + .135], p.structure, 'cooler-latch', { bevel: .015, ...metal });
  for (const angle of [0, Math.PI / 3, -Math.PI / 3]) block(cooler, [.2, .022, .004], [-.35, 1.05, depth / 2 + .095], p.accent, 'cooler-snowflake').rotation.z = angle;
  block(cooler, [.38, .18, .03], [display[0], display[1], depth / 2 + .015], p.screen, 'cooler-display', { bevel: .006 });
  merged(cooler, [-.08, 0, .08].map(x => new THREE.BoxGeometry(.05, .08, .004).translate(display[0] + x, display[1], depth / 2 + .032)), p.text, 'cooler-digits', { emissive: p.text });
  // Condensing unit and copper lines on the roof.
  block(cooler, [1.1, .42, .7], [.45, height + .26, -.35], p.trim, 'cooler-condenser', { bevel: .02, ...metal });
  for (const x of [.18, .72]) {
    cylinder(cooler, .19, .02, height + .48, p.screen, 'cooler-fan', { segments: 24 }).position.set(x, height + .48, -.35);
    const guard = part(cooler, new THREE.TorusGeometry(.19, .01, 6, 24), p.structure, 'cooler-fan-guard', metal); guard.rotation.x = Math.PI / 2; guard.position.set(x, height + .495, -.35);
    merged(cooler, [0, 1, 2].map(i => new THREE.BoxGeometry(.3, .006, .06).rotateY(i * Math.PI / 3).translate(x, height + .49, -.35)), p.structure, 'cooler-fan-blade');
  }
  for (const x of [-.25, -.15]) block(cooler, [.035, .035, .9], [x, height + .07, -.1], COPPER, 'cooler-line', metal);
  anchor(cooler, 'door', [-.35, 0, depth / 2 + .4]); anchor(cooler, 'display', [display[0], display[1], display[2]]);
  return cooler;
}

export const HEATED_PASS = Object.freeze({ length: 1.8, slots: [-.75, -.45, -.15, .15, .45, .75] as const, top: .89 });
/**
 * Heated pass (expo shelf), 1.8 m along x: cooks plate at −z, servers collect at +z. Three heat lamps hang from the
 * gantry and glow unless heatEnabled is false. `count` places 0–6 plated dishes with one ticket each on the rail above, left to
 * right; dishes are decorative and do not identify orders. Color changes the lamp hoods.
 */
export function createHeatedPass(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  validateOperatingProperties(node);
  const p = kitPalette(node, context), hood = node.materials?.accent ?? node.color ?? p.accent, { length, slots, top } = HEATED_PASS, { count } = resolveCountRepresentation(node, assetCountDefinitions['heated-pass']);
  const pass = new THREE.Group(); pass.name = 'heated-pass';
  block(pass, [length - .04, .08, .56], [0, .04, 0], p.screen, 'pass-plinth');
  block(pass, [length, .79, .6], [0, .475, 0], p.trim, 'pass-cabinet', { bevel: .01, ...metal });
  merged(pass, [-.45, .45].map(x => new THREE.BoxGeometry(.006, .66, .006).translate(x, .48, .302)), p.structure, 'pass-door-seam');
  for (const x of [-.65, -.25, .25, .65]) block(pass, [.2, .02, .025], [x, .76, .31], p.structure, 'pass-handle', metal);
  block(pass, [length + .04, .04, .64], [0, top - .02, 0], p.trim, 'pass-top', { bevel: .006, ...metal });
  for (const x of [-length / 2 + .03, length / 2 - .03]) block(pass, [.05, .74, .05], [x, top + .37, -.22], p.trim, 'pass-post', metal);
  block(pass, [length + .04, .03, .36], [0, top + .75, -.1], p.trim, 'pass-gantry', metal);
  const heat = node.heatEnabled === false ? { color: p.screen, options: {} } : { color: '#ffb072', options: { emissive: '#ff9a52' } };
  for (const x of [-.6, 0, .6]) {
    block(pass, [.5, .08, .22], [x, top + .69, -.05], hood, 'pass-lamp-hood', { bevel: .025, roughness: .45 });
    block(pass, [.44, .015, .14], [x, top + .645, -.05], heat.color, 'pass-heat-lamp', { roughness: .4, ...heat.options });
  }
  if (node.heatEnabled !== false) block(pass, [length - .1, .004, .5], [0, top + .003, .02], '#ffb072', 'pass-heat-glow', { emissive: '#ff9a52', opacity: .18 });
  block(pass, [length - .1, .025, .03], [0, top + .45, -.27], p.structure, 'pass-ticket-rail', metal);
  for (let i = 0; i < count; i++) {
    const dish = new THREE.Group(); dish.name = `count-part-${i}`; dish.position.set(slots[i], top, .05); pass.add(dish);
    cylinder(dish, .12, .014, .007, PLATE, 'pass-plate', { segments: 28, roughness: .25 });
    part(dish, new THREE.SphereGeometry(.07, 16, 8), FOOD[i % FOOD.length], 'pass-food', { roughness: .8 }).scale.set(1, .45, 1);
    part(dish, new THREE.SphereGeometry(.022, 8, 6), i % 2 ? '#5e9c58' : '#d65b45', 'pass-garnish', { roughness: .7 }).position.set(.03, .035, .02);
    const ticket = block(dish, [.085, .12, .003], [0, .39, -.34], PLATE, 'pass-ticket', { roughness: .9 }); ticket.rotation.z = (i % 3 - 1) * .05;
    merged(dish, [.03, .01, -.01, -.03].map((y, k) => new THREE.BoxGeometry(k ? .05 : .065, .007, .002).translate(0, .39 + y, -.343)), p.screen, 'pass-ticket-print');
  }
  part(pass, new THREE.SphereGeometry(.04, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), BRASS, 'pass-bell', metal).position.set(.84, top, .25);
  cylinder(pass, .008, .015, top + .045, BRASS, 'pass-bell', { segments: 8 }).position.set(.84, top + .045, .25);
  slots.forEach((x, i) => anchor(pass, `slot-${i}`, [x, top, .05]));
  anchor(pass, 'cook', [0, 0, -.75]); anchor(pass, 'server', [0, 0, .75]);
  return pass;
}

export const PICKUP_SHELF = Object.freeze({ width: 1.5, depth: .45, levels: [.115, .665, 1.215] as const, bays: [-.49, 0, .49] as const });
/**
 * Takeout pickup shelf, 1.5 × 0.45 × 1.95 m, collected from +z. `count` places 0–9 paper bags, three per level, bottom
 * level first; each bay LED lights while it holds a bag. The header is a surface-label area. Bags do not identify orders.
 * Color changes the frame.
 */
export function createPickupShelf(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), frame = node.materials?.accent ?? node.color ?? p.accent, { width, depth, levels, bays } = PICKUP_SHELF, { count } = resolveCountRepresentation(node, assetCountDefinitions['pickup-shelf']);
  const shelf = new THREE.Group(); shelf.name = 'pickup-shelf';
  for (const x of [-width / 2 + .02, width / 2 - .02]) for (const z of [-depth / 2 + .02, depth / 2 - .02]) block(shelf, [.04, 1.95, .04], [x, .975, z], frame, 'pickup-upright', { roughness: .45 });
  block(shelf, [width - .04, 1.75, .02], [0, .95, -depth / 2 + .01], p.surface, 'pickup-back', { roughness: .6 });
  for (const y of [...levels, 1.765]) {
    block(shelf, [width - .02, .03, depth - .02], [0, y - .015, 0], OAK, 'pickup-board', { bevel: .006, roughness: .6 });
    block(shelf, [width - .02, .04, .015], [0, y - .02, depth / 2 - .005], frame, 'pickup-lip');
  }
  for (const y of levels) for (const x of [-.245, .245]) block(shelf, [.015, .5, depth - .04], [x, y + .25, 0], p.trim, 'pickup-divider');
  block(shelf, [width + .02, .2, .04], [0, 1.88, depth / 2 - .01], p.screen, 'pickup-header', { bevel: .01 });
  levels.forEach((y, level) => bays.forEach((x, bay) => {
    const slot = level * 3 + bay, filled = slot < count;
    block(shelf, [.05, .016, .006], [x + .16, y - .02, depth / 2 + .004], filled ? p.normal : p.inactive, 'pickup-led', filled ? { emissive: p.normal } : {});
    anchor(shelf, `slot-${slot}`, [x, y, .02]);
    if (!filled) return;
    const bag = new THREE.Group(); bag.name = `count-part-${slot}`; bag.position.set(x, y, .02); bag.rotation.y = (bay - 1) * .06; shelf.add(bag);
    block(bag, [.27, .3, .17], [0, .15, 0], KRAFT, 'pickup-bag', { bevel: .01, roughness: .9 });
    block(bag, [.27, .05, .04], [0, .32, 0], '#b48a5e', 'pickup-bag-fold', { bevel: .008, roughness: .9 });
    block(bag, [.12, .08, .003], [0, .19, .087], PLATE, 'pickup-bag-sticker', { roughness: .8 });
  }));
  anchor(shelf, 'front', [0, 0, depth / 2 + .2]);
  return shelf;
}

/** Host stand with a sloped walnut desk, tablet, menus and a brass lamp; the host stands at −z, guests arrive at +z. Color changes the body. */
export function createHostStand(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), body = resolveObjectColor(node, context, 'wood', WALNUT), stand = new THREE.Group(); stand.name = 'host-stand';
  block(stand, [.64, .06, .44], [0, .03, 0], p.screen, 'host-plinth');
  block(stand, [.6, 1.0, .4], [0, .56, 0], body, 'host-body', { bevel: .02, roughness: .55 });
  merged(stand, [-.2, -.1, 0, .1, .2].map(x => new THREE.BoxGeometry(.012, .82, .006).translate(x, .56, .201)), p.screen, 'host-fluting', { roughness: .8 });
  block(stand, [.62, .03, .03], [0, .97, .2], BRASS, 'host-trim', metal);
  const desk = new THREE.Group(); desk.name = 'host-desk'; desk.position.set(0, 1.08, 0); desk.rotation.x = -.18; stand.add(desk);
  block(desk, [.7, .04, .5], [0, 0, 0], OAK, 'host-top', { bevel: .01, roughness: .5 });
  block(desk, [.25, .012, .18], [-.12, .026, -.02], p.screen, 'host-tablet', { bevel: .006 });
  block(desk, [.22, .004, .15], [-.12, .034, -.02], p.glass, 'host-tablet-screen', { emissive: p.glass, roughness: .2 });
  for (const [i, tone] of ['#5a3b2e', '#6d4535'].entries()) block(desk, [.16, .015, .26], [.19, .028 + i * .016, -.02 + i * .01], tone, 'host-menu', { bevel: .004, roughness: .7 }).rotation.y = i * .08;
  cylinder(stand, .008, .3, 1.28, BRASS, 'host-lamp', { segments: 8, ...metal }).position.set(.27, 1.28, .15);
  cylinder(stand, .03, .06, 1.44, BRASS, 'host-lamp', { segments: 12, bottomRadius: .07, ...metal }).position.set(.27, 1.44, .15);
  cylinder(stand, .05, .01, 1.405, WARM, 'host-lamp-glow', { segments: 12, emissive: WARM }).position.set(.27, 1.405, .15);
  anchor(stand, 'host', [0, 0, -.55]); anchor(stand, 'guest', [0, 0, .6]);
  return stand;
}

export const MENU_BOARD = Object.freeze({ length: 1, spread: .28, width: .6, thickness: .03 });
/**
 * Sidewalk A-frame chalkboard facing +z. The front face is a surface-label area for a menu; without artwork it shows chalk
 * placeholder lines. Static. Color changes the wooden frame.
 */
export function createMenuBoard(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), frame = resolveObjectColor(node, context, 'wood', OAK), { length, spread, width, thickness } = MENU_BOARD, angle = Math.asin(spread / length), hinge = length * Math.cos(angle) + thickness / 2 * Math.sin(angle);
  const board = new THREE.Group(); board.name = 'menu-board';
  for (const side of [1, -1]) {
    const face = new THREE.Group(); face.name = side > 0 ? 'menu-front' : 'menu-back'; face.position.y = hinge; face.rotation.x = -side * angle; board.add(face);
    for (const x of [-width / 2 + .025, width / 2 - .025]) block(face, [.05, length, thickness], [x, -length / 2, 0], frame, 'menu-frame', { bevel: .008, roughness: .6 });
    for (const y of [-.025, -length + .025]) block(face, [width, .05, thickness], [0, y, 0], frame, 'menu-frame', { bevel: .008, roughness: .6 });
    block(face, [width - .1, length - .1, .012], [0, -length / 2, 0], CHALK, 'menu-chalkboard', { roughness: .95 });
    const z = side * .0075;
    merged(face, [[.34, -.13], [.42, -.26], [.3, -.34], [.4, -.47], [.26, -.55], [.38, -.68], [.32, -.76]].map(([w, y], i) => new THREE.BoxGeometry(w, i === 0 ? .045 : .022, .002).translate(i === 0 ? 0 : -.2 + w / 2, y, z)), '#eef1f2', 'menu-chalk', { roughness: .95 });
    merged(face, [[-.17, -.26], [-.17, -.47], [-.17, -.68]].map(([x, y]) => new THREE.BoxGeometry(.03, .03, .002).translate(x + .4, y, z)), '#f0c36a', 'menu-chalk', { roughness: .95 });
    block(face, [width - .1, .03, .05], [0, -length + .06, side * .03], frame, 'menu-chalk-tray');
  }
  const hingePin = cylinder(board, .012, width + .02, 0, p.structure, 'menu-hinge', { segments: 8, ...metal }); hingePin.rotation.z = Math.PI / 2; hingePin.position.y = hinge;
  const chain: number[] = []; for (const x of [-width / 2 + .06, width / 2 - .06]) chain.push(x, hinge * .45, spread * .55, x, hinge * .45, -spread * .55);
  wires(board, chain, p.structure, 'menu-stay');
  anchor(board, 'front', [0, 0, spread + .3]);
  return board;
}

/**
 * Hood-type dishwasher with a pre-rinse inlet table (−x) and an outlet table (+x); the operator works at +z. Racks of
 * plates wait on both tables. Host labels or separate markers carry alerts. Static. Color changes the dish racks.
 */
export function createDishMachine(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), racks = node.materials?.accent ?? node.color ?? p.accent, machine = new THREE.Group(); machine.name = 'dish-machine';
  for (const x of [-.3, .3]) for (const z of [-.3, .3]) cylinder(machine, .025, .14, .07, p.trim, 'dish-leg', { segments: 8, ...metal }).position.set(x, .07, z);
  block(machine, [.7, .74, .7], [0, .51, 0], p.trim, 'dish-cabinet', { bevel: .01, ...metal });
  block(machine, [.74, .66, .74], [0, 1.22, 0], p.trim, 'dish-hood', { bevel: .02, ...metal });
  block(machine, [.7, .006, .006], [0, .89, .372], p.structure, 'dish-seam');
  const bar = cylinder(machine, .018, .6, 0, p.structure, 'dish-hood-handle', { segments: 10, ...metal }); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.0, .42);
  for (const x of [-.27, .27]) block(machine, [.03, .03, .06], [x, 1.0, .39], p.structure, 'dish-hood-handle');
  block(machine, [.34, .14, .34], [0, 1.62, -.1], p.trim, 'dish-top-housing', { bevel: .015, ...metal });
  block(machine, [.5, .15, .04], [0, 1.62, .36], p.screen, 'dish-panel', { bevel: .01 });
  block(machine, [.18, .07, .005], [-.1, 1.63, .382], p.glass, 'dish-panel-screen', { emissive: p.glass, roughness: .2 });
  const table = (x: number, width: number, name: string) => {
    block(machine, [width, .04, .7], [x, .88, 0], p.trim, `dish-${name}-table`, { bevel: .006, ...metal });
    block(machine, [width, .1, .03], [x, .95, -.335], p.trim, `dish-${name}-table`, metal);
    for (const dx of [-width / 2 + .05, width / 2 - .05]) for (const z of [-.3, .3]) block(machine, [.04, .86, .04], [x + dx, .43, z], p.trim, 'dish-leg', metal);
    block(machine, [width - .1, .03, .6], [x, .2, 0], p.trim, 'dish-undershelf', metal);
  };
  table(-.92, 1.06, 'inlet'); table(.82, .86, 'outlet');
  block(machine, [.42, .02, .42], [-1.1, .903, .02], p.screen, 'dish-sink', { roughness: .4 });
  cylinder(machine, .015, .9, 1.35, p.trim, 'dish-spray', { segments: 8, ...metal }).position.set(-1.32, 1.35, -.28);
  for (let i = 0; i < 6; i++) { const coil = part(machine, new THREE.TorusGeometry(.04, .006, 6, 16), p.trim, 'dish-spray', metal); coil.rotation.x = Math.PI / 2; coil.position.set(-1.32, 1.5 + i * .04, -.28); }
  const arm = cylinder(machine, .012, .35, 0, p.trim, 'dish-spray', { segments: 8, ...metal }); arm.rotation.x = Math.PI / 2; arm.position.set(-1.32, 1.8, -.1);
  cylinder(machine, .03, .08, 1.76, p.structure, 'dish-spray-head', { segments: 10 }).position.set(-1.32, 1.76, .06);
  for (const [x, i] of [[-.75, 0], [.82, 1]] as const) {
    const rack = new THREE.Group(); rack.name = 'dish-rack'; rack.position.set(x, .9, .02); machine.add(rack);
    for (const [w, d, dx, dz] of [[.5, .02, 0, -.24], [.5, .02, 0, .24], [.02, .5, -.24, 0], [.02, .5, .24, 0]] as const) block(rack, [w, .1, d], [dx, .05, dz], racks, 'dish-rack-frame', { roughness: .6 });
    const grid: number[] = []; gridWires(grid, [0, 0, 0], [.48, .48], .06, 'z'); for (let k = 0; k < grid.length; k += 3) [grid[k + 1], grid[k + 2]] = [.01, grid[k + 1]]; wires(rack, grid, racks, 'dish-rack-grid');
    merged(rack, Array.from({ length: i ? 7 : 5 }, (_, k) => new THREE.CylinderGeometry(.11, .11, .012, 20).rotateX(Math.PI / 2).translate(0, .12, -.18 + k * .06)), PLATE, 'dish-rack-plate', { roughness: .25 });
  }
  anchor(machine, 'inlet', [-.75, .9, 0]); anchor(machine, 'outlet', [.82, .9, 0]); anchor(machine, 'operator', [0, 0, .8]);
  return machine;
}

/** Market umbrella with a weighted base, open octagonal canopy with valance or furled closed. Static. Color changes the canopy. */
export function createPatioUmbrella(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['open', 'closed'] as const, 'patio umbrella'), p = kitPalette(node, context), canvas = resolveObjectColor(node, context, 'accent', '#d9644a');
  const umbrella = new THREE.Group(); umbrella.name = `patio-umbrella-${variant}`;
  cylinder(umbrella, .28, .1, .05, p.structure, 'umbrella-base', { segments: 24, bottomRadius: .3, roughness: .6 });
  cylinder(umbrella, .025, 2.42, 1.3, OAK, 'umbrella-pole', { segments: 10, roughness: .6 });
  block(umbrella, [.04, .08, .06], [0, 1.25, .04], p.trim, 'umbrella-crank', metal);
  if (variant === 'open') {
    // Alternating panels: the canopy color and a light canvas stripe, each merged into one double-sided mesh.
    const panels: THREE.BufferGeometry[][] = [[], []], step = Math.PI / 4;
    for (let i = 0; i < 8; i++) {
      panels[i % 2].push(new THREE.CylinderGeometry(.04, 1.45, .42, 1, 1, true, i * step, step).translate(0, 2.28, 0));
      panels[i % 2].push(new THREE.CylinderGeometry(1.45, 1.45, .12, 1, 1, true, i * step, step).translate(0, 2.01, 0));
    }
    [merged(umbrella, panels[0], canvas, 'umbrella-canopy', { roughness: .9 }), merged(umbrella, panels[1], '#f7f3ea', 'umbrella-stripe', { roughness: .9 })].forEach(mesh => { (mesh.material as THREE.Material).side = THREE.DoubleSide; });
    const ribs: number[] = [];
    for (let i = 0; i < 8; i++) { const a = i * step, x = Math.sin(a) * 1.38, z = Math.cos(a) * 1.38; ribs.push(0, 2.44, 0, x, 2.04, z, 0, 1.85, 0, x * .5, 2.22, z * .5); }
    wires(umbrella, ribs, p.structure, 'umbrella-rib');
  } else {
    cylinder(umbrella, .05, 1.25, 1.85, canvas, 'umbrella-canopy', { segments: 8, bottomRadius: .14, roughness: .9 });
    const strap = part(umbrella, new THREE.TorusGeometry(.1, .012, 6, 16), p.structure, 'umbrella-strap'); strap.rotation.x = Math.PI / 2; strap.position.y = 1.85;
  }
  part(umbrella, new THREE.SphereGeometry(.04, 12, 8), OAK, 'umbrella-finial', { roughness: .5 }).position.y = 2.53;
  anchor(umbrella, 'top', [0, 2.53, 0]);
  return umbrella;
}

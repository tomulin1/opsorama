import { modelVisualState } from './visual-states';
import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import { resolveCountRepresentation, type AssetNode, type MaterialPalette } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { setAssetAnimator } from '@opsorama/three';
import { resolveLabPalette } from './laboratory';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, cylinder, gridWires, merged, part, voltageSign, wires } from './parts';

export type StorageTankVariant = 'vertical' | 'horizontal';

function palette(node: AssetNode, context?: MaterialContext): MaterialPalette { return resolveLabPalette({ ...node, color: undefined }, context); }
/** Pipe stub along an axis with a flange at its open end; returns nothing because stubs are decorative. */
function pipe(group: THREE.Object3D, from: readonly [number, number, number], axis: 'x' | 'y' | 'z', length: number, radius: number, color: string, flange: string, name: string) {
  const along = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0), start = new THREE.Vector3(...from);
  const orient = (mesh: THREE.Mesh) => { if (axis === 'x') mesh.rotation.z = Math.PI / 2; if (axis === 'z') mesh.rotation.x = Math.PI / 2; };
  const tube = part(group, new THREE.CylinderGeometry(radius, radius, length, 16), color, name, { metalness: .3, roughness: .45 }); orient(tube); tube.position.copy(start).addScaledVector(along, length / 2);
  const ring = part(group, new THREE.CylinderGeometry(radius * 1.6, radius * 1.6, .04, 16), flange, `${name}-flange`, { metalness: .3, roughness: .45 }); orient(ring); ring.position.copy(start).addScaledVector(along, length - .03);
}

/**
 * Pedestal EV charger facing +z with screen, status strip, holstered plug and coiled cable. The `bay` anchor marks the
 * centre of a 5 m parking bay in front; charging sessions, power and pricing remain host data.
 */
export function createEvCharger(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), body = node.materials?.surface ?? node.color ?? p.surface;
  const charger = new THREE.Group(); charger.name = 'ev-charger';
  block(charger, [.6, .1, .45], [0, .05, 0], p.trim, 'charger-plinth', { bevel: .02 });
  block(charger, [.42, 1.45, .26], [0, .825, 0], body, 'charger-body', { bevel: .06, roughness: .4 });
  block(charger, [.44, .1, .28], [0, 1.5, 0], p.accent, 'charger-cap', { bevel: .04, roughness: .4 });
  block(charger, [.28, .2, .01], [0, 1.22, .131], p.screen, 'charger-screen', { roughness: .2 });
  const lit = node.state === 'inactive' ? p.inactive : p[modelVisualState(node)];
  block(charger, [.3, .03, .01], [0, 1.06, .131], lit, 'charger-status', node.state === 'inactive' ? { roughness: .6 } : { emissive: lit, roughness: .35 });
  block(charger, [.12, .16, .08], [.12, .88, .16], p.structure, 'charger-holster', { bevel: .02 });
  block(charger, [.06, .12, .06], [.12, .92, .21], p.screen, 'charger-plug', { bevel: .015 });
  const cable = part(charger, new THREE.TorusGeometry(.17, .018, 8, 28, Math.PI * 1.4), p.screen, 'charger-cable', { roughness: .6 }); cable.rotation.set(0, Math.PI / 2, -Math.PI * .45); cable.position.set(.23, .66, .02);
  voltageSign(charger, [0, .5, .131], .12, { sign: p.warning, bolt: p.screen }, 'charger');
  anchor(charger, 'plug', [.12, .92, .25]); anchor(charger, 'bay', [0, 0, 2.9]);
  return charger;
}

/**
 * Solar row geometry in metres: `pitch` is the module spacing along x (row length = count × pitch), `width` × `depth` is
 * one module, `tilt` is the module angle in radians toward +z, and `height` is the module-plane centre above the ground.
 */
export const SOLAR_ARRAY = Object.freeze({ pitch: 1.08, width: 1, depth: 1.7, tilt: .45, height: .85 });
/**
 * Ground-mounted solar row tilted toward +z, centred on the local origin. `count` (1–8) sets the number of modules, and
 * the rails, posts and footprint end with the last module, so a row never carries empty racking. `start`/`end` anchors
 * mark the row ends. Modules are decorative and do not encode power output.
 */
export function createSolarArray(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), cell = resolveObjectColor(node, context, 'accent', '#23436e'), { pitch, width, depth, tilt, height } = SOLAR_ARRAY;
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['solar-array']), total = count * pitch, row = total - (pitch - width);
  const array = new THREE.Group(); array.name = 'solar-array';
  // Rails and modules share the tilted plane; cell lines are one LineSegments object for all modules. Rails end flush
  // with the outer module edges (`row`); `total` keeps half a pitch on each end for the chaining anchors.
  const plane = new THREE.Group(); plane.name = 'solar-plane'; plane.position.y = height; plane.rotation.x = tilt; array.add(plane);
  const railY = -.05, rails = [-.5, .5] as const, cos = Math.cos(tilt), sin = Math.sin(tilt);
  for (const z of rails) block(plane, [row, .05, .06], [0, railY, z], p.structure, 'solar-rail', { metalness: .3, roughness: .45 });
  // Posts stand directly under each rail's centre line, evenly spaced and symmetric about x = 0 with a 0.26 m inset
  // from the module edge, and end at the rail centre so the post top sits inside the tilted rail. One post pair per
  // two modules plus one, at least two, keeps spans near 2 m: 2 posts for 1–2 modules up to 5 for 7–8.
  const posts = Math.max(2, Math.ceil(count / 2) + 1), inset = .26, spacing = (row - 2 * inset) / (posts - 1);
  for (let i = 0; i < posts; i++) for (const railZ of rails) {
    const x = -row / 2 + inset + i * spacing, z = railY * sin + railZ * cos, top = height + railY * cos - railZ * sin;
    block(array, [.2, .1, .2], [x, .05, z], p.trim, 'solar-footing');
    block(array, [.06, top - .1, .06], [x, .1 + (top - .1) / 2, z], p.structure, 'solar-post', { metalness: .3, roughness: .45 });
  }
  const grid: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = -total / 2 + (i + .5) * pitch, slot = new THREE.Group(); slot.name = `count-part-${i}`; slot.position.x = x; plane.add(slot);
    block(slot, [width, .04, depth], [0, 0, 0], p.trim, 'solar-frame', { metalness: .3, roughness: .4 });
    block(slot, [width - .04, .045, depth - .04], [0, 0, 0], cell, 'solar-cell', { roughness: .25, metalness: .2 });
    const lines: number[] = []; gridWires(lines, [0, 0, 0], [width - .04, depth - .04], .16, 'z');
    for (let k = 0; k < lines.length; k += 3) grid.push(lines[k] + x, .0235, lines[k + 1]);
  }
  if (grid.length) wires(plane, grid, '#8fa6c4', 'solar-cell-lines');
  anchor(array, 'start', [-total / 2, 0, 0]); anchor(array, 'end', [total / 2, 0, 0]);
  return array;
}

/**
 * Compact wind turbine at a disclosed symbolic scale (hub at 12.15 m, 5.4 m blades) facing +z.
 * Optional local motion turns the rotor on the shared clock; inactive turbines stay still. Output is host data.
 */
export function createWindTurbine(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), body = node.materials?.surface ?? node.color ?? p.surface;
  const turbine = new THREE.Group(); turbine.name = 'wind-turbine';
  cylinder(turbine, 1, .3, .15, p.trim, 'turbine-foundation', { segments: 24 });
  cylinder(turbine, .22, 11.6, 6.1, body, 'turbine-tower', { bottomRadius: .42, segments: 24, roughness: .45 });
  block(turbine, [.7, .7, 2], [0, 12.15, -.2], body, 'turbine-nacelle', { bevel: .2, roughness: .45 });
  part(turbine, new THREE.SphereGeometry(.06, 10, 8), p.critical, 'turbine-aviation-light', { emissive: p.critical }).position.set(0, 12.53, -.9);
  const rotor = new THREE.Group(); rotor.name = 'turbine-rotor'; rotor.position.set(0, 12.15, .95); turbine.add(rotor);
  const spinner = part(rotor, new THREE.ConeGeometry(.32, .7, 18), body, 'turbine-spinner', { roughness: .4 }); spinner.rotation.x = Math.PI / 2; spinner.position.z = .2;
  // Three tapered, slightly pitched blades merged into one mesh.
  const blades = [0, 1, 2].map(i => new THREE.CylinderGeometry(.06, .22, 5.2, 8).scale(1, 1, .25).rotateY(.25).translate(0, 2.8, 0).rotateZ(i * Math.PI * 2 / 3));
  merged(rotor, blades, body, 'turbine-blade', { roughness: .4 });
  anchor(turbine, 'hub', [0, 12.15, .95]); anchor(turbine, 'base', [0, 0, 0]);
  if (node.localMotion !== false) setAssetAnimator(turbine, ({ time }) => { rotor.rotation.z = -time * 1.2; }, [rotor]);
  return turbine;
}

/**
 * Process storage tank. Vertical: 2.4 m diameter shell with dome, ladder and top railing; horizontal: 4 m vessel on
 * saddles. The sight-glass tube is decorative and does not show a fill level. Color changes the shell.
 */
export function createStorageTank(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = (node.variant ?? 'vertical') as StorageTankVariant;
  if (variant !== 'vertical' && variant !== 'horizontal') throw new Error(`Unknown storage tank variant: ${node.variant}.`);
  const p = palette(node, context), shell = node.materials?.surface ?? node.color ?? p.surface, metal = { metalness: .25, roughness: .4 };
  const tank = new THREE.Group(); tank.name = `storage-tank-${variant}`;
  if (variant === 'vertical') {
    cylinder(tank, 1.25, .25, .125, p.structure, 'tank-skirt', { segments: 32 });
    cylinder(tank, 1.2, 3, 1.75, shell, 'tank-shell', { segments: 40, ...metal });
    const dome = part(tank, new THREE.SphereGeometry(1.2, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, 'tank-shell', metal); dome.scale.y = .3; dome.position.y = 3.25;
    for (const y of [1.25, 2.25]) { const seam = part(tank, new THREE.TorusGeometry(1.205, .015, 6, 48), p.trim, 'tank-seam'); seam.rotation.x = Math.PI / 2; seam.position.y = y; }
    cylinder(tank, .2, .12, 3.6, p.trim, 'tank-manway', { segments: 16 });
    // Ladder on the +x side: two rails and merged rungs.
    for (const z of [-.18, .18]) block(tank, [.04, 3.4, .04], [1.28, 1.95, z], p.structure, 'tank-ladder');
    merged(tank, Array.from({ length: 11 }, (_, i) => new THREE.BoxGeometry(.03, .03, .36).translate(1.28, .5 + i * .3, 0)), p.structure, 'tank-ladder-rung');
    const rail = part(tank, new THREE.TorusGeometry(.95, .025, 6, 40), p.warning, 'tank-railing'); rail.rotation.x = Math.PI / 2; rail.position.y = 3.95;
    for (let i = 0; i < 6; i++) block(tank, [.03, .45, .03], [Math.cos(i * Math.PI / 3) * .95, 3.72, Math.sin(i * Math.PI / 3) * .95], p.warning, 'tank-railing-post');
    cylinder(tank, .04, 2.6, 1.7, p.glass, 'tank-gauge', { segments: 10, opacity: .55, roughness: .1 }).position.set(.5, 1.7, 1.12);
    pipe(tank, [-.5, 3.45, 0], 'y', .35, .1, p.trim, p.structure, 'tank-inlet');
    pipe(tank, [0, .55, 1.15], 'z', .5, .1, p.trim, p.structure, 'tank-outlet');
    anchor(tank, 'inlet', [-.5, 3.8, 0]); anchor(tank, 'outlet', [0, .55, 1.65]);
  } else {
    for (const x of [-1.2, 1.2]) block(tank, [.3, .7, 1.8], [x, .35, 0], p.structure, 'tank-saddle', { bevel: .02 });
    const body = cylinder(tank, 1, 4, 0, shell, 'tank-shell', { segments: 40, ...metal }); body.rotation.z = Math.PI / 2; body.position.y = 1.3;
    for (const side of [-1, 1]) { const cap = part(tank, new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, 'tank-shell', metal); cap.scale.y = .35; cap.rotation.z = -side * Math.PI / 2; cap.position.set(side * 2, 1.3, 0); }
    for (const x of [-1, 0, 1]) { const seam = part(tank, new THREE.TorusGeometry(1.005, .015, 6, 48), p.trim, 'tank-seam'); seam.rotation.y = Math.PI / 2; seam.position.set(x, 1.3, 0); }
    cylinder(tank, .2, .12, 2.33, p.trim, 'tank-manway', { segments: 16 }).position.x = -.8;
    pipe(tank, [.8, 2.28, 0], 'y', .3, .1, p.trim, p.structure, 'tank-inlet');
    pipe(tank, [2.25, .7, 0], 'x', .4, .1, p.trim, p.structure, 'tank-outlet');
    anchor(tank, 'inlet', [.8, 2.58, 0]); anchor(tank, 'outlet', [2.65, .7, 0]);
  }
  return tank;
}

/**
 * Close-coupled pump set on a skid: motor (−x), coupling guard and pump casing (+x). Suction enters along +x and
 * discharge leaves upward; flow, pressure and running state remain host data. Color changes the motor.
 */
export function createPumpUnit(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), motor = node.materials?.accent ?? node.color ?? p.accent;
  const pump = new THREE.Group(); pump.name = 'pump-unit';
  block(pump, [1.6, .12, .6], [0, .06, 0], p.structure, 'pump-skid', { bevel: .01 });
  block(pump, [.4, .08, .36], [-.38, .16, 0], p.structure, 'pump-motor-foot');
  const body = cylinder(pump, .22, .6, 0, motor, 'pump-motor', { segments: 24, roughness: .45 }); body.rotation.z = Math.PI / 2; body.position.set(-.38, .4, 0);
  merged(pump, Array.from({ length: 6 }, (_, i) => new THREE.CylinderGeometry(.235, .235, .015, 24).rotateZ(Math.PI / 2).translate(-.62 + i * .09, .4, 0)), motor, 'pump-motor-fin', { roughness: .45 });
  const fan = cylinder(pump, .2, .08, 0, p.trim, 'pump-fan-cover', { segments: 20 }); fan.rotation.z = Math.PI / 2; fan.position.set(-.72, .4, 0);
  block(pump, [.16, .12, .16], [-.38, .67, 0], motor, 'pump-terminal-box', { bevel: .015 });
  voltageSign(pump, [-.38, .67, .081], .08, { sign: p.warning, bolt: p.screen }, 'pump');
  block(pump, [.24, .22, .26], [.03, .36, 0], p.warning, 'pump-guard', { bevel: .02 });
  block(pump, [.16, .18, .2], [.17, .3, 0], p.structure, 'pump-bearing-foot');
  const casing = cylinder(pump, .24, .2, 0, p.trim, 'pump-casing', { segments: 24, metalness: .3, roughness: .4 }); casing.rotation.z = Math.PI / 2; casing.position.set(.32, .4, 0);
  pipe(pump, [.42, .4, 0], 'x', .36, .09, p.trim, p.structure, 'pump-suction');
  pipe(pump, [.32, .62, 0], 'y', .32, .07, p.trim, p.structure, 'pump-discharge');
  anchor(pump, 'inlet', [.78, .4, 0]); anchor(pump, 'outlet', [.32, .94, 0]);
  return pump;
}

import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import type { AssetNode } from '@opsorama/core';
import type { MaterialContext } from './laboratory';
import { anchor, block, cylinder, part, wires } from './parts';
import { kitPalette, truss, variantOf } from './kit';

export type ValveVariant = 'open' | 'closed';

/** Cylinder along x with its centre at `position`. */
function xTube(group: THREE.Object3D, radius: number, length: number, position: readonly [number, number, number], color: string, name: string, metal = true): THREE.Mesh {
  const mesh = cylinder(group, radius, length, 0, color, name, { segments: 18, ...(metal ? { metalness: .3, roughness: .4 } : {}) });
  mesh.rotation.z = Math.PI / 2; mesh.position.set(...position); return mesh;
}

/**
 * Flanged ball valve on a 1.2 m pipe spool along x, on two supports. The lever lies along the pipe when open and
 * across it when closed; the host switches the variant. Color changes the lever. Flow and position feedback are host data.
 */
export function createValve(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['open', 'closed'] as const, 'valve'), p = kitPalette(node, context), lever = resolveObjectColor(node, context, 'accent', '#d65b5b'), y = .5;
  const valve = new THREE.Group(); valve.name = `valve-${variant}`;
  for (const x of [-.45, .45]) { block(valve, [.1, y - .07, .22], [x, (y - .07) / 2, 0], p.structure, 'valve-support'); block(valve, [.12, .03, .2], [x, y - .085, 0], p.structure, 'valve-clamp'); }
  for (const side of [-1, 1]) {
    xTube(valve, .07, .42, [side * .39, y, 0], p.trim, 'valve-pipe');
    xTube(valve, .13, .04, [side * .17, y, 0], p.structure, 'valve-flange');
    xTube(valve, .13, .04, [side * .575, y, 0], p.structure, 'valve-flange');
    for (let i = 0; i < 4; i++) { const angle = i * Math.PI / 2 + Math.PI / 4; xTube(valve, .014, .08, [side * .17, y + Math.cos(angle) * .1, Math.sin(angle) * .1], p.trim, 'valve-bolt'); }
  }
  part(valve, new THREE.SphereGeometry(.14, 20, 14), p.trim, 'valve-body', { metalness: .35, roughness: .35 }).position.y = y;
  xTube(valve, .1, .3, [0, y, 0], p.trim, 'valve-body');
  cylinder(valve, .03, .14, y + .2, p.structure, 'valve-stem', { segments: 12 });
  const handle = new THREE.Group(); handle.name = 'valve-lever'; handle.position.y = y + .27; handle.rotation.y = variant === 'open' ? 0 : Math.PI / 2; valve.add(handle);
  block(handle, [.06, .04, .06], [0, 0, 0], p.structure, 'valve-lever-hub');
  block(handle, [.38, .03, .05], [.19, 0, 0], lever, 'valve-lever-arm', { bevel: .012, roughness: .45 });
  anchor(valve, 'inlet', [-.6, y, 0]); anchor(valve, 'outlet', [.6, y, 0]); anchor(valve, 'handle', [0, y + .27, 0]);
  return valve;
}

/**
 * Hammerhead tower crane at a disclosed compact scale: 16 m mast, 14 m jib along +x and a 5 m counter-jib.
 * The trolley and hook hang at a fixed static position; slewing, lifting and load data are host concerns. Color changes the steelwork.
 */
export function createTowerCrane(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), steel = node.materials?.warning ?? node.color ?? p.warning, lacing: number[] = [];
  const crane = new THREE.Group(); crane.name = 'tower-crane';
  block(crane, [2.4, .6, 2.4], [0, .3, 0], p.trim, 'crane-foundation');
  truss(crane, lacing, 'y', .6, 16, [0, 0, 0], .6, 1.2, steel, 'crane-mast');
  block(crane, [1.6, .5, 1.6], [0, 16.25, 0], p.structure, 'crane-slewing');
  truss(crane, lacing, 'x', 0, 14, [0, 17, 0], .45, 1, steel, 'crane-jib', .07);
  truss(crane, lacing, 'x', -5.5, 0, [0, 17, 0], .45, 1, steel, 'crane-counter-jib', .07);
  for (let i = 0; i < 3; i++) block(crane, [.5, 1.1, 1.3], [-4.9 + i * .55, 16.2, 0], p.trim, 'crane-counterweight', { bevel: .03 });
  block(crane, [1.2, 1.1, 1], [.9, 16.05, .95], steel, 'crane-cab', { bevel: .06 });
  block(crane, [.02, .55, .8], [1.51, 16.2, .95], p.screen, 'crane-cab-window', { roughness: .15 });
  // Cat-head and tie bars from its apex to both jibs.
  truss(crane, lacing, 'y', 17.45, 20.5, [0, 0, 0], .35, .8, steel, 'crane-cat-head', .06);
  for (const [x, z] of [[9, -.45], [9, .45], [-5, -.45], [-5, .45]] as const) lacing.push(0, 20.5, 0, x, 17.45, z);
  block(crane, [.9, .3, .9], [9, 16.45, 0], p.structure, 'crane-trolley');
  lacing.push(-.15, 16.3, 0, -.15, 8.6, 0, .15, 16.3, 0, .15, 8.6, 0);
  block(crane, [.5, .5, .3], [9, 8.35, 0], p.warning, 'crane-hook-block', { bevel: .05 });
  const hook = part(crane, new THREE.TorusGeometry(.14, .04, 8, 16, Math.PI * 1.4), p.structure, 'crane-hook'); hook.position.set(9, 7.95, 0); hook.rotation.z = Math.PI * .8;
  wires(crane, lacing, `#${new THREE.Color(steel).multiplyScalar(.75).getHexString()}`, 'crane-lacing');
  anchor(crane, 'hook', [9, 7.8, 0]); anchor(crane, 'base', [0, 0, 0]);
  return crane;
}

/**
 * Rubber-tyred gantry crane spanning 8 m along x over a container lane along z, 7 m high. The trolley, ropes and
 * spreader hang at a fixed static position; moves and container identities are host data. Color changes the frame.
 */
export function createGantryCrane(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), frame = node.materials?.accent ?? node.color ?? p.accent;
  const gantry = new THREE.Group(); gantry.name = 'gantry-crane';
  for (const x of [-4, 4]) {
    block(gantry, [.5, .4, 3.6], [x, .7, 0], frame, 'gantry-sill', { bevel: .04 });
    for (const z of [-1.4, 1.4]) {
      block(gantry, [.4, 5.9, .4], [x, 3.85, z], frame, 'gantry-leg', { bevel: .04, roughness: .45 });
      for (const dz of [-.25, .25]) { const tyre = cylinder(gantry, .4, .3, 0, p.screen, 'gantry-tyre', { segments: 20, roughness: .85 }); tyre.rotation.z = Math.PI / 2; tyre.position.set(x, .4, z + dz); }
    }
    block(gantry, [.3, .3, 2.8], [x, 4.2, 0], frame, 'gantry-brace');
    block(gantry, [.8, .6, .9], [x * 1.08, 1.4, 0], p.structure, 'gantry-power-pack', { bevel: .04 });
  }
  for (const z of [-1.3, 1.3]) block(gantry, [8.8, .6, .45], [0, 7.1, z], frame, 'gantry-girder', { bevel: .05, roughness: .45 });
  block(gantry, [1.8, .55, 3.1], [1, 7.65, 0], p.structure, 'gantry-trolley', { bevel: .05 });
  block(gantry, [1.1, 1, .9], [2.2, 6.2, 1.1], p.surface, 'gantry-cab', { bevel: .06 });
  block(gantry, [.02, .55, .7], [2.76, 6.3, 1.1], p.screen, 'gantry-cab-window', { roughness: .15 });
  const ropes: number[] = []; for (const x of [.4, 1.6]) for (const z of [-.25, .25]) ropes.push(x, 7.4, z, x, 3.4, z);
  wires(gantry, ropes, p.screen, 'gantry-rope');
  block(gantry, [2.4, .25, .7], [1, 3.25, 0], p.warning, 'gantry-spreader', { bevel: .03 });
  for (const x of [-4, 4]) for (const z of [-1.4, 1.4]) block(gantry, [.08, .08, .08], [x, 6.9, z], p.critical, 'gantry-warning-light', { emissive: p.critical });
  anchor(gantry, 'hook', [1, 3.1, 0]); anchor(gantry, 'lane', [0, 0, 0]);
  return gantry;
}

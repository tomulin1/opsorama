import * as THREE from 'three';
import type { MaterialContext } from '@opsorama/three';
import { resolveObjectColor } from './object-palette';
import type { AssetNode } from '@opsorama/core';
import { anchor, block, cylinder, part, wheel } from './parts';

/** Rigid delivery truck in metres: length nose to tail, width of the cargo box, and the cargo interior above `floorTop`, the dock height. */
export const TRUCK = Object.freeze({ length: 9.6, width: 2.55, height: 3.85, floorTop: 1.2, cargo: Object.freeze({ length: 7.2, width: 2.45, height: 2.6, centerZ: -1.15 }) });
const TRUCK_TAIL = -TRUCK.length / 2, TRUCK_TIRE = { radius: .46, width: .3, twin: .24 } as const;

/**
 * Rigid 12 t box truck facing +z, base-center pivot. Its 7.2 × 2.45 × 2.6 m cargo body holds 14 pallets of 1.2 × 1.0 m two
 * across on a floor 1.2 m high, level with a dock platform. Color changes the cab and box bands. The body is a closed shell.
 */
export function createTruck(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const truck = new THREE.Group(); truck.name = 'truck';
  const color = resolveObjectColor(node, context, 'accent', '#497bec'), frame = '#3a4656', dark = '#273545', trim = '#c3cedc';
  const { width, height, floorTop, cargo } = TRUCK, bodyBase = floorTop - .15, bodyLength = cargo.length + .1, bodyZ = TRUCK_TAIL + bodyLength / 2;
  block(truck, [1.1, .28, 9.1], [0, .9, -.2], frame, 'truck-chassis');
  block(truck, [width, height - bodyBase, bodyLength], [0, (height + bodyBase) / 2, bodyZ], '#f4f6fc', 'truck-body', { bevel: .04 });
  block(truck, [width + .02, .3, bodyLength + .02], [0, bodyBase + .15, bodyZ], color, 'truck-band');
  block(truck, [width + .02, .12, bodyLength + .02], [0, height - .13, bodyZ], color, 'truck-band');
  // Forward-control cab above the front axle; the windshield, doors and grille sit on its faces.
  block(truck, [2.4, 2.15, 2.1], [0, 2.075, 3.67], color, 'truck-cab', { bevel: .12 });
  block(truck, [2.06, .92, .03], [0, 2.5, 4.725], '#1c3455', 'truck-glass', { roughness: .2 });
  block(truck, [2.4, .34, .2], [0, .78, 4.7], '#f9fcff', 'truck-bumper');
  block(truck, [2.2, .3, .12], [0, 1.1, 4.65], frame, 'truck-grille-panel');
  block(truck, [1.7, .5, .03], [0, 1.5, 4.72], '#293c52', 'truck-grille');
  for (let i = 0; i < 4; i++) block(truck, [1.6, .03, .035], [0, 1.32 + i * .12, 4.735], '#3e5570', 'truck-grille');
  for (const side of [-1, 1]) {
    block(truck, [.03, .8, .95], [side * 1.205, 2.5, 3.95], '#234063', 'truck-glass', { roughness: .2 });
    block(truck, [.34, .18, .03], [side * .9, 1.1, 4.72], '#f8e5ab', 'truck-light', { emissive: '#f8e5ab' });
    block(truck, [.012, 1.75, .012], [side * 1.206, 2.05, 3.2], '#2f5bc0', 'truck-door-seam'); block(truck, [.02, .04, .18], [side * 1.21, 1.9, 3.45], '#d6dee9', 'truck-handle');
    block(truck, [.26, .03, .03], [side * 1.3, 2.75, 4.45], dark, 'truck-mirror'); block(truck, [.06, .45, .2], [side * 1.42, 2.6, 4.45], dark, 'truck-mirror');
    block(truck, [.3, .05, .5], [side * 1.08, .62, 2.85], frame, 'truck-step');
    block(truck, [.04, .1, 3.1], [side * 1.25, .82, .65], trim, 'truck-side-guard');
    block(truck, [.5, .45, .02], [side * 1, .42, -2.3], dark, 'truck-mud-flap');
    wheel(truck, [side * 1.03, TRUCK_TIRE.radius, 3.55], TRUCK_TIRE.radius, TRUCK_TIRE.width);
    // Twin tires on the driven rear axle.
    for (const x of [.88, 1.12]) wheel(truck, [side * x, TRUCK_TIRE.radius, -1.75], TRUCK_TIRE.radius, TRUCK_TIRE.twin);
    block(truck, [.3, .16, .03], [side * .95, .78, TRUCK_TAIL + .03], '#d65b5b', 'truck-tail-light');
    block(truck, [.03, height - bodyBase - .3, .03], [side * .35, (height + bodyBase) / 2, TRUCK_TAIL - .005], trim, 'truck-door-bar');
  }
  // Saddle fuel tank between the axles, rear underrun bar and the seam between the rear doors.
  const tank = cylinder(truck, .28, 1.2, .62, '#b8c8d7', 'truck-tank', { segments: 14, roughness: .35, metalness: .3 }); tank.rotation.x = Math.PI / 2; tank.position.set(.95, .62, .75);
  block(truck, [2.4, .3, .1], [0, .72, TRUCK_TAIL + .08], frame, 'truck-underrun');
  block(truck, [.015, height - bodyBase - .1, .015], [0, (height + bodyBase) / 2, TRUCK_TAIL - .005], trim, 'truck-door-seam');
  anchor(truck, 'entrance', [0, floorTop, TRUCK_TAIL]); anchor(truck, 'load', [0, floorTop, cargo.centerZ]);
  return truck;
}

/** Side profile (z forward, y up) extruded across the van's width. */
const VAN_PROFILE: readonly (readonly [number, number])[] = [[-2.6, .35], [2.6, .35], [2.6, 1.1], [2.05, 1.3], [1.35, 2.45], [-2.6, 2.45]];

/** Last-mile panel van facing +z, 5.2 × 2 m and 2.45 m high. Color changes the side stripe and bumpers; the rear load anchor sits at the doors, at cargo floor height. */
export function createDeliveryVan(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const van = new THREE.Group(); van.name = 'delivery-van';
  const accent = resolveObjectColor(node, context, 'accent', '#497bec');
  const shape = new THREE.Shape(VAN_PROFILE.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }); geometry.rotateY(-Math.PI / 2); geometry.translate(1, 0, 0);
  part(van, geometry, '#f4f6fc', 'van-body', { roughness: .55 });
  const windshield = block(van, [1.78, 1.14, .03], [0, 1.875, 1.72], '#1c3455', 'van-glass', { roughness: .2 }); windshield.rotation.x = -Math.atan2(.7, 1.15);
  for (const x of [-1.01, 1.01]) {
    block(van, [.02, .6, .75], [x, 1.98, 1.05], '#234063', 'van-glass', { roughness: .2 });
    block(van, [.02, .2, 4.9], [x, .95, -.15], accent, 'van-stripe');
  }
  for (const z of [-2.62, 2.62]) block(van, [2.04, .2, .12], [0, .45, z], accent, 'van-bumper');
  for (const x of [-.72, .72]) block(van, [.32, .16, .03], [x, 1, 2.615], '#f8e5ab', 'van-light', { emissive: '#f8e5ab' });
  for (const x of [-.85, .85]) block(van, [.12, .5, .03], [x, 1.5, -2.615], '#d65b5b', 'van-light');
  block(van, [.02, 2, .03], [0, 1.4, -2.615], '#c3cedc', 'van-door-seam');
  for (const x of [-.9, .9]) for (const z of [-1.6, 1.75]) {
    wheel(van, [x, .35, z], .35, .24);
    // Dark half-disc on the body side reads as the wheel well above each tire.
    const well = part(van, new THREE.CylinderGeometry(.43, .43, .02, 18, 1, false, 0, Math.PI), '#273545', 'van-wheel-well'); well.rotation.z = Math.PI / 2; well.position.set(Math.sign(x) * 1.005, .35, z);
  }
  block(van, [1.2, .26, .03], [0, .8, 2.61], '#293c52', 'van-grille', { bevel: .01 });
  for (const x of [-1.14, 1.14]) { block(van, [.16, .025, .025], [x * .97, 1.75, 1.5], '#273545', 'van-mirror'); block(van, [.05, .24, .14], [x, 1.72, 1.5], '#273545', 'van-mirror', { bevel: .01 }); }
  for (const x of [-1.006, 1.006]) {
    block(van, [.012, 1.3, .012], [x, 1.6, .45], '#c3cedc', 'van-door-seam'); block(van, [.012, 1.95, .012], [x, 1.35, -.6], '#c3cedc', 'van-door-seam');
    block(van, [.02, .03, .13], [x * 1.005, 1.4, .25], '#7f8fa6', 'van-handle'); block(van, [.02, .03, .13], [x * 1.005, 1.4, -.4], '#7f8fa6', 'van-handle');
  }
  for (const x of [-.4, .4]) block(van, [.02, .3, .03], [x, 1.4, -2.615], '#7f8fa6', 'van-handle');
  anchor(van, 'load', [0, .55, -2.72]);
  return van;
}

function tube(group: THREE.Object3D, from: readonly [number, number, number], to: readonly [number, number, number], color: string, name: string, thickness = .05) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const mesh = part(group, new THREE.BoxGeometry(thickness, a.distanceTo(b), thickness), color, name);
  mesh.position.copy(a).lerp(b, .5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return mesh;
}
function bikeWheel(group: THREE.Object3D, z: number) {
  const tire = part(group, new THREE.TorusGeometry(.29, .045, 8, 28), '#273545', 'bike-tire'); tire.rotation.y = Math.PI / 2; tire.position.set(0, .335, z);
  const hub = part(group, new THREE.CylinderGeometry(.05, .05, .09, 12), '#b8c8d7', 'bike-hub'); hub.rotation.z = Math.PI / 2; hub.position.set(0, .335, z);
  for (let i = 0; i < 6; i++) { const spoke = block(group, [.01, .56, .01], [0, .335, z], '#c3cedc', 'bike-spoke'); spoke.rotation.x = i * Math.PI / 6; }
  const rim = part(group, new THREE.TorusGeometry(.25, .012, 6, 28), '#b8c8d7', 'bike-rim', { metalness: .3, roughness: .4 }); rim.rotation.y = Math.PI / 2; rim.position.set(0, .335, z);
  const guard = part(group, new THREE.TorusGeometry(.34, .025, 4, 18, Math.PI * .7), '#3a4656', 'bike-mudguard'); guard.rotation.set(0, Math.PI / 2, Math.PI * .15); guard.position.set(0, .335, z);
}

/** Front-loader cargo bike facing +z with the cargo box between rider and front wheel. Color changes the cargo box. */
export function createCargoBike(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const bike = new THREE.Group(); bike.name = 'cargo-bike';
  const frame = '#3a4656', cargo = resolveObjectColor(node, context, 'accent', '#3fa37f');
  bikeWheel(bike, -.75); bikeWheel(bike, .95);
  tube(bike, [0, .335, -.75], [0, .3, -.25], frame, 'bike-frame');
  tube(bike, [0, .3, -.25], [0, .95, -.4], frame, 'bike-frame');
  tube(bike, [0, .3, -.25], [0, .3, .8], frame, 'bike-frame');
  tube(bike, [0, .335, .95], [0, .3, .78], frame, 'bike-frame');
  tube(bike, [0, .3, -.12], [0, 1.05, -.06], frame, 'bike-frame');
  tube(bike, [0, .62, -.42], [0, .335, -.75], frame, 'bike-frame', .04);
  block(bike, [.56, .04, .04], [0, 1.07, -.06], frame, 'bike-handlebar');
  for (const x of [-.26, .26]) block(bike, [.06, .05, .1], [x, 1.07, -.06], '#273545', 'bike-grip');
  block(bike, [.14, .05, .26], [0, .98, -.42], '#273545', 'bike-seat');
  block(bike, [.16, .03, .06], [0, .3, -.25], '#7f8ea3', 'bike-crank');
  const ring = part(bike, new THREE.CylinderGeometry(.1, .1, .015, 18), '#7f8ea3', 'bike-chainring', { metalness: .4, roughness: .35 }); ring.rotation.z = Math.PI / 2; ring.position.set(.06, .3, -.25);
  for (const side of [-1, 1]) block(bike, [.1, .025, .06], [side * .12, .3 + side * .08, -.25], '#273545', 'bike-pedal');
  block(bike, [.6, .03, .68], [0, .345, .4], frame, 'bike-platform');
  block(bike, [.62, .42, .7], [0, .57, .4], cargo, 'bike-cargo', { bevel: .03 });
  block(bike, [.56, .02, .64], [0, .79, .4], '#eaf0f8', 'bike-cargo-lid', { bevel: .008 });
  block(bike, [.16, .025, .03], [0, .805, .68], '#3a4656', 'bike-cargo-handle');
  anchor(bike, 'cargo', [0, .8, .4]);
  return bike;
}

/** Hand pallet jack: forks extend toward −z, the tilted handle toward +z. Color changes the chassis and pump. */
export function createPalletJack(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const jack = new THREE.Group(); jack.name = 'pallet-jack';
  const body = resolveObjectColor(node, context, 'accent', '#e2a43b'), steel = '#56657a';
  for (const x of [-.27, .27]) {
    block(jack, [.16, .07, 1.15], [x, .085, -.55], steel, 'jack-fork', { metalness: .25, roughness: .45 });
    // Tapered fork tips for pallet entry.
    const tip = block(jack, [.16, .05, .12], [x, .07, -1.15], steel, 'jack-fork-tip', { metalness: .25, roughness: .45 }); tip.rotation.x = -.25;
    const roller = part(jack, new THREE.CylinderGeometry(.04, .04, .12, 10), '#273545', 'jack-roller'); roller.rotation.z = Math.PI / 2; roller.position.set(x, .04, -1.03);
  }
  block(jack, [.72, .14, .24], [0, .14, .12], body, 'jack-chassis', { bevel: .02, roughness: .45 });
  block(jack, [.2, .16, .2], [0, .12, .26], body, 'jack-chassis');
  cylinder(jack, .07, .42, .42, body, 'jack-pump', { segments: 14, roughness: .45 }).position.z = .18;
  cylinder(jack, .025, .14, .68, '#d6dee9', 'jack-piston', { segments: 10, metalness: .5, roughness: .25 }).position.z = .18;
  for (const x of [-.09, .09]) { const drive = part(jack, new THREE.CylinderGeometry(.1, .1, .07, 16), '#273545', 'jack-wheel'); drive.rotation.z = Math.PI / 2; drive.position.set(x, .1, .3);
    const hub = part(jack, new THREE.CylinderGeometry(.045, .045, .075, 12), '#b8c8d7', 'jack-wheel-hub'); hub.rotation.z = Math.PI / 2; hub.position.set(x, .1, .3); }
  const handle = new THREE.Group(); handle.name = 'jack-handle'; handle.position.set(0, .6, .2); handle.rotation.x = .35; jack.add(handle);
  block(handle, [.05, .8, .05], [0, .4, 0], steel, 'jack-handle-shaft');
  block(handle, [.34, .05, .05], [0, .82, 0], '#273545', 'jack-grip');
  for (const x of [-.15, .15]) block(handle, [.04, .14, .04], [x, .76, 0], steel, 'jack-handle-shaft');
  anchor(jack, 'load', [0, .12, -.55]);
  return jack;
}

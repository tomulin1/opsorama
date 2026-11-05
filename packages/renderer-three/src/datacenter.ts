import * as THREE from 'three';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { setAssetAnimator } from './animation';
import { anchor, block, cylinder, part, voltageSign } from './parts';
import { resolveLabPalette, type MaterialContext } from './laboratory';
import { addActivityLeds, type ActivityLed } from './activity-leds';

export type RackServerVariant = '1u' | '2u';

/** Simplified 19-inch server, grounded at its mounting plane and facing +z. */
export function createRackServer(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette({ ...node, color: undefined }, context), METAL = p.trim, TRIM = p.structure, DARK = p.screen;
  const variant = node.variant ?? '2u';
  if (variant !== '1u' && variant !== '2u') throw new Error(`Unknown rack server variant: ${variant}.`);
  const server = new THREE.Group(); server.name = 'rack-server';
  const activity: ActivityLed[] = [];
  const height = variant === '1u' ? .04445 : .0889, face = node.materials?.surface ?? node.color ?? p.surface;
  block(server, [.44, height, .65], [0, height / 2, 0], METAL, 'server-chassis', { metalness: .35, roughness: .45 });
  block(server, [.483, height, .018], [0, height / 2, .334], face, 'server-face');
  for (const x of [-.23, .23]) block(server, [.012, height * .65, .02], [x, height / 2, .353], TRIM, 'server-handle');
  for (let i = 0; i < 4; i++) {
    const x = -.145 + i * .085;
    block(server, [.075, height * .65, .004], [x, height / 2, .345], DARK, 'server-drive');
    block(server, [.052, .003, .005], [x, height / 2, .348], METAL, 'server-drive-grip');
    activity.push({ position: [x - .027, height * .3, .349], activity: true }, { position: [x - .015, height * .3, .349], activity: false });
  }
  block(server, [.025, height * .6, .004], [.18, height / 2, .345], DARK, 'server-control');
  for (const x of [-.232, .232]) for (const y of [height * .2, height * .8]) block(server, [.004, .004, .002], [x, y, .365], p.text, 'server-mount-screw');
  for (const x of [-.14, 0, .14]) block(server, [.09, height * .5, .006], [x, height / 2, -.328], DARK, 'server-rear-vent');
  for (const x of [-.07, .07]) activity.push({ position: [x, height * .72, -.333], activity: true }, { position: [x + .014, height * .72, -.333], activity: false });
  anchor(server, 'mount', [0, 0, 0]); anchor(server, 'front', [0, height / 2, .365]); anchor(server, 'rear', [0, height / 2, -.335]);
  addActivityLeds(server, node, activity, p.normal, [.007, .007, .004], 'server-drive-led');
  return server;
}

/** 24-port switch; count marks connected ports, never traffic, devices or network topology. */
export function createNetworkSwitch(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette({ ...node, color: undefined }, context), METAL = p.trim, TRIM = p.structure, DARK = p.screen;
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['network-switch']);
  const network = new THREE.Group(); network.name = 'network-switch';
  const face = node.materials?.surface ?? node.color ?? p.surface;
  block(network, [.44, .04445, .28], [0, .022225, 0], METAL, 'switch-chassis', { metalness: .35, roughness: .45 });
  block(network, [.483, .04445, .014], [0, .022225, .147], face, 'switch-face');
  for (let i = 0; i < 24; i++) {
    const x = -.169 + (i % 12) * .029, y = i < 12 ? .012 : .032;
    block(network, [.022, .014, .004], [x, y, .156], TRIM, 'switch-port-rim');
    block(network, [.017, .009, .003], [x, y, .159], DARK, 'switch-port');
    if (i < count) {
      const plug = new THREE.Group(); plug.name = `count-part-${i}`; plug.position.set(x, y, .166); network.add(plug);
      block(plug, [.014, .008, .012], [0, 0, 0], p.accent, 'switch-plug');
      block(plug, [.005, .005, .006], [0, 0, .009], p.accent, 'switch-cable-boot');
      block(network, [.005, .002, .003], [x, y + .008, .16], p.normal, 'switch-link-led', { emissive: p.normal });
    }
    anchor(network, `port-${i}`, [x, y, .174]);
  }
  block(network, [.018, .018, .004], [.202, .022225, .156], DARK, 'switch-uplink');
  anchor(network, 'mount', [0, 0, 0]); anchor(network, 'uplink', [.202, .022225, .16]);
  return network;
}

/** In-row cooling cabinet. Fan rotation is decorative; airflow and temperature remain host data. */
export function createCoolingUnit(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette({ ...node, color: undefined }, context), METAL = p.trim, TRIM = p.structure, DARK = p.screen;
  const cooling = new THREE.Group(); cooling.name = 'cooling-unit';
  const panel = node.materials?.surface ?? node.color ?? p.surface;
  block(cooling, [.6, .1, 1], [0, .05, 0], TRIM, 'cooling-plinth');
  block(cooling, [.6, 1.9, 1], [0, 1.05, 0], panel, 'cooling-housing', { bevel: .015, roughness: .5 });
  block(cooling, [.5, 1.65, .02], [0, 1.05, .51], DARK, 'cooling-grille');
  const fans: THREE.Group[] = [];
  for (const y of [.55, 1.05, 1.55]) {
    const rim = part(cooling, new THREE.TorusGeometry(.18, .012, 6, 24), METAL, 'cooling-fan-rim', { metalness: .35, roughness: .4 }); rim.position.set(0, y, .53);
    const fan = new THREE.Group(); fan.name = 'cooling-fan'; fan.position.set(0, y, .532); cooling.add(fan); fans.push(fan);
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Group(); blade.rotation.z = i * Math.PI * 2 / 5; fan.add(blade);
      block(blade, [.065, .115, .01], [.025, .09, 0], p.trim, 'cooling-blade').rotation.z = -.4;
    }
    const hub = cylinder(fan, .035, .018, 0, METAL, 'cooling-hub', { segments: 12 }); hub.rotation.x = Math.PI / 2;
  }
  for (const y of [.34, .78, 1.28, 1.76]) block(cooling, [.46, .012, .012], [0, y, .55], METAL, 'cooling-guard');
  block(cooling, [.16, .065, .014], [0, 1.94, .508], DARK, 'cooling-display');
  for (const x of [-.275, .275]) block(cooling, [.012, 1.78, .014], [x, 1.05, .512], METAL, 'cooling-door-seam');
  block(cooling, [.018, .14, .025], [.27, 1, .522], TRIM, 'cooling-door-handle');
  for (let i = 0; i < 8; i++) block(cooling, [.48, .045, .018], [0, .4 + i * .19, -.508], TRIM, 'cooling-rear-louver');
  anchor(cooling, 'intake', [0, 1, .56]); anchor(cooling, 'exhaust', [0, 1, -.525]);
  if (node.localMotion !== false) setAssetAnimator(cooling, ({ time }) => fans.forEach(fan => { fan.rotation.z = -time * 3; }), fans);
  return cooling;
}

/** UPS cabinet with 0-6 decorative battery modules; count is not charge or energy capacity. */
export function createUpsUnit(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette({ ...node, color: undefined }, context), METAL = p.trim, TRIM = p.structure, DARK = p.screen;
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['ups-unit']);
  const ups = new THREE.Group(); ups.name = 'ups-unit';
  const panel = node.materials?.surface ?? node.color ?? p.surface;
  block(ups, [.7, .1, .8], [0, .05, 0], TRIM, 'ups-plinth');
  for (const x of [-.325, .325]) block(ups, [.05, 1.5, .8], [x, .85, 0], panel, 'ups-housing');
  block(ups, [.7, .05, .8], [0, 1.625, 0], panel, 'ups-housing');
  block(ups, [.6, 1.5, .025], [0, .85, -.3875], TRIM, 'ups-back');
  block(ups, [.6, .3, .8], [0, 1.45, 0], panel, 'ups-control', { bevel: .015, roughness: .5 });
  block(ups, [.18, .09, .012], [0, 1.49, .406], DARK, 'ups-display');
  voltageSign(ups, [.21, 1.47, .401], .13, { sign: p.warning, bolt: p.screen }, 'ups');
  for (let i = 0; i < 6; i++) {
    const y = .2 + i * .19;
    block(ups, [.6, .012, .72], [0, y - .08, 0], METAL, 'ups-shelf');
    anchor(ups, `module-${i}`, [0, y - .07, 0]);
    if (i < count) {
      const battery = new THREE.Group(); battery.name = `count-part-${i}`; battery.position.y = y; ups.add(battery);
      block(battery, [.56, .14, .7], [0, 0, 0], p.surface, 'ups-battery');
      block(battery, [.22, .025, .025], [0, 0, .365], TRIM, 'ups-handle');
      block(battery, [.025, .055, .012], [.22, 0, .356], p.accent, 'ups-battery-mark');
    }
  }
  anchor(ups, 'power-in', [-.18, .22, -.41]); anchor(ups, 'power-out', [.18, .22, -.41]);
  return ups;
}

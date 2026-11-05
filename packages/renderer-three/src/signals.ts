import * as THREE from 'three';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { setAssetAnimator } from './animation';
import { assetCountDefinitions } from './asset-counts';
import { anchor, block, cylinder, part } from './parts';
import { objectPalette, resolveObjectColor } from './object-palette';
import type { MaterialContext } from './laboratory';
import { createMeasuredCapacityGauge } from './gauges';

const BEACON_LAMPS = [
  { role: 'normal', lit: '#3fb38c', dim: '#5f7c72', y: 1.33 },
  { role: 'warning', lit: '#f0b43c', dim: '#86775a', y: 1.57 },
  { role: 'critical', lit: '#e35d5d', dim: '#876064', y: 1.81 },
] as const;

/**
 * Stack light: normal and busy light the bottom lamp, warning the middle, critical the top; inactive is dark.
 * The lit lamp reads clearly without motion; the optional pulse only scales its translucent halo.
 */
export function createStatusBeacon(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const beacon = new THREE.Group(); beacon.name = 'status-beacon';
  const housing = resolveObjectColor(node, context, 'structure', '#5a6b82');
  cylinder(beacon, .26, .12, .06, housing, 'housing-base', { bottomRadius: .3 });
  cylinder(beacon, .045, 1.1, .67, housing, 'housing-pole', { segments: 12, metalness: .3, roughness: .4 });
  const active = node.state === 'inactive' ? undefined : node.state === 'warning' || node.state === 'critical' ? node.state : 'normal';
  let halo: THREE.Mesh | undefined;
  for (const lamp of BEACON_LAMPS) {
    const lit = lamp.role === active;
    const ink = node.materials?.[lamp.role] ?? context?.palette?.[lamp.role] ?? lamp.lit;
    const dim = node.state === 'inactive' ? node.materials?.inactive ?? context?.palette?.inactive ?? lamp.dim : lamp.dim;
    cylinder(beacon, .17, .22, lamp.y, lit ? ink : dim, `lamp-${lamp.role}`, lit ? { emissive: ink, roughness: .35 } : { roughness: .5 });
    if (lit) halo = cylinder(beacon, .215, .25, lamp.y, ink, 'lamp-halo', { opacity: .28 });
    cylinder(beacon, .18, .02, lamp.y + .12, housing, `lamp-rim-${lamp.role}`);
  }
  cylinder(beacon, .18, .02, BEACON_LAMPS[0].y - .12, housing, 'lamp-rim-base');
  cylinder(beacon, .15, .07, 1.97, housing, 'housing-cap', { bottomRadius: .18 });
  if (halo) {
    const pulse = halo, rate = active === 'critical' ? 5.5 : active === 'warning' ? 3.5 : 2;
    setAssetAnimator(beacon, ({ time }) => { const scale = 1 + .22 * (.5 + .5 * Math.sin(time * rate)); pulse.scale.set(scale, 1, scale); }, [pulse]);
  }
  return beacon;
}

/** Segmented column; `count` lights whole segments from the bottom. The host maps its measure to segments. */
export function createCapacityGauge(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  if (node.measurement !== undefined || (node.variant !== undefined && node.variant !== 'vertical-segmented')) {
    if (!node.measurement && node.variant === 'horizontal-segmented' && (node.count !== undefined || node.multiplier !== undefined)) {
      const { count } = resolveCountRepresentation(node, assetCountDefinitions['capacity-gauge']);
      return createMeasuredCapacityGauge({ ...node, count: undefined, multiplier: undefined, measurement: { value: count * 10, unit: '%' } }, context);
    }
    return createMeasuredCapacityGauge(node, context);
  }
  const gauge = new THREE.Group(); gauge.name = 'capacity-gauge';
  const { count, segments } = gaugeCount(node), fill = resolveObjectColor(node, context, 'accent', '#4f8de0');
  block(gauge, [.9, .12, .9], [0, .06, 0], '#c9d4e2', 'gauge-plinth', { bevel: .02 });
  for (let i = 0; i < segments; i++) {
    const lit = i < count, y = .215 + i * .2;
    block(gauge, [.62, .17, .62], [0, y, 0], lit ? fill : '#e4eaf2', lit ? `count-part-${i}` : `gauge-empty-${i}`, lit ? { roughness: .45, bevel: .015 } : { roughness: .85, bevel: .015 });
  }
  const top = .12 + segments * .2 + .02;
  for (const x of [-.36, .36]) for (const z of [-.36, .36]) block(gauge, [.06, top - .12, .06], [x, (top + .12) / 2, z], '#7d8ea5', 'gauge-frame');
  block(gauge, [.82, .06, .82], [0, top + .03, 0], '#7d8ea5', 'gauge-cap', { bevel: .015 });
  return gauge;
}
function gaugeCount(node: AssetNode) {
  const definition = assetCountDefinitions['capacity-gauge'];
  return { count: resolveCountRepresentation(node, definition).count, segments: definition.kind === 'range' ? definition.max : 10 };
}

/** Location marker whose ground point is the pivot. Optional motion bobs only the head upward; inactive pins stay still. */
/** Map-pin defaults that keep its blue head, pale base, grey stem and state tones in the default scene. */
const MAP_PIN_TONES = { accent: '#4779ed', surface: '#dfe6f0', structure: '#7d8ea5', text: '#ffffff', warning: '#e8b553', critical: '#dc6868', inactive: '#a7b1bf' } as const;

export function createMapPin(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pin = new THREE.Group(); pin.name = 'map-pin';
  // The head uses the accent role (color sets it); warning, critical and inactive replace it, so status survives styling.
  const p = objectPalette(node, context, 'accent', MAP_PIN_TONES), color = node.state === 'warning' || node.state === 'critical' || node.state === 'inactive' ? p[node.state] : p.accent;
  cylinder(pin, .3, .03, .015, p.surface, 'pin-base', { segments: 28 });
  cylinder(pin, .022, .52, .27, p.structure, 'pin-stem', { segments: 8 });
  const head = new THREE.Group(); head.name = 'pin-head'; pin.add(head);
  part(head, new THREE.SphereGeometry(.32, 20, 14), color, 'pin-body', { roughness: .45 }).position.y = 1.25;
  const point = part(head, new THREE.ConeGeometry(.3, .75, 20), color, 'pin-body', { roughness: .45 }); point.rotation.x = Math.PI; point.position.y = .875;
  const dot = part(head, new THREE.CylinderGeometry(.13, .13, .66, 18), p.text, 'pin-dot', { roughness: .4 }); dot.rotation.x = Math.PI / 2; dot.position.y = 1.25;
  anchor(pin, 'point', [0, 0, 0]); anchor(pin, 'top', [0, 1.57, 0]);
  if (node.state !== 'inactive') setAssetAnimator(pin, ({ time }) => { head.position.y = .06 * (1 - Math.cos(time * 2.2)); }, [head]);
  return pin;
}

/** Sign panel size and height; the label surface covers the face inside the frame. */
export const SIGN = Object.freeze({ width: 1.2, height: .6, bottom: 1.4, depth: .05 });

/**
 * A freestanding sign: a panel on a post with a base plate. Host text or icon artwork goes on the face
 * through surfaceLabel; without it, a blank placeholder of three lines shows. Static.
 */
export function createSign(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'surface', { surface: '#f4f7fb', structure: '#5b6f8a', text: '#9fb0c6' }), sign = new THREE.Group(); sign.name = 'sign';
  const { width, height, bottom, depth } = SIGN, middle = bottom + height / 2;
  block(sign, [.32, .02, .32], [0, .01, 0], p.structure, 'sign-base');
  block(sign, [.06, bottom + .02, .06], [0, (bottom + .02) / 2, -.03], p.structure, 'sign-post');
  // A frame around the face; the face is what artwork covers.
  block(sign, [width + .06, height + .06, depth], [0, middle, 0], p.structure, 'sign-frame', { bevel: .01 });
  block(sign, [width, height, .01], [0, middle, depth / 2], p.surface, 'sign-face');
  for (let i = 0; i < 3; i++) block(sign, [width * (.78 - i * .18), .05, .004], [0, middle + .14 - i * .14, depth / 2 + .007], p.text, 'sign-placeholder');
  anchor(sign, 'face', [0, middle, depth / 2 + .01]); anchor(sign, 'top', [0, bottom + height + .03, 0]);
  return sign;
}

import * as THREE from 'three';
import { resolveMeasurement, type AssetNode, type Measurement, type ResolvedMeasurement } from '@opsorama/core';
import { anchor, block, part, STATE_COLORS } from './parts';
import { resolveObjectColor, resolveObjectStateColor } from './object-palette';
import type { MaterialContext } from '@opsorama/three';

export type CapacityGaugeVariant = 'vertical-segmented' | 'horizontal-segmented' | 'vertical-continuous' | 'horizontal-continuous';
export type RingGaugeVariant = 'full' | 'semicircle';
export type DialGaugeVariant = 'semicircle' | 'full';
export type BatteryIndicatorVariant = 'vertical-continuous' | 'horizontal-continuous' | 'vertical-segmented' | 'horizontal-segmented';
export interface AssetMeasurementDefinition { default: Readonly<Measurement>; variants: readonly string[]; }
export const assetMeasurementDefinitions: Readonly<Record<string, AssetMeasurementDefinition>> = Object.freeze({
  'capacity-gauge': Object.freeze({ default: Object.freeze({ value: 60, unit: '%' }), variants: Object.freeze(['vertical-segmented', 'horizontal-segmented', 'vertical-continuous', 'horizontal-continuous']) }),
  'ring-gauge': Object.freeze({ default: Object.freeze({ value: 72.5, unit: '%' }), variants: Object.freeze(['full', 'semicircle']) }),
  'dial-gauge': Object.freeze({ default: Object.freeze({ value: 45, unit: '%' }), variants: Object.freeze(['semicircle', 'full']) }),
  'battery-indicator': Object.freeze({ default: Object.freeze({ value: 65, unit: '%' }), variants: Object.freeze(['vertical-continuous', 'horizontal-continuous', 'vertical-segmented', 'horizontal-segmented']) }),
});
const FRAME = '#74869a', TRACK = '#e2e9ef', DARK = '#354658';
const bandColor = (state: 'normal' | 'warning' | 'critical') => state === 'normal' ? '#3fb38c' : STATE_COLORS[state];
function input(node: AssetNode, context?: MaterialContext) {
  const definition = assetMeasurementDefinitions[node.asset], variant = node.variant ?? definition.variants[0];
  if (!definition.variants.includes(variant)) throw new Error(`Unknown ${node.asset} variant: ${variant}.`);
  if (node.count !== undefined || node.multiplier !== undefined) throw new Error('Measured gauges do not accept counts or multipliers.');
  const reading = resolveMeasurement(node.measurement === undefined ? definition.default : node.measurement);
  const fill = reading.state ? bandColor(reading.state) : resolveObjectColor(node, context, 'accent', '#409e96');
  return { reading, variant, fill: node.asset === 'battery-indicator' ? resolveObjectStateColor(node, context, fill) : fill };
}
function unknown(group: THREE.Object3D, position: readonly [number, number, number]) {
  for (const angle of [-Math.PI / 4, Math.PI / 4]) block(group, [.22, .035, .025], position, DARK, 'gauge-unknown').rotation.z = angle;
}
function plinth(group: THREE.Object3D, width: number) {
  block(group, [width, .1, .55], [0, .05, 0], FRAME, 'gauge-base', { bevel: .03 });
  anchor(group, 'front', [0, 0, .3]);
}
function rangeFraction(reading: ResolvedMeasurement, value: number) { return Math.max(0, Math.min(1, (value - reading.min) / (reading.max - reading.min))); }

/** Upright linear gauges; horizontal variants fill left to right, vertical variants bottom to top. */
export function createMeasuredCapacityGauge(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const { reading, variant, fill } = input(node, context), horizontal = variant.startsWith('horizontal'), segmented = variant.endsWith('segmented');
  const gauge = new THREE.Group(); gauge.name = 'capacity-gauge';
  plinth(gauge, horizontal ? 2.4 : .9);
  const length = 1.9, bottom = horizontal ? .28 : .2, width = horizontal ? 2.2 : .7, height = horizontal ? .72 : 2.06;
  block(gauge, [width, height, .35], [0, bottom + height / 2, 0], FRAME, 'gauge-frame', { bevel: .04 });
  const point = (fraction: number): [number, number, number] => horizontal ? [-length / 2 + length * fraction, .68, .2] : [0, .28 + length * fraction, .2];
  const strip = (from: number, to: number, thickness: number, color: string, name: string, z = .2) => {
    const pos = point((from + to) / 2); pos[2] = z;
    return block(gauge, horizontal ? [length * (to - from), thickness, .025] : [thickness, length * (to - from), .025], pos, color, name);
  };
  strip(0, 1, .45, TRACK, 'gauge-track');
  if (reading.fraction !== null) {
    const segments = segmented ? 10 : 1;
    for (let i = 0; i < segments; i++) {
      const start = i / segments, end = Math.min((i + 1) / segments, reading.fraction), gap = segmented ? .006 : 0;
      const from = start + gap, to = from + (end - start) * (1 - 2 * gap * segments);
      if (to > from) strip(from, to, .4, fill, `gauge-fill-${i}`, .225);
      if (segmented && i > 0) strip(start - .003, start + .003, .45, FRAME, 'gauge-divider', .244);
    }
  } else { const pos = point(.5); pos[2] = .27; unknown(gauge, pos); }
  for (const band of reading.bands) {
    const mesh = strip(rangeFraction(reading, band.from), rangeFraction(reading, band.to), .045, bandColor(band.state), 'gauge-band', .235);
    if (horizontal) mesh.position.y -= .29; else mesh.position.x += .29;
  }
  if (reading.targetFraction !== undefined) {
    const target = strip(reading.targetFraction - .002, reading.targetFraction + .002, .56, DARK, 'gauge-target', .265); target.userData.value = node.measurement?.target;
  }
  if (reading.outOfRange) block(gauge, [.09, .09, .035], horizontal ? [1.02, .95, .24] : [.26, 2.18, .24], STATE_COLORS.warning, 'gauge-overflow');
  anchor(gauge, 'value', point(reading.fraction ?? .5));
  return gauge;
}

/** Arc geometry runs clockwise in the XY plane, with its front toward +z. */
function arc(group: THREE.Object3D, centerY: number, radius: number, tube: number, start: number, sweep: number, color: string, name: string, z = 0) {
  const geometry = new THREE.TorusGeometry(radius, tube, 8, Math.max(8, Math.ceil(sweep * 16)), sweep);
  geometry.rotateZ(-start);
  const mesh = part(group, geometry, color, name); mesh.scale.y = -1; mesh.position.set(0, centerY, z); return mesh;
}
function marker(group: THREE.Object3D, centerY: number, radius: number, angle: number, name: string, color = DARK, length = .15, z = .19, depth = .05) {
  const mesh = block(group, [.028, length, depth], [radius * Math.cos(angle), centerY + radius * Math.sin(angle), z], color, name); mesh.rotation.z = angle - Math.PI / 2; return mesh;
}
function circular(node: AssetNode, dial: boolean, context?: MaterialContext) {
  const { reading, variant, fill } = input(node, context), full = variant === 'full';
  const gauge = new THREE.Group(); gauge.name = node.asset;
  const centerY = full ? 1.23 : .35, radius = .85, start = full ? Math.PI * .75 : Math.PI, sweep = full ? Math.PI * 1.5 : Math.PI;
  // Lift the semicircle scale off the flat cut so endpoint marks and the needle remain on the face.
  const scaleCenterY = centerY + (dial && !full ? .075 : 0);
  const ringSweep = full && !dial ? Math.PI * 2 : sweep, ringStart = full && !dial ? Math.PI / 2 : start;
  plinth(gauge, 1.4);
  block(gauge, [.12, full ? .3 : .25, .12], [0, full ? .25 : .225, 0], FRAME, 'gauge-support');
  if (dial) {
    const face = part(gauge, new THREE.CylinderGeometry(radius, radius, .09, 64, 1, false, full ? 0 : Math.PI / 2, full ? Math.PI * 2 : Math.PI), TRACK, 'dial-face');
    face.rotation.x = Math.PI / 2; face.position.y = centerY;
    for (let i = 0; i <= 10; i++) marker(gauge, scaleCenterY, radius * (full ? .86 : .8), start - sweep * i / 10, 'dial-tick', FRAME, i % 5 === 0 ? .13 : .075, .06, .025);
  }
  arc(gauge, centerY, radius, dial ? .045 : .11, ringStart, ringSweep, FRAME, 'gauge-track');
  for (const band of reading.bands) {
    const from = rangeFraction(reading, band.from), to = rangeFraction(reading, band.to);
    arc(gauge, scaleCenterY, dial ? radius * .73 : radius + .16, .025, ringStart - ringSweep * from, ringSweep * (to - from), bandColor(band.state), 'gauge-band', dial ? .055 : .1);
  }
  if (reading.fraction === null) unknown(gauge, [0, centerY + (full ? 0 : .35), dial ? .0725 : .2]);
  else if (dial) {
    const angle = start - sweep * reading.fraction, length = .65;
    const needle = block(gauge, [length, .035, .025], [Math.cos(angle) * length / 2, scaleCenterY + Math.sin(angle) * length / 2, .095], fill, 'dial-needle'); needle.rotation.z = angle;
    part(gauge, new THREE.SphereGeometry(.065, 12, 8), DARK, 'dial-hub').position.set(0, scaleCenterY, .07);
  } else if (reading.fraction > 0) arc(gauge, centerY, radius, .115, ringStart, ringSweep * reading.fraction, fill, 'ring-fill', .015);
  if (reading.targetFraction !== undefined) marker(gauge, scaleCenterY, dial ? .7 : radius, ringStart - ringSweep * reading.targetFraction, 'gauge-target', DARK, .15, dial ? .06 : .19, dial ? .025 : .05);
  if (reading.outOfRange) block(gauge, [.1, .1, .04], [0, centerY + radius + .2, .2], STATE_COLORS.warning, 'gauge-overflow');
  anchor(gauge, 'value', [0, centerY + (full ? 0 : .35), .23]);
  return gauge;
}
export const createRingGauge = (node: AssetNode, context?: MaterialContext) => circular(node, false, context);
export const createDialGauge = (node: AssetNode, context?: MaterialContext) => circular(node, true, context);

/** Static charge indicator; busy adds a charging bolt, critical a fault cross. */
export function createBatteryIndicator(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const { reading, variant, fill } = input(node, context), horizontal = variant.startsWith('horizontal'), segmented = variant.endsWith('segmented');
  const battery = new THREE.Group(); battery.name = 'battery-indicator'; plinth(battery, horizontal ? 2.35 : 1);
  const width = horizontal ? 2.1 : .86, height = horizontal ? .86 : 2.1, centerY = .18 + height / 2;
  block(battery, [width, height, .35], [0, centerY, 0], FRAME, 'battery-frame', { bevel: .05 });
  block(battery, horizontal ? [.12, .36, .26] : [.36, .12, .26], horizontal ? [width / 2 + .06, centerY, 0] : [0, .18 + height + .06, 0], DARK, 'battery-terminal', { bevel: .03 });
  block(battery, [width - .16, height - .16, .025], [0, centerY, .19], TRACK, 'battery-track');
  const length = (horizontal ? width : height) - .2, position = (fraction: number): [number, number, number] => horizontal ? [length * (fraction - .5), centerY, .22] : [0, centerY + length * (fraction - .5), .22];
  if (reading.fraction === null) unknown(battery, [0, centerY, .24]);
  else for (let i = 0; i < (segmented ? 5 : 1); i++) {
    const n = segmented ? 5 : 1, start = i / n, end = Math.min((i + 1) / n, reading.fraction);
    const cellLength = length / n - (segmented ? .035 : 0), filledLength = cellLength * (end - start) * n;
    if (filledLength > 0) {
      const center = start + ((segmented ? .0175 : 0) + filledLength / 2) / length;
      block(battery, horizontal ? [filledLength, height - .24, .025] : [width - .24, filledLength, .025], position(center), fill, `battery-fill-${i}`);
    }
  }
  for (const band of reading.bands) {
    const from = rangeFraction(reading, band.from), to = rangeFraction(reading, band.to), pos = position((from + to) / 2);
    if (horizontal) pos[1] -= .3; else pos[0] += .3; pos[2] = .25;
    block(battery, horizontal ? [length * (to - from), .03, .025] : [.03, length * (to - from), .025], pos, bandColor(band.state), 'gauge-band');
  }
  if (reading.targetFraction !== undefined) block(battery, horizontal ? [.025, height - .1, .035] : [width - .1, .025, .035], position(reading.targetFraction), DARK, 'gauge-target');
  if (node.state === 'busy' && reading.value !== null) {
    const ink = node.materials?.busy ?? context?.palette?.busy ?? '#ffffff';
    for (const [x, y, angle] of [[-.04, .08, -.45], [.04, -.08, -.45]] as const) block(battery, [.065, .2, .025], [x, centerY + y, .27], ink, 'battery-charge').rotation.z = angle;
    block(battery, [.15, .05, .025], [0, centerY, .27], ink, 'battery-charge');
  }
  if (node.state === 'critical' && reading.value !== null) unknown(battery, [0, centerY, .27]);
  if (reading.outOfRange) block(battery, [.09, .09, .04], [.25, centerY + height / 2 - .08, .26], STATE_COLORS.warning, 'gauge-overflow');
  anchor(battery, 'value', [0, centerY, .29]);
  return battery;
}

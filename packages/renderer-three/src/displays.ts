import * as THREE from 'three';
import { formatDisplay, validateDisplay, type AssetNode, type DisplayReading } from '@opsorama/core';
import { LAB_PALETTES, type MaterialContext } from './laboratory';
import { validateMaterialOverrides } from '@opsorama/core';
import { anchor, block, part } from './parts';
import { setAssetAnimator } from './animation';

export interface AssetDisplayDefinition { default: Readonly<DisplayReading>; variants: readonly string[]; }
export const assetDisplayDefinitions: Readonly<Record<string, AssetDisplayDefinition>> = Object.freeze({
  'led-display': Object.freeze({ default: Object.freeze({ kind: 'number', value: 128.5, decimals: 1 }), variants: Object.freeze(['panel', 'standing']) }),
  'analog-clock': Object.freeze({ default: Object.freeze({ kind: 'clock', seconds: 36630, running: false }), variants: Object.freeze(['classic', 'minimal']) }),
  'digital-clock': Object.freeze({ default: Object.freeze({ kind: 'clock', seconds: 36630, running: false }), variants: Object.freeze(['hours-minutes-seconds', 'hours-minutes']) }),
  stopwatch: Object.freeze({ default: Object.freeze({ kind: 'stopwatch', seconds: 83, running: false }), variants: Object.freeze(['digital', 'analog']) }),
  'countdown-timer': Object.freeze({ default: Object.freeze({ kind: 'countdown', seconds: 300, running: false }), variants: Object.freeze(['panel', 'standing']) }),
});

function palette(node: AssetNode, context?: MaterialContext) {
  if (node.materials !== undefined) validateMaterialOverrides(node.materials);
  if (context?.palette !== undefined) validateMaterialOverrides(context.palette);
  const p = { ...LAB_PALETTES[context?.theme ?? 'light'], ...context?.palette, ...(node.color ? { accent: node.color } : {}), ...node.materials };
  return { ...p, ink: p.text, hand: p.accent };
}
function base(group: THREE.Group, p: ReturnType<typeof palette>, width: number, y: number) {
  block(group, [width, .08, .5], [0, .04, 0], p.structure, 'display-base', { bevel: .03 });
  block(group, [.12, y, .12], [0, .08 + y / 2, 0], p.trim, 'display-support');
}
function finish(group: THREE.Group, front: readonly [number, number, number], mount: readonly [number, number, number]) {
  anchor(group, 'base', [0, 0, 0]); anchor(group, 'screen', front); anchor(group, 'mount', mount);
  group.userData.displayBounds = new THREE.Box3().setFromObject(group);
  return group;
}

/** Portable screen housing. Existing surfaceLabel supplies bounded text/SVG artwork. */
export function createMonitor(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), variant = node.variant ?? 'desktop', group = new THREE.Group(); group.name = node.asset;
  if (!['desktop', 'wall'].includes(variant)) throw new Error(`Unknown monitor variant: ${variant}.`);
  if (variant === 'desktop') base(group, p, 1.15, .35);
  else block(group, [.55, .35, .18], [0, .9, -.15], p.structure, 'monitor-wall-mount');
  block(group, [2.4, 1.4, .16], [0, 1.1, 0], p.structure, 'monitor-frame', { bevel: .04 });
  block(group, [2.2, 1.2, .018], [0, 1.1, .089], p.screen, 'monitor-screen', { roughness: .2 });
  // Static placeholder is replaced only when artwork is supplied.
  for (let i = 0; i < 3; i++) block(group, [1.55 - i * .3, .07, .012], [-i * .15, 1.36 - i * .24, .108], i ? p.text : p.accent, 'monitor-placeholder');
  block(group, [.045, .018, .01], [.98, .455, .089], p.accent, 'monitor-power');
  return finish(group, [0, 1.1, .11], [0, 1.1, -.09]);
}
export function createInformationBoard(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), variant = node.variant ?? 'portrait', group = new THREE.Group(); group.name = node.asset;
  if (variant !== 'portrait') throw new Error(`Unknown information board variant: ${variant}.`);
  const width = 1.3, height = 1.5;
  base(group, p, width * .65, .45);
  block(group, [width, height, .16], [0, 1.3, 0], p.structure, 'board-frame', { bevel: .04 });
  block(group, [width - .14, height - .14, .018], [0, 1.3, .089], p.screen, 'board-screen', { roughness: .2 });
  for (let i = 0; i < 4; i++) block(group, [width - .4, .065, .012], [0, 1.7 - i * .27, .108], i ? p.text : p.accent, 'board-placeholder');
  return finish(group, [0, 1.3, .11], [0, 1.3, -.09]);
}

const DIGITS: Readonly<Record<string, string>> = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g' };
/** Preallocated segments; changes toggle visibility without allocating textures or frame loops. */
function segments(group: THREE.Group, p: ReturnType<typeof palette>, y: number, width: number) {
  const pitch = width / 8, size = pitch * .72, height = size * 1.75;
  const slots: Record<string, THREE.Mesh>[] = [];
  for (let i = 0; i < 8; i++) {
    const x = (i - 3.5) * pitch, pieces: Record<string, THREE.Mesh> = {};
    for (const [name, dx, dy, horizontal] of [['a', 0, .5, true], ['b', .5, .25, false], ['c', .5, -.25, false], ['d', 0, -.5, true], ['e', -.5, -.25, false], ['f', -.5, .25, false], ['g', 0, 0, true]] as const) {
      pieces[name] = block(group, horizontal ? [size * .78, .045, .012] : [.045, height * .36, .012], [x + dx * size, y + dy * height, .111], p.ink, `digit-${i}-${name}`, { emissive: p.ink });
    }
    for (const [name, dy] of [['dot', -.48], ['top', .2], ['bottom', -.2]] as const) pieces[name] = block(group, [.045, .045, .012], [x + (name === 'dot' ? size * .56 : 0), y + dy * height, .111], p.ink, `digit-${i}-${name}`, { emissive: p.ink });
    slots.push(pieces);
  }
  const write = (text: string) => {
    const chars: { char: string; dot: boolean }[] = [];
    for (const char of text) { if (char === '.' && chars.length) chars[chars.length - 1].dot = true; else chars.push({ char, dot: false }); }
    const start = Math.floor((8 - chars.length) / 2);
    for (let i = 0; i < 8; i++) {
      const item = chars[i - start], active = DIGITS[item?.char] ?? '';
      for (const [name, mesh] of Object.entries(slots[i])) mesh.visible = name === 'dot' ? !!item?.dot : name === 'top' || name === 'bottom' ? item?.char === ':' : active.includes(name);
    }
  };
  // Every segment toggles its visibility, so all of them are animated parts.
  return { write, parts: slots.flatMap(pieces => Object.values(pieces)) };
}

function analog(group: THREE.Group, p: ReturnType<typeof palette>, stopwatch: boolean, minimal: boolean) {
  const y = 1.06, radius = .85;
  const rim = part(group, new THREE.CylinderGeometry(radius, radius, .16, 64), p.structure, 'clock-rim'); rim.rotation.x = Math.PI / 2; rim.position.y = y;
  const face = part(group, new THREE.CylinderGeometry(radius - .07, radius - .07, .018, 64), p.surface, 'clock-face'); face.rotation.x = Math.PI / 2; face.position.set(0, y, .09);
  for (let i = 0; i < (minimal ? 12 : 60); i++) {
    const major = minimal || i % 5 === 0, angle = i * Math.PI * 2 / (minimal ? 12 : 60);
    const tick = block(group, [major ? .03 : .015, major ? .1 : .045, .012], [Math.sin(angle) * .69, y + Math.cos(angle) * .69, .108], p.trim, 'clock-tick'); tick.rotation.z = -angle;
  }
  const hand = (name: string, length: number, color: string, z: number, thickness: number) => {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(0, y, z); group.add(pivot);
    block(pivot, [thickness, length, .015], [0, length / 2 - .04, 0], color, `${name}-pointer`); return pivot;
  };
  const hour = stopwatch ? null : hand('hour-hand', .39, p.structure, .13, .045);
  const minute = hand('minute-hand', stopwatch ? .3 : .56, p.structure, .155, .03);
  const second = minimal && !stopwatch ? null : hand('second-hand', .61, p.hand, .18, .016);
  const hub = part(group, new THREE.SphereGeometry(.05, 12, 8), p.accent, 'clock-hub'); hub.position.set(0, y, .185);
  const paint = (seconds: number) => {
    if (hour) hour.rotation.z = -seconds / 43200 * Math.PI * 2;
    minute.rotation.z = -seconds / 3600 * Math.PI * 2;
    if (second) second.rotation.z = -seconds / 60 * Math.PI * 2;
  };
  return { paint, parts: [hour, minute, second].filter(hand => hand !== null) };
}
export function createReadout(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const definition = assetDisplayDefinitions[node.asset], reading = node.display ?? definition.default, variant = node.variant ?? definition.variants[0];
  validateDisplay(reading);
  if (reading.kind !== definition.default.kind) throw new Error(`Asset ${node.asset} requires a ${definition.default.kind} display reading.`);
  if (!definition.variants.includes(variant)) throw new Error(`Unknown ${node.asset} variant: ${variant}.`);
  const p = palette(node, context), group = new THREE.Group(); group.name = node.asset;
  const round = node.asset === 'analog-clock' || node.asset === 'stopwatch' && variant === 'analog';
  let paint: (seconds: number) => void, parts: readonly THREE.Object3D[];
  if (round) {
    base(group, p, 1.1, .24);
    ({ paint, parts } = analog(group, p, node.asset === 'stopwatch', variant === 'minimal'));
  } else {
    const standing = variant === 'standing', y = standing ? 1.1 : .55;
    if (standing) base(group, p, 1.25, .65);
    block(group, [2.8, .9, .18], [0, y, 0], p.structure, 'readout-frame', { bevel: .04 });
    block(group, [2.64, .74, .018], [0, y, .099], p.screen, 'readout-screen', { roughness: .2 });
    block(group, [2.3, .025, .012], [0, y - .395, .101], p.accent, 'readout-accent');
    const display = segments(group, p, y, 2.35), write = display.write; parts = display.parts;
    paint = seconds => write(formatDisplay(reading.kind === 'number' ? reading : { ...reading, seconds: Math.floor(seconds) }, variant !== 'hours-minutes'));
  }
  if (node.asset === 'stopwatch') {
    block(group, [.22, .13, .16], [0, round ? 1.98 : 1.08, 0], p.accent, 'stopwatch-crown', { bevel: .03 });
    for (const x of [-.28, .28]) block(group, [.15, .1, .16], [x, round ? 1.92 : 1.05, 0], p.trim, 'stopwatch-button', { bevel: .025 });
  }
  let elapsed = reading.kind === 'number' ? 0 : reading.seconds;
  paint(elapsed);
  if (reading.kind !== 'number') setAssetAnimator(group, ({ delta }) => {
    if (!reading.running) return;
    elapsed = reading.kind === 'clock' ? (elapsed + delta) % 86400 : reading.kind === 'countdown' ? Math.max(0, elapsed - delta) : Math.min(359999, elapsed + delta);
    paint(elapsed);
  }, parts);
  return finish(group, [0, round ? 1.06 : variant === 'standing' ? 1.1 : .55, .2], [0, round ? 1.06 : .55, -.1]);
}

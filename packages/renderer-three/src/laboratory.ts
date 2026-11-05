import * as THREE from 'three';
import { resolveCountRepresentation, validateMaterialOverrides, type AssetNode, type MaterialPalette, type MaterialOverrides } from '@opsorama/core';
import { anchor, block, part } from './parts';
import { assetCountDefinitions } from './asset-counts';
import { createDeskPod } from './office';
import { createPerson } from './worker';
import { clearAssetAnimator } from './animation';

export interface MaterialContext { theme: 'light' | 'midnight'; palette?: MaterialOverrides; }
export const LAB_PALETTES: Readonly<Record<'light' | 'midnight', MaterialPalette>> = Object.freeze({
  light: Object.freeze({ surface: '#e6edf3', structure: '#3a4c60', trim: '#95a8b9', accent: '#6489d6', glass: '#c3e3ed', liquid: '#429eae', screen: '#182f46', text: '#d3eff6', skin: '#d9b397', hair: '#3a3c43', wood: '#a8896a', foliage: '#8bbcaa', normal: '#38a88a', busy: '#5088ec', warning: '#dca644', critical: '#df6470', inactive: '#788297' }),
  midnight: Object.freeze({ surface: '#46576c', structure: '#202e42', trim: '#8499b1', accent: '#87a5e0', glass: '#acd6e3', liquid: '#64c2cc', screen: '#102438', text: '#e1f5fc', skin: '#d9b397', hair: '#3a3c43', wood: '#8f7559', foliage: '#6f9a8b', normal: '#53c4a3', busy: '#80adf7', warning: '#edc16c', critical: '#ee8490', inactive: '#7d8da3' }),
});
export function resolveLabPalette(node: AssetNode, context?: MaterialContext): MaterialPalette {
  if (node.materials !== undefined) validateMaterialOverrides(node.materials);
  if (context?.palette !== undefined) validateMaterialOverrides(context.palette);
  if (node.state !== undefined && !['normal', 'busy', 'warning', 'critical', 'inactive'].includes(node.state)) throw new Error('Unknown laboratory state.');
  return { ...LAB_PALETTES[context?.theme ?? 'light'], ...context?.palette, ...(node.color ? { accent: node.color, liquid: node.color } : {}), ...node.materials };
}
function flask(p: MaterialPalette): THREE.Group {
  const object = new THREE.Group(); object.name = 'lab-flask';
  const bottom = part(object, new THREE.CylinderGeometry(.126, .126, .02, 24), p.glass, 'flask-bottom', { opacity: .32, roughness: .1 }); bottom.position.y = .01;
  const glass = part(object, new THREE.CylinderGeometry(.052, .126, .27, 24, 1, true), p.glass, 'flask-glass', { opacity: .32, roughness: .1 }); glass.position.y = .145;
  const liquid = part(object, new THREE.CylinderGeometry(.095, .112, .135, 24), p.liquid, 'flask-liquid', { roughness: .2 }); liquid.position.y = .083;
  const meniscus = part(object, new THREE.CylinderGeometry(.093, .095, .006, 24), `#${new THREE.Color(p.liquid).lerp(new THREE.Color('#ffffff'), .3).getHexString()}`, 'flask-meniscus', { roughness: .1 }); meniscus.position.y = .153;
  const neck = part(object, new THREE.CylinderGeometry(.052, .052, .14, 24, 1, true), p.glass, 'flask-neck', { opacity: .45, roughness: .1 }); neck.position.y = .345;
  const rim = part(object, new THREE.TorusGeometry(.052, .009, 8, 24), p.trim, 'flask-rim', { roughness: .2 }); rim.rotation.x = Math.PI / 2; rim.position.y = .415;
  block(object, [.09, .035, .009], [0, .145, .12], p.text, 'flask-mark');
  anchor(object, 'base', [0, 0, 0]); anchor(object, 'label', [0, .43, 0]);
  return object;
}
/** Nested submodels keep their connection points without colliding with the owning model's anchors. */
function namespaceAnchors(object: THREE.Object3D, prefix: string): void {
  object.traverse(child => { if (child.name.startsWith('anchor-')) child.name = `anchor-${prefix}-${child.name.slice(7)}`; });
}
export function createLabFlask(node: AssetNode, context?: MaterialContext): THREE.Object3D { return flask(resolveLabPalette(node, context)); }

/** Fixed 0–9 slots. The owning node alone is selectable; contents do not invent file identities. */
export function createLabTray(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette(node, context), group = new THREE.Group(); group.name = 'lab-tray';
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['lab-tray']);
  block(group, [.92, .06, .92], [0, .03, 0], p.surface, 'tray-base', { bevel: .015 });
  for (const z of [-.44, .44]) block(group, [.92, .095, .035], [0, .105, z], p.trim, 'tray-rim');
  for (const x of [-.44, .44]) block(group, [.035, .095, .86], [x, .105, 0], p.trim, 'tray-rim');
  for (let i = 0; i < 9; i++) {
    const x = (i % 3 - 1) * .285, z = (Math.floor(i / 3) - 1) * .285;
    const slot = part(group, new THREE.TorusGeometry(.126, .008, 4, 12), p.structure, `tray-slot-${i}`); slot.rotation.x = Math.PI / 2; slot.position.set(x, .066, z);
    if (i < count) { const item = flask(p); namespaceAnchors(item, `flask-${i}`); item.name = `count-part-${i}`; item.position.set(x, .06, z); group.add(item); }
  }
  block(group, [.68, .13, .035], [0, .15, .46], p.structure, 'tray-plaque');
  anchor(group, 'load', [0, .06, 0]); anchor(group, 'front', [0, .15, .485]); anchor(group, 'label', [0, .52, 0]);
  return group;
}

/** Reuses desk and seated-worker geometry. Computer = branch; tabletop tray = bounded change summary. */
export function createLabWorkstation(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = node.variant ?? 'occupied';
  if (!['occupied', 'empty'].includes(variant)) throw new Error(`Unknown lab workstation variant: ${variant}.`);
  resolveCountRepresentation(node, assetCountDefinitions['lab-workstation']);
  const p = resolveLabPalette(node, context), group = new THREE.Group(); group.name = 'lab-workstation';
  const desk = createDeskPod({ id: `${node.id}:desk`, kind: 'asset', asset: 'desk-pod', count: 1, color: p.accent }); desk.position.x = -.6;
  desk.traverse(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) { const role = child.name === 'desk-top' ? 'surface' : child.name === 'desk-screen' ? 'screen' : child.name.startsWith('chair-') && ['chair-seat', 'chair-back'].includes(child.name) ? 'accent' : child.name.includes('leg') || child.name.includes('base') || child.name.includes('post') ? 'trim' : 'structure'; child.material.color.set(p[role]); } });
  namespaceAnchors(desk, 'desk'); group.add(desk);
  block(group, [1.14, .05, 1.02], [.68, .725, 0], p.surface, 'tray-desktop');
  for (const z of [-.45, .45]) block(group, [.06, .7, .06], [1.16, .35, z], p.trim, 'desk-extension-leg');
  const tray = createLabTray({ ...node, asset: 'lab-tray' }, context); namespaceAnchors(tray, 'tray'); tray.name = 'desk-tray'; tray.position.set(.68, .75, 0); group.add(tray);
  if (variant === 'occupied') {
    const worker = createPerson({ id: `${node.id}:worker`, kind: 'asset', asset: 'worker', variant: 'seated', color: p.accent, materials: p });
    clearAssetAnimator(worker); worker.name = 'desk-worker'; worker.position.set(-.6, 0, .72); worker.rotation.y = Math.PI;

    namespaceAnchors(worker, 'worker'); group.add(worker);
  }
  anchor(group, 'tray', [.68, .75, 0]); anchor(group, 'seat', [-.6, .52, .72]).rotation.y = Math.PI; anchor(group, 'label', [0, 1.5, 0]);
  return group;
}

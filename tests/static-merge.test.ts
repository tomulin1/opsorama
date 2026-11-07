import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { applyShadowPolicy, assetAnimatedParts, hasAssetAnimator, disposeObject, keepPartsSeparate, mergeStaticParts, MERGED_PART_NAME, setAssetAnimator } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';
import { catalogObjects, objectNode } from '../apps/site/src/features/docs/objects';

const box = (parent: THREE.Object3D, color: string, position: readonly [number, number, number], options: { size?: number; roughness?: number; transparent?: boolean } = {}) => {
  const size = options.size ?? .5, material = new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? .7, transparent: options.transparent ?? false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if ((child as THREE.Mesh).isMesh) list.push(child as THREE.Mesh); }); return list; };
const merged = (object: THREE.Object3D) => meshes(object).filter(mesh => mesh.name === MERGED_PART_NAME);
const node = (asset: string, extra: Partial<AssetNode> = {}): AssetNode => ({ id: 'n', kind: 'asset', asset, ...extra });

/** Rays from above and two sides on a grid: hit distance and rendered base color (material color × vertex color). */
function probe(object: THREE.Object3D, steps = 14): string[] {
  object.updateMatrixWorld(true);
  // Precise bounds: rotated parts would otherwise inflate the box differently with and without merging.
  const bounds = new THREE.Box3().setFromObject(object, true), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3()), raycaster = new THREE.Raycaster(), results: string[] = [];
  const directions = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)];
  for (const direction of directions) for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
    // The small offset keeps rays off exact part edges, where float rounding alone decides hit or miss.
    const u = (i + .5137) / steps - .5, v = (j + .4731) / steps - .5, origin = center.clone().addScaledVector(direction, -size.length());
    if (direction.y) origin.add(new THREE.Vector3(u * size.x, 0, v * size.z)); else if (direction.z) origin.add(new THREE.Vector3(u * size.x, v * size.y, 0)); else origin.add(new THREE.Vector3(0, v * size.y, u * size.z));
    raycaster.set(origin, direction);
    const hit = raycaster.intersectObject(object, true).find(item => (item.object as THREE.Mesh).isMesh && item.object.visible);
    if (!hit) { results.push('miss'); continue; }
    const mesh = hit.object as THREE.Mesh, material = mesh.material as THREE.MeshStandardMaterial, color = material.color.clone(), attribute = mesh.geometry.getAttribute('color');
    if (attribute && hit.face) color.multiply(new THREE.Color().fromBufferAttribute(attribute as THREE.BufferAttribute, hit.face.a));
    results.push(`${hit.distance.toFixed(4)} ${color.getHexString()} ${material.roughness ?? ''} ${material.emissive?.getHexString() ?? ''}`);
  }
  return results;
}

describe('static part merging', () => {
  it('merges static meshes that differ only in color and keeps other materials apart', () => {
    const root = new THREE.Group();
    box(root, '#ff0000', [0, 0, 0]); box(root, '#00ff00', [1, 0, 0]); box(root, '#0000ff', [2, 0, 0]); box(root, '#ff0000', [3, 0, 0], { roughness: .2 });
    const report = mergeStaticParts(root);
    expect(report).toEqual({ meshesBefore: 4, meshesAfter: 2 });
    const [combined] = merged(root), material = combined.material as THREE.MeshStandardMaterial;
    expect(material.vertexColors).toBe(true); expect(material.color.getHex()).toBe(0xffffff); expect(material.roughness).toBe(.7);
    expect(combined.geometry.getAttribute('position').count).toBe(72);
    expect(new THREE.Box3().setFromObject(combined).min.x).toBeCloseTo(-.25); expect(new THREE.Box3().setFromObject(combined).max.x).toBeCloseTo(2.25);
    const colors = new Set<string>(); const attribute = combined.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < attribute.count; i++) colors.add(new THREE.Color().fromBufferAttribute(attribute, i).getHexString());
    expect([...colors].sort()).toEqual(['0000ff', '00ff00', 'ff0000']);
    expect(meshes(root).find(mesh => mesh.name !== MERGED_PART_NAME && (mesh.material as THREE.MeshStandardMaterial).roughness === .2)).toBeDefined();
  });

  it('renders real assets identically: same hit distances and base colors before and after merging', () => {
    const cases: AssetNode[] = [node('pallet', { count: 27 }), node('parcel-base', { count: 5 }), node('worker', { variant: 'carrying' }), node('forklift', { variant: 'operated' }), node('store-shelving'), node('pallet-rack', { count: 4 }), node('lap-pool', { variant: 'open' }), node('pizza-oven'), node('conveyor')];
    for (const item of cases) {
      const reference = catalogAssets[item.asset](item), subject = catalogAssets[item.asset](item);
      const report = mergeStaticParts(subject);
      expect(report.meshesAfter, item.asset).toBeLessThan(report.meshesBefore);
      expect(probe(subject), item.asset).toEqual(probe(reference));
      disposeObject(reference); disposeObject(subject);
    }
  }, 30000);

  it('keeps every part an animator declares and merges static meshes within that part', () => {
    const root = new THREE.Group(), arm = new THREE.Group(); arm.name = 'arm'; root.add(arm);
    box(root, '#111111', [0, 0, 0]); box(root, '#222222', [1, 0, 0]);
    box(arm, '#333333', [0, 1, 0]); box(arm, '#444444', [0, 2, 0]);
    const lamp = box(root, '#ff0000', [2, 0, 0]);
    setAssetAnimator(root, ({ time }) => { arm.rotation.z = time; (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = time; }, [arm, lamp]);
    mergeStaticParts(root);
    expect(assetAnimatedParts(root)).toEqual([arm, lamp]);
    expect(arm.parent).toBe(root); expect(lamp.parent).toBe(root);
    expect(merged(root).map(mesh => mesh.parent)).toEqual(expect.arrayContaining([root, arm]));
    expect(arm.children).toHaveLength(1);
    animateAsset(root, { time: .5, delta: .5 });
    expect((lamp.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(.5);
    root.updateMatrixWorld(true);
    // The arm's merged mesh follows the arm's rotation.
    expect(new THREE.Box3().setFromObject(arm).min.x).toBeLessThan(-.5);
  });

  it('rejects animated parts that are not descendants of the animated object', () => {
    const root = new THREE.Group(), stray = new THREE.Group(); stray.name = 'stray';
    expect(() => setAssetAnimator(root, () => {}, [stray])).toThrow('Animated part stray is not a descendant of the animated object');
  });

  it('keeps anchors, labels, parents of other objects, transparent, hidden, instanced, line and opted-out parts as built', () => {
    const root = new THREE.Group();
    box(root, '#101010', [0, 0, 0]); box(root, '#202020', [1, 0, 0]);
    const anchor = new THREE.Object3D(); anchor.name = 'anchor-top'; root.add(anchor);
    const holder = box(root, '#303030', [2, 0, 0]); const child = new THREE.Object3D(); child.name = 'anchor-on-mesh'; holder.add(child);
    const glass = box(root, '#404040', [3, 0, 0], { transparent: true });
    const hidden = box(root, '#505050', [4, 0, 0]); hidden.visible = false;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.Texture() })); root.add(label);
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()); root.add(plain);
    const bank = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2); root.add(bank);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial()); root.add(line);
    const kept = new THREE.Group(); box(kept, '#606060', [0, 3, 0]); box(kept, '#707070', [1, 3, 0]); keepPartsSeparate(kept); root.add(kept);
    mergeStaticParts(root);
    for (const part of [anchor, holder, child, glass, hidden, label, plain, bank, line, ...kept.children]) expect(part.parent, part.name || part.type).not.toBeNull();
    expect(kept.children).toHaveLength(2);
    expect(merged(root)).toHaveLength(1);
    expect(root.getObjectByName('anchor-top')).toBe(anchor);
  });

  it('leaves an opted-out asset and a second call unchanged', () => {
    const optedOut = new THREE.Group(); box(optedOut, '#111111', [0, 0, 0]); box(optedOut, '#222222', [1, 0, 0]); keepPartsSeparate(optedOut);
    expect(mergeStaticParts(optedOut)).toEqual({ meshesBefore: 2, meshesAfter: 2 });
    const pallet = catalogAssets.pallet(node('pallet', { count: 27 })), first = mergeStaticParts(pallet), second = mergeStaticParts(pallet);
    expect(second).toEqual({ meshesBefore: first.meshesAfter, meshesAfter: first.meshesAfter });
    // 290 meshes become a few color-merged groups plus the 27 translucent parcel seams, which stay separate.
    expect(first).toEqual({ meshesBefore: 290, meshesAfter: expect.any(Number) }); expect(first.meshesAfter).toBeLessThanOrEqual(34);
    disposeObject(pallet);
  });

  it('groups by the shadow policy flags and keeps indoor and outdoor switching per merged mesh', () => {
    const root = new THREE.Group();
    box(root, '#aa0000', [0, .25, 0], { size: .5 }); box(root, '#00aa00', [1, .25, 0], { size: .5 });
    box(root, '#0000aa', [3, .02, 0], { size: .04 }); box(root, '#aaaa00', [4, .02, 0], { size: .04 });
    applyShadowPolicy(root, { interior: false }); mergeStaticParts(root);
    const parts = merged(root); expect(parts).toHaveLength(2);
    const casting = parts.find(mesh => mesh.castShadow)!, narrow = parts.find(mesh => !mesh.castShadow)!;
    expect(new THREE.Box3().setFromObject(casting).max.x).toBeCloseTo(1.25); expect(narrow.receiveShadow).toBe(true);
    expect(casting.userData.shadowOutdoorFlags).toEqual([true, true]); expect(narrow.userData.shadowOutdoorFlags).toEqual([false, true]);
    applyShadowPolicy(root, { interior: true });
    expect(parts.every(mesh => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
    applyShadowPolicy(root, { interior: false });
    expect([casting.castShadow, casting.receiveShadow, narrow.castShadow, narrow.receiveShadow]).toEqual([true, true, false, true]);
  });

  it('keeps the outdoor flags of a node first built indoors', () => {
    const root = new THREE.Group(); box(root, '#aa0000', [0, .25, 0]); box(root, '#00aa00', [1, .25, 0]);
    applyShadowPolicy(root, { interior: true }); mergeStaticParts(root);
    const [part] = merged(root); expect([part.castShadow, part.receiveShadow]).toEqual([false, false]);
    applyShadowPolicy(root, { interior: false }); expect([part.castShadow, part.receiveShadow]).toEqual([true, true]);
  });

  it('flips the winding of mirrored parts so front faces stay front faces', () => {
    const root = new THREE.Group(), left = box(root, '#ff0000', [0, 0, 0]); box(root, '#00ff00', [2, 0, 0]); left.scale.x = -1;
    const reference = new THREE.Group(), mirrored = box(reference, '#ff0000', [0, 0, 0]); mirrored.scale.x = -1; reference.updateMatrixWorld(true);
    mergeStaticParts(root);
    const [part] = merged(root), index = part.geometry.index!, position = part.geometry.getAttribute('position') as THREE.BufferAttribute, normal = part.geometry.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < 36; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)].map(vertex => new THREE.Vector3().fromBufferAttribute(position, vertex));
      const face = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
      expect(face.dot(new THREE.Vector3().fromBufferAttribute(normal, index.getX(i)))).toBeGreaterThan(0);
    }
  });

  it('keeps picking ids and lets disposal release merged and replaced resources', () => {
    const root = new THREE.Group(), first = box(root, '#ff0000', [0, 0, 0]), second = box(root, '#00ff00', [1, 0, 0]);
    const replacedGeometry = vi.spyOn(first.geometry, 'dispose'), replacedMaterial = vi.spyOn(second.material as THREE.Material, 'dispose');
    mergeStaticParts(root);
    expect(replacedGeometry).toHaveBeenCalled(); expect(replacedMaterial).toHaveBeenCalled();
    root.traverse(child => { child.userData.nodeId = 'node-1'; }); root.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(new THREE.Vector3(1, 5, 0), new THREE.Vector3(0, -1, 0)).intersectObject(root, true)[0];
    expect(hit.object.name).toBe(MERGED_PART_NAME); expect(hit.object.userData.nodeId).toBe('node-1');
    const [part] = merged(root), geometry = vi.spyOn(part.geometry, 'dispose'), material = vi.spyOn(part.material as THREE.Material, 'dispose');
    disposeObject(root);
    expect(geometry).toHaveBeenCalled(); expect(material).toHaveBeenCalled();
  });

  it('merged catalog models animate exactly like unmerged ones in every variant and state', () => {
    const frames = [{ time: .37, delta: .37 }, { time: 1.91, delta: 1.54 }, { time: 2.6, delta: .7, locomotion: { moving: true } }];
    const checked: string[] = [];
    for (const item of catalogObjects.filter(entry => entry.asset)) for (const variant of item.variants ?? [undefined]) for (const state of item.states ?? [undefined]) {
      const sceneNode = objectNode(item, { variant, state }); if (sceneNode.kind !== 'asset' || !catalogAssets[sceneNode.asset]) continue;
      const reference = catalogAssets[sceneNode.asset](sceneNode);
      if (!hasAssetAnimator(reference)) { disposeObject(reference); continue; }
      const subject = catalogAssets[sceneNode.asset](sceneNode); mergeStaticParts(subject);
      for (const frame of frames) { animateAsset(reference, frame); animateAsset(subject, frame); expect(probe(subject, 8), `${sceneNode.asset} ${variant ?? ''} ${state ?? ''} at ${frame.time}`).toEqual(probe(reference, 8)); }
      checked.push(sceneNode.asset); disposeObject(reference); disposeObject(subject);
    }
    expect(new Set(checked).size).toBeGreaterThan(10);
    // Raycasting 54 animated combinations takes a few seconds when the suite runs in parallel.
  }, 30_000);

  it('every catalog animator declares each part it changes, and merged models still animate', () => {
    const frames = [{ time: .37, delta: .37 }, { time: 1.91, delta: 1.54 }, { time: 2.6, delta: .7, locomotion: { moving: true } }, { time: 3.3, delta: .7, locomotion: { moving: false } }];
    const snapshot = (model: THREE.Object3D) => {
      const values = new Map<THREE.Object3D, string>();
      model.traverse(part => {
        const state: unknown[] = [part.position.toArray(), part.rotation.toArray(), part.scale.toArray(), part.visible];
        if (part instanceof THREE.Mesh && !Array.isArray(part.material)) { const material = part.material as THREE.MeshStandardMaterial; state.push(material.color?.getHex(), material.emissive?.getHex(), material.emissiveIntensity, material.opacity); }
        if (part instanceof THREE.InstancedMesh && part.instanceColor) state.push([...part.instanceColor.array]);
        values.set(part, JSON.stringify(state));
      });
      return values;
    };
    let animated = 0;
    for (const item of catalogObjects.filter(entry => entry.asset && entry.animation === 'local')) for (const variant of item.variants ?? [undefined]) for (const state of item.states ?? [undefined]) {
      const sceneNode = objectNode(item, { variant, state }); if (sceneNode.kind !== 'asset' || !catalogAssets[sceneNode.asset]) continue;
      const model = catalogAssets[sceneNode.asset](sceneNode), declared = new Set(assetAnimatedParts(model)), before = snapshot(model);
      for (const frame of frames) {
        animateAsset(model, frame);
        for (const [part, value] of snapshot(model)) if (part !== model && before.get(part) !== value) expect(declared.has(part), `${sceneNode.asset} ${variant ?? ''} ${state ?? ''}: ${part.name || part.type} changes but is not an animated part`).toBe(true);
      }
      if (declared.size) animated++;
      // The merged model keeps every declared part attached and animates without errors.
      const subject = catalogAssets[sceneNode.asset](sceneNode); mergeStaticParts(subject);
      for (const part of assetAnimatedParts(subject)) { let current: THREE.Object3D | null = part; while (current && current !== subject) current = current.parent; expect(current, `${sceneNode.asset}: ${part.name}`).toBe(subject); }
      for (const frame of frames) expect(() => animateAsset(subject, frame)).not.toThrow();
      disposeObject(model); disposeObject(subject);
    }
    expect(animated).toBeGreaterThan(10);
  });
});

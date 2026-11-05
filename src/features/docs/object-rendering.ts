import * as THREE from 'three';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { objectNode, type CatalogObject } from './objects';
import type { Measurement, CountLayout, BuildingOptions, Footprint } from '@opsorama/core';

export const catalogAssets = basicAssets;
export function modelFor(item: CatalogObject, options: { building?: BuildingOptions; count?: number; countLayout?: CountLayout; variant?: string; measurement?: Measurement | false; footprint?: Footprint } = {}): THREE.Object3D {
  if (item.asset) return catalogAssets[item.asset](objectNode(item, options) as Parameters<typeof basicAssets[string]>[0]);
  const group = new THREE.Group();
  if (item.primitive === 'path') {
    const points = [[-3, 0, 1], [0, 0, 1], [2, 0, -2]];
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.48, .12, a.distanceTo(b)), new THREE.MeshStandardMaterial({ color: item.color }));
      mesh.position.copy(a).lerp(b, .5); mesh.lookAt(b); group.add(mesh);
    }
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(6, item.primitive === 'ground' ? .18 : .08, 5), new THREE.MeshStandardMaterial({ color: item.color })));
    if (item.primitive === 'zone') group.add(new THREE.LineSegments(new THREE.EdgesGeometry((group.children[0] as THREE.Mesh).geometry), new THREE.LineBasicMaterial({ color: '#ffffff' })));
  }
  return group;
}
export function previewScale(item: CatalogObject, options: { building?: BuildingOptions; count?: number; countLayout?: CountLayout; variant?: string; measurement?: Measurement | false; footprint?: Footprint } = {}): number {
  // Fit the declared capacity, not the current occupancy. One part must never grow to fill the viewer.
  const definition = item.countDefinition;
  const capacity = definition ? definition.kind === 'range' ? definition.max : Math.max(...definition.values) : undefined;
  // Keep cutaways fitted to the full shell so opening cannot enlarge the contents.
  const model = modelFor(item, { ...options, ...(options.building ? { building: { ...options.building, view: 'closed' } } : {}), ...(capacity === undefined ? {} : { count: capacity }) });
  try { const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()); return 7 / Math.max(size.x, size.y, size.z); }
  finally { disposeObject(model); }
}

const thumbnailCache: Record<string, string> = {};
/** One temporary context renders static thumbnails; no card owns an animation loop. */
export async function renderThumbnails(items: readonly CatalogObject[], onImage: (slug: string, image: string) => void, signal: AbortSignal): Promise<void> {
  const missing = items.filter(item => !thumbnailCache[item.slug]);
  for (const item of items) if (thumbnailCache[item.slug]) onImage(item.slug, thumbnailCache[item.slug]);
  if (!missing.length || signal.aborted) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(480, 340); renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#edf2f8');
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aaecb', 2.8));
  const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(-4, 8, 6); scene.add(light);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 200);
  try {
    for (const item of missing) {
      if (signal.aborted) break;
      const model = modelFor(item); scene.add(model);
      try {
        const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
        camera.position.copy(center).add(new THREE.Vector3(12, 10, 14)); camera.lookAt(center); camera.updateMatrixWorld();
        // Fit all eight corners in camera coordinates, including long or flat objects.
        let x = 0, y = 0;
        for (const bx of [bounds.min.x, bounds.max.x]) for (const by of [bounds.min.y, bounds.max.y]) for (const bz of [bounds.min.z, bounds.max.z]) {
          const point = new THREE.Vector3(bx, by, bz).applyMatrix4(camera.matrixWorldInverse); x = Math.max(x, Math.abs(point.x)); y = Math.max(y, Math.abs(point.y));
        }
        const halfHeight = Math.max(y, x / (480 / 340)) * 1.22;
        camera.top = halfHeight; camera.bottom = -halfHeight; camera.right = halfHeight * 480 / 340; camera.left = -camera.right; camera.updateProjectionMatrix();
        renderer.render(scene, camera); const image = renderer.domElement.toDataURL('image/png'); thumbnailCache[item.slug] = image;
        if (!signal.aborted) onImage(item.slug, image);
      } finally { scene.remove(model); disposeObject(model); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}

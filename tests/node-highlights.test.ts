import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createNodeHighlights } from '@opsorama/three';

const node = (id: string, child?: THREE.Object3D) => {
  const object = new THREE.Group(); object.userData.nodeId = id;
  object.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  if (child) object.add(child);
  return object;
};

describe('node highlights', () => {
  it('tints listed nodes with shells over their own opaque meshes, follows rebuilds and clears', () => {
    const scene = new THREE.Scene(), inner = node('carton'), pallet = node('pallet', inner), rack = node('rack');
    pallet.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true })));
    const objects = new Map<string, THREE.Object3D>([['pallet', pallet], ['rack', rack]]);
    scene.add(pallet, rack);
    const highlights = createNodeHighlights(scene, id => objects.get(id), mesh => mesh.visible);
    const root = scene.getObjectByName('node-highlights')!;
    highlights.set([{ node: 'pallet' }, { node: 'rack', color: '#1f9d63' }, { node: 'not-built-yet' }], '#2f7fc4');
    expect(highlights.size).toBe(3);
    scene.updateMatrixWorld(true); highlights.update(0, false);
    // The pallet's own mesh and the rack's; the carton inside the pallet and the glass part are not tinted.
    expect(root.children).toHaveLength(2);
    const [palletShell, rackShell] = root.children as THREE.Mesh[];
    expect((palletShell.material as THREE.MeshBasicMaterial).color.equals((rackShell.material as THREE.MeshBasicMaterial).color)).toBe(false);
    expect(palletShell.raycast).not.toBe(THREE.Mesh.prototype.raycast);
    // A rebuilt node is a new object and gets new shells.
    const rebuilt = node('rack'); objects.set('rack', rebuilt); scene.add(rebuilt); scene.updateMatrixWorld(true);
    highlights.update(.5, true);
    expect(root.children).toHaveLength(2);
    expect((root.children[1] as THREE.Mesh).geometry).toBe((rebuilt.children[0] as THREE.Mesh).geometry);
    // A node built later is tinted once it exists.
    objects.set('not-built-yet', node('not-built-yet')); highlights.update(1, false);
    expect(root.children).toHaveLength(3);
    highlights.set([], '#2f7fc4'); highlights.update(2, false);
    expect(root.children).toHaveLength(0); expect(highlights.size).toBe(0);
    highlights.dispose();
    expect(scene.getObjectByName('node-highlights')).toBeUndefined();
  });
});

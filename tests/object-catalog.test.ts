import { describe, expect, it } from 'vitest';
import { validateNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { catalogObjects, objectNode, objectSnippet } from '../apps/site/src/features/docs/objects';
import { docs } from '../apps/site/src/features/docs/content';
import { animateAsset } from '../packages/three/src/animation';
import { InstancedMesh, Mesh, MeshStandardMaterial } from 'three';

describe('object catalog integration', () => {
  it('four directions preserve every portable definition and export the same rotation to all adapters', () => {
    for (const item of catalogObjects) {
      const original = objectNode(item);
      for (const degrees of [0, 90, 180, 270]) {
        const rotation = [0, degrees * Math.PI / 180, 0] as const, node = objectNode(item, { rotation });
        expect(() => validateNode(node)).not.toThrow();
        expect({ ...node, rotation: undefined }).toEqual({ ...original, rotation: undefined });
        expect(objectSnippet(node, 'React')).toContain(`rotation={${JSON.stringify(rotation)}}`);
        expect(objectSnippet(node, 'Vue')).toContain(`:rotation="${JSON.stringify(rotation)}"`);
        const json = objectSnippet(node, 'JavaScript').split('nodes: [\n')[1].split('\n] });')[0];
        expect(JSON.parse(json).rotation).toEqual(rotation);
      }
    }
  });
  it('beacon states are explicit and carried into every usage snippet', () => {
    const beacon = catalogObjects.find(item => item.asset === 'status-beacon')!;
    expect(beacon.states).toEqual(['normal', 'warning', 'critical', 'inactive']);
    for (const state of beacon.states!) {
      const node = objectNode(beacon, { state }); expect(node.state).toBe(state);
      for (const framework of ['React', 'Vue', 'JavaScript'] as const) expect(objectSnippet(node, framework)).toContain(`"${state}"`);
    }
    expect(catalogObjects.find(item => item.asset === 'tree')!.states).toBeUndefined();
  });
  it('animation labels match actual local behavior, independently of transform updates', () => {
    const assets = catalogAssets;
    for (const item of catalogObjects.filter(item => item.asset)) {
      const node = objectNode(item, { state: 'busy' }); if (node.kind !== 'asset') continue;
      const model = assets[node.asset](node);
      const transforms = () => { const values: unknown[] = []; model.traverse(part => {
        values.push([part.position.toArray(), part.rotation.toArray(), part.scale.toArray(), part.visible]);
        if (part instanceof Mesh && part.material instanceof MeshStandardMaterial) values.push([part.material.color.getHex(), part.material.emissiveIntensity]);
        if (part instanceof InstancedMesh && part.instanceColor) values.push([...part.instanceColor.array]);
      }); return values; };
      const before = transforms(); animateAsset(model, { time: 1, delta: 1 });
      if (item.animation === 'local') expect(transforms(), item.asset).not.toEqual(before);
      else expect(transforms(), item.asset).toEqual(before);
      disposeObject(model);
    }
  });
  it('accounts for every existing registry factory and resolves all detail and guide routes', () => {
    const keys = catalogObjects.flatMap(item => item.asset ? [item.asset] : []);
    expect(keys.sort()).toEqual(Object.keys(catalogAssets).sort());
    expect(new Set(catalogObjects.map(item => item.slug)).size).toBe(catalogObjects.length);
    const routes = new Set(docs.map(article => `/docs/${article.slug}`));
    for (const item of catalogObjects) { expect(routes.has(`/docs/objects/${item.slug}`)).toBe(true); expect(routes.has(item.guide.split('#')[0])).toBe(true); }
  });
  it('produces valid nodes and real owned models for all portable entries and variants', () => {
    const assets = catalogAssets;
    for (const item of catalogObjects) for (const variant of item.variants ?? [undefined]) {
      const node = objectNode(item, { variant, state: 'busy', color: '#123456', scale: .8 });
      expect(() => validateNode(node)).not.toThrow();
      if (node.kind === 'asset') { const model = assets[node.asset](node); expect(model.children.length).toBeGreaterThan(0); disposeObject(model); }
    }
  });
  it('keeps usage definitions independent from viewer normalization and uses the built-in registry', () => {
    const item = catalogObjects.find(item => item.asset === 'lab-workstation')!;
    const node = objectNode(item, { variant: 'empty', scale: 1.2 });
    expect(objectSnippet(node, 'JavaScript')).toContain("@opsorama/three");
    expect(objectSnippet(node, 'React')).toContain('scale={[1.2,1.2,1.2]}');
    expect(objectSnippet(node, 'Vue')).toContain(':scale="[1.2,1.2,1.2]"');
    expect(objectSnippet(node, 'Vue')).toContain('<script setup lang="ts">');
  });
});

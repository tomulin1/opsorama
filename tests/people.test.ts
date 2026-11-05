import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { createSceneStore, isPersonAsset, PERSON_ASSETS, PERSON_FIGURES, PERSON_HAIR_COLORS, personHairColor } from '@opsorama/core';
import { restaurantNodes, SCENARIOS as RESTAURANT_SCENARIOS } from '../apps/site/src/features/restaurant/model';
import { assetDescriptors, assetMotionProfiles, basicAssets, checkAssetDescriptor, disposeObject, personDescriptors, WORKER_VARIANTS } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { catalogObjects } from '../apps/site/src/features/docs/objects';

const CHARACTERS = PERSON_ASSETS.filter(asset => asset !== 'worker');
const person = (asset: string, variant?: string, extra: Partial<AssetNode> = {}): AssetNode => ({ id: `${asset}-1`, kind: 'asset', asset, ...(variant ? { variant } : {}), ...extra });
const anchors = (object: THREE.Object3D) => { const names: string[] = []; object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name); }); return names.sort(); };
const colors = (object: THREE.Object3D) => { const set = new Set<string>(); object.traverse(child => { if (child instanceof THREE.Mesh) set.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); }); return set; };

describe('person characters', () => {
  it('registers every character with a factory, descriptor, catalog entry and the worker movement profile', () => {
    expect(CHARACTERS).toEqual(['office-worker', 'chef', 'doctor', 'nurse', 'security-guard', 'construction-worker', 'visitor']);
    for (const asset of PERSON_ASSETS) {
      expect(isPersonAsset(asset)).toBe(true);
      expect(basicAssets[asset], asset).toBeDefined();
      expect(assetDescriptors[asset], asset).toBeDefined();
      expect(assetMotionProfiles[asset]).toEqual(assetMotionProfiles.worker);
      expect([...catalogObjects.find(item => item.asset === asset)!.variants!].sort()).toEqual([...WORKER_VARIANTS].sort());
    }
    expect(isPersonAsset('swimmer')).toBe(false);
    expect(Object.keys(personDescriptors).sort()).toEqual([...CHARACTERS].sort());
  });

  it('passes the common object contract for every character', () => {
    for (const asset of CHARACTERS) expect(checkAssetDescriptor(personDescriptors[asset], basicAssets[asset]).checks.filter(check => !check.ok), asset).toEqual([]);
  });

  it('keeps every pose grounded with the worker anchors and a local animator that leaves the root', () => {
    for (const asset of CHARACTERS) for (const variant of WORKER_VARIANTS) {
      const object = basicAssets[asset](person(asset, variant));
      expect(new THREE.Box3().setFromObject(object).min.y, `${asset} ${variant}`).toBeCloseTo(0, 2);
      expect(anchors(object)).toEqual(['anchor-carry', 'anchor-cart', 'anchor-hand']);
      const root = object.position.toArray().join();
      animateAsset(object, { time: 1.3, delta: .016 }); expect(object.position.toArray().join()).toBe(root);
      disposeObject(object);
    }
  });

  it('dresses each character differently from the generic worker', () => {
    const signature = (asset: string) => { const object = basicAssets[asset](person(asset)); const value = [...colors(object)].sort().join(); disposeObject(object); return value; };
    const looks = PERSON_ASSETS.map(signature);
    expect(new Set(looks).size).toBe(PERSON_ASSETS.length);
  });

  it('maps color to the documented role and lets a scene palette restyle the character', () => {
    const vest = basicAssets['construction-worker'](person('construction-worker', undefined, { color: '#123456' }));
    expect(colors(vest).has('#123456')).toBe(true);
    const chef = basicAssets.chef(person('chef'), { theme: 'light', palette: { trim: '#abcdef' } });
    expect(colors(chef).has('#abcdef')).toBe(true);
    disposeObject(vest); disposeObject(chef);
  });

  it('rejects unknown poses with the character name and the valid poses', () => {
    expect(() => basicAssets.chef(person('chef', 'dancing'))).toThrow('Unknown chef variant: dancing. Use one of working, carrying');
    expect(() => basicAssets.worker(person('worker', 'dancing'))).toThrow('Unknown worker variant');
  });

  it('builds the smaller feminine figure for every person and pose with the same anchors, seat height and grounding', () => {
    expect(PERSON_FIGURES).toEqual(['masculine', 'feminine']);
    const feminine = { person: { figure: 'feminine' as const } };
    for (const asset of PERSON_ASSETS) for (const variant of WORKER_VARIANTS) {
      const base = basicAssets[asset](person(asset, variant)), object = basicAssets[asset](person(asset, variant, feminine));
      const a = new THREE.Box3().setFromObject(base), b = new THREE.Box3().setFromObject(object);
      expect(b.min.y, `${asset} ${variant}`).toBeCloseTo(0, 2);
      // Standing figures are about 4 % shorter; seated ones keep the 0.52 m hips, so only the upper body changes.
      if (variant === 'seated') expect(b.max.y, `${asset} ${variant}`).toBeLessThanOrEqual(a.max.y + .001);
      else expect(b.max.y, `${asset} ${variant}`).toBeCloseTo(a.max.y * .96, 2);
      expect(b.max.x, `${asset} ${variant}`).toBeLessThan(a.max.x);
      expect(anchors(object)).toEqual(['anchor-carry', 'anchor-cart', 'anchor-hand']);
      expect(object.getObjectByName('worker-long-hair'), `${asset} ${variant} has one-piece long hair`).toBeInstanceOf(THREE.Mesh);
      expect(object.getObjectByName('worker-rig')!.scale.x).toBeLessThan(1);
      expect(base.getObjectByName('worker-long-hair')).toBeUndefined();
      disposeObject(base); disposeObject(object);
    }
  });

  it('gives the feminine visitor and office worker a skirt over bare legs', () => {
    for (const asset of ['visitor', 'office-worker']) {
      const object = basicAssets[asset](person(asset, 'idle', { person: { figure: 'feminine' }, materials: { structure: '#123456', skin: '#654321' } }));
      const leg = object.getObjectByName('worker-left-leg')!.children[0] as THREE.Mesh;
      expect((leg.material as THREE.MeshStandardMaterial).color.getHexString(), asset).toBe('654321');
      expect(colors(object).has('#123456'), asset).toBe(true);
      disposeObject(object);
    }
  });

  it('keeps the bare legs inside the skirt at the sides, standing and seated', () => {
    for (const variant of ['idle', 'seated']) {
      const object = basicAssets.visitor(person('visitor', variant, { person: { figure: 'feminine' }, materials: { structure: '#123456' } }));
      object.updateMatrixWorld(true);
      const skirt = object.getObjectByName('worker-rig')!.children.find(child => child instanceof THREE.Mesh && (child.material as THREE.MeshStandardMaterial).color.getHexString() === '123456' && child.position.y < .8)!;
      const legs = new THREE.Box3(); for (const name of ['worker-left-leg', 'worker-right-leg']) legs.union(new THREE.Box3().setFromObject(object.getObjectByName(name)!.children[0]));
      const cover = new THREE.Box3().setFromObject(skirt);
      expect(cover.min.x, variant).toBeLessThan(legs.min.x); expect(cover.max.x, variant).toBeGreaterThan(legs.max.x);
      disposeObject(object);
    }
  });

  it('gives the visitor nothing on the back', () => {
    for (const variant of WORKER_VARIANTS) {
      const object = basicAssets.visitor(person('visitor', variant));
      expect(new THREE.Box3().setFromObject(object).min.z, variant).toBeGreaterThan(-.2);
      disposeObject(object);
    }
  });

  it('validates person options in the scene store and the factory', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [] });
    expect(() => store.upsert({ id: 'p', kind: 'asset', asset: 'parcel', person: { figure: 'feminine' } })).toThrow('Person options require a person asset');
    expect(() => store.upsert(person('visitor', 'idle', { person: { figure: 'tall' as never } }))).toThrow('Unknown person figure: tall. Use one of masculine, feminine.');
    expect(() => store.upsert(person('visitor', 'idle', { person: { hair: 'long' } as never }))).toThrow('Unknown person option hair');
    store.upsert(person('visitor', 'idle', { person: { figure: 'feminine' } }));
    const stored = store.getSnapshot().nodes[0] as AssetNode;
    expect(stored.person).toEqual({ figure: 'feminine' }); expect(Object.isFrozen(stored.person)).toBe(true);
    expect(() => basicAssets.chef(person('chef', 'idle', { person: { figure: 'x' as never } }))).toThrow('Unknown person figure');
    store.dispose();
  });

  it('offers four hair color presets with a stable pick per id that the hair of both figures uses', () => {
    expect(Object.keys(PERSON_HAIR_COLORS)).toEqual(['dark', 'brown', 'blonde', 'red']);
    expect(personHairColor('guest:T1:0')).toBe(personHairColor('guest:T1:0'));
    expect(new Set(Array.from({ length: 24 }, (_, i) => personHairColor(`person:${i}`)))).toEqual(new Set(Object.values(PERSON_HAIR_COLORS)));
    for (const figure of PERSON_FIGURES) {
      const object = basicAssets.visitor(person('visitor', 'idle', { person: { figure }, materials: { hair: PERSON_HAIR_COLORS.red } }));
      expect(colors(object).has(PERSON_HAIR_COLORS.red), figure).toBe(true);
      disposeObject(object);
    }
    const people = restaurantNodes(RESTAURANT_SCENARIOS.rush).filter((node): node is AssetNode => node.kind === 'asset' && isPersonAsset(node.asset));
    expect(new Set(people.map(node => node.materials?.hair))).toEqual(new Set(Object.values(PERSON_HAIR_COLORS)));
  });
});

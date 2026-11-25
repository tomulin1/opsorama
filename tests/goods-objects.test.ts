import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { CATALOG_OPTION_ASSETS, GOODS_ITEMS, GOODS_KINDS, catalogAssets, type GoodsKind } from '@opsorama/objects';

const build = (asset: string, options: Partial<AssetNode> = {}) => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options });
const parts = (object: THREE.Object3D) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (/^count-part-\d+$/.test(child.name)) list.push(child); }); return list; };
const named = (object: THREE.Object3D, name: string) => { const list: THREE.Object3D[] = []; object.traverse(child => { if (child.name === name) list.push(child); }); return list; };
const bounds = (object: THREE.Object3D) => { object.updateMatrixWorld(true); return new THREE.Box3().setFromObject(object); };

describe('goods', () => {
  it('has one iconic item per type, in real size and standing on its base', () => {
    expect(GOODS_KINDS).toEqual(['kitchen', 'home', 'outdoor', 'toys', 'tech', 'sport']);
    expect(Object.values(GOODS_ITEMS)).toEqual(['Mug', 'Table lamp', 'Camping lantern', 'Teddy bear', 'Headphones', 'Basketball']);
    for (const variant of GOODS_KINDS) {
      const item = build('goods', { variant }), box = bounds(item), size = box.getSize(new THREE.Vector3());
      try {
        expect(box.min.y, variant).toBeCloseTo(0, 2);
        expect(Math.max(size.x, size.y, size.z), variant).toBeGreaterThan(.09);
        expect(Math.max(size.x, size.y, size.z), variant).toBeLessThan(.3);
        expect(item.getObjectByName(`goods-${variant}`), variant).toBeDefined();
      } finally { disposeObject(item); }
    }
    expect(() => build('goods', { variant: 'garden' })).toThrow('Goods variant must be one of kitchen, home, outdoor, toys, tech, sport');
  });

  it('recolors only the main body from the instance color', () => {
    const color = (object: THREE.Object3D, name: string) => ((object.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
    const plain = build('goods', { variant: 'kitchen' }), tinted = build('goods', { variant: 'kitchen', color: '#123456' });
    expect([color(plain, 'goods-mug'), color(tinted, 'goods-mug'), color(tinted, 'goods-mug-rim')]).toEqual(['c8664a', '123456', 'f3e6d6']);
    [plain, tinted].forEach(disposeObject);
  });

  it('fills store shelving, carts, baskets, put walls and totes with one type of goods', () => {
    expect(CATALOG_OPTION_ASSETS.goods).toEqual(['store-shelving', 'shopping-cart', 'hand-basket', 'put-wall', 'tote']);
    const cases: [string, number, GoodsKind, number][] = [['store-shelving', 24, 'toys', 4], ['shopping-cart', 6, 'kitchen', 1], ['hand-basket', 4, 'tech', 1], ['put-wall', 20, 'sport', 2], ['tote', 9, 'home', 1]];
    for (const [asset, count, goods, perPart] of cases) {
      const plain = build(asset, { count }), filled = build(asset, { count, options: { goods } });
      try {
        expect(parts(filled), asset).toHaveLength(count);
        expect(named(filled, `goods-${goods}`), asset).toHaveLength(count * perPart);
        for (const other of GOODS_KINDS.filter(kind => kind !== goods)) expect(named(filled, `goods-${other}`), `${asset} ${other}`).toHaveLength(0);
        // The goods stay inside the container's own frame.
        const frame = bounds(plain).expandByScalar(.005);
        for (const part of parts(filled)) expect(frame.containsBox(bounds(part)), `${asset} ${part.name}`).toBe(true);
      } finally { [plain, filled].forEach(disposeObject); }
    }
  });

  it('accepts options.goods only on its containers and only with a known type', () => {
    expect(() => build('tote', { options: { goods: 'garden' as GoodsKind } })).toThrow('options.goods of tote must be one of');
    expect(() => build('pallet', { options: { goods: 'toys' } })).toThrow('Asset pallet does not accept options.goods');
  });
});

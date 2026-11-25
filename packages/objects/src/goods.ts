import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import type { MaterialContext } from '@opsorama/three';
import { resolveObjectColor } from './object-palette';
import { cylinder, part } from './parts';

/** The six types of goods a shop sells, each with one iconic item. */
export const GOODS_KINDS = Object.freeze(['kitchen', 'home', 'outdoor', 'toys', 'tech', 'sport'] as const);
export type GoodsKind = typeof GOODS_KINDS[number];
/** The iconic item of each type of goods. */
export const GOODS_ITEMS: Readonly<Record<GoodsKind, string>> = Object.freeze({ kitchen: 'Mug', home: 'Table lamp', outdoor: 'Camping lantern', toys: 'Teddy bear', tech: 'Headphones', sport: 'Basketball' });

/** Validates a type of goods and throws an actionable error. */
export function validateGoodsKind(value: unknown, where: string): asserts value is GoodsKind {
  if (!GOODS_KINDS.includes(value as GoodsKind)) throw new Error(`${where} must be one of ${GOODS_KINDS.join(', ')}; got ${JSON.stringify(value)}.`);
}

const sphere = (group: THREE.Object3D, radius: number, position: readonly [number, number, number], color: string, name: string, scale: readonly [number, number, number] = [1, 1, 1]) => {
  const mesh = part(group, new THREE.SphereGeometry(radius, 14, 10), color, name, { roughness: .8 }); mesh.position.set(...position); mesh.scale.set(...scale); return mesh;
};
const ring = (group: THREE.Object3D, radius: number, tube: number, arc: number, color: string, name: string) => part(group, new THREE.TorusGeometry(radius, tube, 8, 24, arc), color, name, { roughness: .5 });

/** The main body tone of each item: the mug, the lamp shade, the lantern body, the bear's fur, the headphones and the ball. */
export const GOODS_TONES: Readonly<Record<GoodsKind, string>> = Object.freeze({ kitchen: '#c8664a', home: '#f1e3c6', outdoor: '#3f8a52', toys: '#a8703f', tech: '#2f3542', sport: '#e07b2e' });

/** Each item in real size, standing with its bottom on its origin, front toward +z; `body` is its main body tone. */
const BUILDERS: Readonly<Record<GoodsKind, (group: THREE.Group, body: string) => void>> = {
  // A stoneware mug, 9 cm across and 10 cm high, with its handle to the right.
  kitchen: (group, body) => {
    cylinder(group, .045, .1, .05, body, 'goods-mug', { segments: 18, roughness: .6 });
    cylinder(group, .039, .004, .099, '#f3e6d6', 'goods-mug-rim', { segments: 18 });
    const handle = ring(group, .025, .007, Math.PI, body, 'goods-mug-handle'); handle.rotation.z = -Math.PI / 2; handle.position.set(.045, .05, 0);
  },
  // A table lamp, 26 cm high: a dark round foot, a stem and a cream shade.
  home: (group, body) => {
    cylinder(group, .055, .02, .01, '#4a4f5a', 'goods-lamp-base', { segments: 18, roughness: .4 });
    cylinder(group, .008, .14, .09, '#4a4f5a', 'goods-lamp-stem', { segments: 8 });
    cylinder(group, .045, .1, .21, body, 'goods-lamp-shade', { segments: 18, bottomRadius: .08, roughness: .9 });
  },
  // A camping lantern, 20 cm high: a green base and cap around a warm glass, with a wire handle.
  outdoor: (group, body) => {
    cylinder(group, .05, .04, .02, body, 'goods-lantern-body', { segments: 16 });
    cylinder(group, .04, .09, .085, '#ffe3a1', 'goods-lantern-glass', { segments: 16, emissive: '#f7c75a', roughness: .3 });
    cylinder(group, .05, .03, .145, body, 'goods-lantern-body', { segments: 16, bottomRadius: .05 });
    const handle = ring(group, .035, .004, Math.PI, '#2f3542', 'goods-lantern-handle'); handle.position.set(0, .16, 0);
  },
  // A seated teddy bear, 20 cm high: body, head, ears, muzzle and feet.
  toys: (group, body) => {
    const fur = body, light = '#e2bf92';
    sphere(group, .06, [0, .065, 0], fur, 'goods-bear-body', [1, 1.05, .9]);
    for (const x of [-.035, .035]) sphere(group, .022, [x, .018, .045], fur, 'goods-bear-foot', [1, .8, 1.2]);
    sphere(group, .045, [0, .15, 0], fur, 'goods-bear-head');
    for (const x of [-.034, .034]) sphere(group, .016, [x, .186, -.005], fur, 'goods-bear-ear');
    sphere(group, .018, [0, .14, .038], light, 'goods-bear-muzzle', [1.1, .85, .8]);
    sphere(group, .028, [0, .07, .042], light, 'goods-bear-belly', [1, 1.1, .5]);
  },
  // Over-ear headphones standing upright, 17 cm high: a headband and two cushioned ear cups.
  tech: (group, body) => {
    const band = ring(group, .065, .009, Math.PI, body, 'goods-headphones-band'); band.position.set(0, .08, 0);
    for (const x of [-.065, .065]) {
      const cup = cylinder(group, .035, .028, 0, body, 'goods-headphones-cup', { segments: 16, roughness: .5 }); cup.rotation.z = Math.PI / 2; cup.position.set(x, .035, 0);
      const cushion = cylinder(group, .03, .012, 0, '#2f7fc4', 'goods-headphones-cushion', { segments: 16, roughness: .9 }); cushion.rotation.z = Math.PI / 2; cushion.position.set(x - Math.sign(x) * .019, .035, 0);
    }
  },
  // A basketball, 12 cm across here (a shop's display size), with its black seams.
  sport: (group, body) => {
    sphere(group, .06, [0, .063, 0], body, 'goods-ball');
    for (const [x, y] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]] as const) {
      const seam = ring(group, .0605, .0025, Math.PI * 2, '#2a2a2a', 'goods-ball-seam'); seam.rotation.set(x, y, 0); seam.position.y = .063;
    }
  },
};

/** One item of a type of goods in real size, its bottom on the origin and centred on its body; `body` recolors its main body. */
export function goodsItem(kind: GoodsKind, body = GOODS_TONES[kind]): THREE.Group {
  const item = new THREE.Group(); item.name = `goods-${kind}`;
  BUILDERS[kind](item, body);
  return item;
}
/**
 * One item of a type of goods scaled uniformly to fit a box of `[width, height, depth]` metres, with its bottom on the
 * origin and centred on it, named `name`. Containers use it for their slots, so a slot shows its goods at any model scale.
 */
export function goodsPart(kind: GoodsKind, size: readonly [number, number, number], name: string): THREE.Group {
  const holder = new THREE.Group(); holder.name = name;
  const item = goodsItem(kind), bounds = new THREE.Box3().setFromObject(item), extent = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(size[0] / extent.x, size[1] / extent.y, size[2] / extent.z);
  item.scale.setScalar(scale);
  item.position.set(-(bounds.min.x + bounds.max.x) / 2 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) / 2 * scale);
  holder.add(item);
  return holder;
}

/**
 * One item of a type of goods in real size, standing on its base centre. `variant` is the type. Its main body takes the
 * surface role like every catalog model (`color`, `materials.surface`, then the scene palette), with the type's own tone as
 * the default. Containers filled through `options.goods` keep the types' own tones.
 */
export function createGoods(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const kind = node.variant ?? 'kitchen';
  validateGoodsKind(kind, 'Goods variant');
  const goods = new THREE.Group(); goods.name = 'goods';
  goods.add(goodsItem(kind, resolveObjectColor(node, context, 'surface', GOODS_TONES[kind])));
  return goods;
}

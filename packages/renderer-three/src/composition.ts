import * as THREE from 'three';
import type { AssetNode, MaterialRole, Vec3 } from '@opsorama/core';
import { createParcel } from './parcels';
import { createShoppingCart } from './retail';
import { createPerson } from './worker';
import { disposeObject } from './assets';
export interface CompositionDescriptor {
  asset: string; pivot: Vec3; bounds: { min: Vec3; max: Vec3 }; anchors: readonly string[];
  paletteRoles: readonly MaterialRole[]; animation: 'none' | 'local';
  interaction: 'selectable'; ownership: 'instance';
}
/** Implemented composition subset. Other catalog entries retain their own documented contracts. */
export function describeComposition(node: AssetNode): CompositionDescriptor | null {
  const factories = { parcel: createParcel, 'shopping-cart': createShoppingCart, worker: createPerson };
  if (!Object.hasOwn(factories, node.asset)) return null;
  const factory = factories[node.asset as keyof typeof factories];
  const object = factory(node);
  try {
    const box = new THREE.Box3().setFromObject(object), anchors: string[] = [];
    object.traverse(part => { if (part.name.startsWith('anchor-')) anchors.push(part.name.slice(7)); });
    return { asset: node.asset, pivot: [0, 0, 0], bounds: { min: box.min.toArray() as [number, number, number], max: box.max.toArray() as [number, number, number] }, anchors: [...new Set(anchors)],
      paletteRoles: node.asset === 'parcel' ? ['surface', 'trim', 'text', 'structure', 'accent', 'warning', 'critical'] : node.asset === 'shopping-cart' ? ['structure', 'glass', 'accent', 'warning', 'inactive'] : ['accent', 'skin', 'hair', 'structure', 'text'],
      animation: node.asset === 'worker' ? 'local' : 'none', interaction: 'selectable', ownership: 'instance' };
  } finally { disposeObject(object); }
}

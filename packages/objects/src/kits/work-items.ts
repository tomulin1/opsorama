import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createOrderTicket, createPolyMailer } from '../fulfillment';
import { createBag } from '../generic-models';
import { createTote } from '../handling';
import { createPallet, createParcel, createParcelBase } from '../parcels';
import { createHandBasket, createShoppingCart } from '../retail';
import { createBulkBag, createDrumPallet, createIbcTank, createPalletStack } from '../warehouse';

/**
 * Work items kit of the object catalog: `parcel`, `parcel-base`, `pallet`, `tote`, `bag`, `shopping-cart`, `order-ticket`, `poly-mailer`, `hand-basket`, `pallet-stack`, `ibc-tank`, `drum-pallet`, `bulk-bag`.
 * Import it from `@opsorama/objects/work-items` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const workItemsKit: AssetRegistry = catalogEntries({
  parcel: createParcel,
  'parcel-base': createParcelBase,
  pallet: createPallet,
  tote: createTote,
  bag: createBag,
  'shopping-cart': createShoppingCart,
  'order-ticket': createOrderTicket,
  'poly-mailer': createPolyMailer,
  'hand-basket': createHandBasket,
  'pallet-stack': createPalletStack,
  'ibc-tank': createIbcTank,
  'drum-pallet': createDrumPallet,
  'bulk-bag': createBulkBag,
});

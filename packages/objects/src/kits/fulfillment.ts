import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createCarrierPickupPoint, createHoldCage, createLabelPrinter, createMailSack, createPackagingSupply, createParcelScale, createPickingCart, createPutWall, createRollCage } from '../fulfillment';

/**
 * Fulfillment kit of the object catalog: `picking-cart`, `packaging-supply`, `label-printer`, `parcel-scale`, `mail-sack`, `carrier-pickup-point`, `hold-cage`, `put-wall`, `roll-cage`.
 * Import it from `@opsorama/objects/fulfillment` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const fulfillmentKit: AssetRegistry = catalogEntries({
  'picking-cart': createPickingCart,
  'packaging-supply': createPackagingSupply,
  'label-printer': createLabelPrinter,
  'parcel-scale': createParcelScale,
  'mail-sack': createMailSack,
  'carrier-pickup-point': createCarrierPickupPoint,
  'hold-cage': createHoldCage,
  'put-wall': createPutWall,
  'roll-cage': createRollCage,
});

import type { CountLayout } from '@opsorama/core';

/** Existing host scenes retain compact defaults; the catalog opts into reserved slots. */
export const assetCountLayoutDefaults: Readonly<Record<string, CountLayout>> = Object.freeze({
  'parcel-base': 'compact',
});

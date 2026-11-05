import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createDeckShower, createDosingStation, createLapPool, createLifeRingPost, createLifeguardChair, createPoolLadder, createSandFilter, createStartingBlock, createSunLounger, createSwimmer, createWadingPool } from '../aquatics';

/**
 * Aquatics kit of the object catalog: `lap-pool`, `wading-pool`, `swimmer`, `starting-block`, `lifeguard-chair`, `pool-ladder`, `sun-lounger`, `deck-shower`, `life-ring-post`, `dosing-station`, `sand-filter`.
 * Import it from `@opsorama/objects/aquatics` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const aquaticsKit: AssetRegistry = catalogEntries({
  'lap-pool': createLapPool,
  'wading-pool': createWadingPool,
  swimmer: createSwimmer,
  'starting-block': createStartingBlock,
  'lifeguard-chair': createLifeguardChair,
  'pool-ladder': createPoolLadder,
  'sun-lounger': createSunLounger,
  'deck-shower': createDeckShower,
  'life-ring-post': createLifeRingPost,
  'dosing-station': createDosingStation,
  'sand-filter': createSandFilter,
});

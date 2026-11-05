import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createBench, createLampPost, createPottedPlant } from '../decor';
import { createTree } from '../generic-models';
import { createFenceSegment, createTrafficCone, createWasteBin } from '../site';
import { createPalmTree, createPineTree } from '../trees';
import { createSafetyBarrier } from '../warehouse';

/**
 * Environment kit of the object catalog: `tree`, `tree-pine`, `tree-palm`, `potted-plant`, `bench`, `lamp-post`, `fence-segment`, `waste-bin`, `traffic-cone`, `safety-barrier`.
 * Import it from `@opsorama/objects/environment` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const environmentKit: AssetRegistry = catalogEntries({
  tree: createTree,
  'tree-pine': createPineTree,
  'tree-palm': createPalmTree,
  'potted-plant': createPottedPlant,
  bench: createBench,
  'lamp-post': createLampPost,
  'fence-segment': createFenceSegment,
  'waste-bin': createWasteBin,
  'traffic-cone': createTrafficCone,
  'safety-barrier': createSafetyBarrier,
});

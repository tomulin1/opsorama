import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createEventStage, createExhibitionBooth } from '../events';

/**
 * Events kit of the object catalog: `event-stage`, `exhibition-booth`.
 * Import it from `@opsorama/objects/events` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const eventsKit: AssetRegistry = catalogEntries({
  'event-stage': createEventStage,
  'exhibition-booth': createExhibitionBooth,
});

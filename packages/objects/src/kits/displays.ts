import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createInformationBoard, createMonitor, createReadout } from '../displays';

/**
 * Displays & time kit of the object catalog: `monitor`, `information-board`, `led-display`, `analog-clock`, `digital-clock`, `stopwatch`, `countdown-timer`.
 * Import it from `@opsorama/objects/displays` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const displaysKit: AssetRegistry = catalogEntries({
  monitor: createMonitor,
  'information-board': createInformationBoard,
  'led-display': createReadout,
  'analog-clock': createReadout,
  'digital-clock': createReadout,
  stopwatch: createReadout,
  'countdown-timer': createReadout,
});

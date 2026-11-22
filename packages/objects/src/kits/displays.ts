import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
// Brings the catalog's typed AssetOptions (module augmentation of @opsorama/core) to every consumer of this kit.
import '../options';
import { createInformationBoard, createMonitor, createReadout, validateReadoutNode } from '../displays';

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
}, {
  'led-display': validateReadoutNode,
  'analog-clock': validateReadoutNode,
  'digital-clock': validateReadoutNode,
  stopwatch: validateReadoutNode,
  'countdown-timer': validateReadoutNode,
});

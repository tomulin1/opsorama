import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
// Brings the catalog's typed AssetOptions (module augmentation of @opsorama/core) to every consumer of this kit.
import '../options';
import { createLabFlask, createLabTray, createLabWorkstation } from '../laboratory';

/**
 * Laboratory kit of the object catalog: `lab-flask`, `lab-tray`, `lab-workstation`.
 * Import it from `@opsorama/objects/laboratory` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const laboratoryKit: AssetRegistry = catalogEntries({
  'lab-flask': createLabFlask,
  'lab-tray': createLabTray,
  'lab-workstation': createLabWorkstation,
});

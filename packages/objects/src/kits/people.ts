import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
// Brings the catalog's typed AssetOptions (module augmentation of @opsorama/core) to every consumer of this kit.
import '../options';
import { createPerson } from '../worker';

/**
 * People kit of the object catalog: `worker`, `office-worker`, `chef`, `doctor`, `nurse`, `security-guard`, `construction-worker`, `visitor`.
 * Import it from `@opsorama/objects/people` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const peopleKit: AssetRegistry = catalogEntries({
  worker: createPerson,
  'office-worker': createPerson,
  chef: createPerson,
  doctor: createPerson,
  nurse: createPerson,
  'security-guard': createPerson,
  'construction-worker': createPerson,
  visitor: createPerson,
});

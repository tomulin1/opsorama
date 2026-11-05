import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createDeskPod, createFocusPod, createMeetingTable, createOfficeChair, createWhiteboard } from '../office';

/**
 * Office kit of the object catalog: `desk-pod`, `office-chair`, `meeting-table`, `whiteboard`, `focus-pod`.
 * Import it from `@opsorama/objects/office` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const officeKit: AssetRegistry = catalogEntries({
  'desk-pod': createDeskPod,
  'office-chair': createOfficeChair,
  'meeting-table': createMeetingTable,
  whiteboard: createWhiteboard,
  'focus-pod': createFocusPod,
});

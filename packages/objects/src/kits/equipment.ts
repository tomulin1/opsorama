import type { AssetRegistry } from '@opsorama/three';
import { catalogEntries } from '../catalog-entry';
import { createMachineTool, createRobotArm, createSecurityCamera } from '../automation';
import { createKitchenStation } from '../care';
import { createConveyor } from '../handling';
import { createGantryCrane, createTowerCrane } from '../industry';
import { createEquipmentCabinet } from '../structures';
import { createStretchWrapper } from '../warehouse';

/**
 * Equipment kit of the object catalog: `conveyor`, `equipment-cabinet`, `robot-arm`, `machine-tool`, `security-camera`, `tower-crane`, `gantry-crane`, `kitchen-station`, `stretch-wrapper`.
 * Import it from `@opsorama/objects/equipment` and pass it to the renderer alone or merged with other kits and custom factories through `createAssetRegistry`.
 */
export const equipmentKit: AssetRegistry = catalogEntries({
  conveyor: createConveyor,
  'equipment-cabinet': createEquipmentCabinet,
  'robot-arm': createRobotArm,
  'machine-tool': createMachineTool,
  'security-camera': createSecurityCamera,
  'tower-crane': createTowerCrane,
  'gantry-crane': createGantryCrane,
  'kitchen-station': createKitchenStation,
  'stretch-wrapper': createStretchWrapper,
});

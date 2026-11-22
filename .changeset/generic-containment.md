---
"@opsorama/core": minor
"@opsorama/three": minor
"@opsorama/objects": minor
"@opsorama/vue": minor
---

Make containment generic: any asset node can be a `parentId` parent. `AssetNode.view` (`'closed'` by default, `'peek'` or `'open'`) and `AssetNode.peekOnHover` replace `building.view` and `building.peekOnHover`. Core renames: `validateBuildingParents` → `validateParents`, `isInteriorVisible` → `isNodeVisible`, `isInsideBuilding` → `isContained`, `setBuildingView` → `setNodeView`, `bindBuildingInterior` → `bindChildren`, `BuildingLoadState` → `ChildrenLoadState`, `BuildingInteriorLoader` → `ChildrenLoader`; new `NODE_VIEWS`, `NodeView` and `nodeView`. Building options and constants (`BuildingOptions`, `BUILDING_TYPES`, `BUILDING_TYPE_LABELS`, `BUILDING_SIZE`, `BUILDING_PALETTES`, `validateBuilding`, `isBuilding`) move to `@opsorama/objects`, where the building factory validates them. The renderer reads the factory hints `userData.containerBounds` (was `buildingBounds`) and `userData.labelHeight` instead of checking asset names. The Vue `Asset` component gains `view` and `peekOnHover` props.

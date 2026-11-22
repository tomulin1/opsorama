# @opsorama/objects

The Opsorama object catalog: 161 procedural Three.js models (no downloaded meshes or textures) with typed options, semantic palette roles, static poses, anchors and serializable descriptors. Models are grouped into 21 kits that mirror the object browser categories, so a scene bundles only what it uses.

## Install

```sh
npm install @opsorama/objects @opsorama/three @opsorama/core three
```

## Usage

```ts
import { createAssetRegistry } from '@opsorama/three';
import { furnitureKit } from '@opsorama/objects/furniture';
import { workItemsKit } from '@opsorama/objects/work-items';

export const assets = createAssetRegistry(workItemsKit, furnitureKit);
```

| Kit subpath | Export | Examples |
| --- | --- | --- |
| `@opsorama/objects/work-items` | `workItemsKit` | parcel, pallet, tote, bag, shopping cart |
| `@opsorama/objects/furniture` | `furnitureKit` | shelf, parcel locker, station, pallet rack |
| `@opsorama/objects/vehicles` | `vehiclesKit` | truck, van, forklift, mobile robot, tractor |
| `@opsorama/objects/datacenter` | `datacenterKit` | rack server, network switch, cooling unit, UPS |
| `@opsorama/objects/people` | `peopleKit` | worker, office worker, chef, nurse, visitor |

All 21 kits: `datacenter`, `displays`, `buildings`, `indicators`, `work-items`, `people`, `furniture`, `equipment`, `office`, `retail`, `fulfillment`, `vehicles`, `environment`, `surfaces`, `energy`, `events`, `restaurant`, `aquatics`, `animals`, `farm`, `laboratory` (also exported as `CATALOG_KITS`).

- `catalogAssets` (package root) contains every model: convenient for prototypes, larger to bundle.
- `@opsorama/objects/catalog.json` lists every kit and asset with its descriptor (palette roles, options, counts, anchors, motion, interaction) for tools and AI agents that cannot run WebGL.
- `assetDescriptors` and `checkAssetDescriptor` verify a descriptor against the model it builds.

### Model options

Settings that belong to one model go in the node's `options`. Importing any kit types them on `AssetNode.options` (`forks`, `person`, `heatEnabled`, `waterRunning`, `fillLevel`, `building`, `contents`, `display`, `measurement`, `surfaceLabel`), and each catalog factory's `validate` rejects an option the asset does not accept, naming the assets that accept it. `CATALOG_OPTION_ASSETS` lists them; descriptors list them as `options.<name>` customization fields.

```ts
import { createSceneStore } from '@opsorama/core';
import { assetValidator, createAssetRegistry } from '@opsorama/three';
import { indicatorsKit } from '@opsorama/objects/indicators';
import { buildingsKit } from '@opsorama/objects/buildings';

const assets = createAssetRegistry(indicatorsKit, buildingsKit);
// validateAsset makes upsert and replace reject invalid options instead of failing when the renderer builds the node.
const store = createSceneStore({ schemaVersion: 1, nodes: [
  { id: 'load', kind: 'asset', asset: 'ring-gauge', options: { measurement: { value: 72.5, unit: '%' } } },
  { id: 'depot', kind: 'asset', asset: 'building', options: { building: { type: 'warehouse', size: [12, 5, 9] } } },
] }, {}, { validateAsset: assetValidator(assets) });
```

### Handling rules

`@opsorama/objects/handling` says which movable units fit which places, from declared data only: unit classes, receptacles and load patterns (`assetHandling` and `handlingProfiles` from the package root hold the catalog's declarations). `createHandlingState` tracks placements and checks moves, `handlingItemPolicy` lets the core behavior runner pick up and put down units through those checks, and `createMoveMode` with `bindMoveMode` is optional move interaction for viewers. The entry loads no Three.js code.

```ts
import { createBehaviorRunner, createNavGraph } from '@opsorama/core';
import { assetHandling, handlingProfiles } from '@opsorama/objects';
import { createHandlingState, handlingItemPolicy } from '@opsorama/objects/handling';

const handling = createHandlingState({
  handling: assetHandling, profiles: handlingProfiles,
  instances: [{ id: 'shelf', asset: 'shelf' }, { id: 'order-1', asset: 'parcel' }],
});
const [check] = handling.move([{ unit: 'order-1', to: { container: 'shelf', receptacle: 'level-1' } }]);
// A refused move names the problem in check.violations, e.g. does-not-fit or position-taken.
const graph = createNavGraph({ points: [{ id: 'aisle', position: [0, 0, 0] }], edges: [] });
export const runner = createBehaviorRunner({ graph, agents: [], itemPolicy: handlingItemPolicy(handling) });
export const placed = check.ok;
```

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.

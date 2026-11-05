# @opsorama/objects

The Opsorama object catalog: 160 procedural Three.js models (no downloaded meshes or textures) with typed options, semantic palette roles, static poses, anchors and serializable descriptors. Models are grouped into 21 kits that mirror the object browser categories, so a scene bundles only what it uses.

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

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.

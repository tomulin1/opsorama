# Opsorama

**A clear view of your operations.**

![Opsorama — a clear view of your operations](apps/site/public/brand/opsorama-lockup.svg)

Pronounced **ops-oh-RAH-ma**, Opsorama combines *operations* with *panorama*: a clear view of everything happening across a business. Build animated 3D boards for commerce, logistics, HR and other domains. [Brand guide and assets](docs/BRAND.md).

Opsorama is a framework-agnostic toolkit for animated 3D dashboards embedded in existing administration interfaces, with native **React and Vue** adapters and plain JavaScript support. Scenes compose documented components, connect to custom data, and support custom models, motion, and HTML UI. All repository content uses English.

[GitHub repository](https://github.com/tomulin1/opsorama) · [contact@opsorama.dev](mailto:contact@opsorama.dev)

The workspace now includes a **shared TypeScript core**, **Three.js renderer**, **React and native Vue adapters**, a complete **e-commerce example**, and a **documentation website**. The original warehouse prototype is retired; its unique logistics models are preserved in the shared catalog. Toolkit packages use the `@opsorama/*` namespace as private local workspace packages; they are not published on npm.

## Explore the implementation

After starting the dev server:

| Page | URL | Purpose |
| --- | --- | --- |
| Documentation | http://127.0.0.1:3100/docs | Searchable component/API references, configuration, data guide, live playground |
| Website brand & colors | http://127.0.0.1:3100/brand | Footer-linked palette for the example website; object and real-dashboard palettes are configured separately. [Audit](docs/COLOR_AUDIT.md) |
| Object catalog | http://127.0.0.1:3100/docs/objects | Shop-style model browser, filters, portable previews and shared logistics models |
| Home page | http://127.0.0.1:3100/ | City of the domain examples in one scene, composed from their own code, with a capability carousel in the intro panel |
| Examples catalog | http://127.0.0.1:3100/examples | Domain recipes including e-commerce and open offices, plus toolkit demos |
| E-commerce example | http://127.0.0.1:3100/examples/ecommerce | Shop and fulfilment centre, full-viewport scene with floating HUD, mock snapshots |
| Framework comparison | http://127.0.0.1:3100/examples/adapters | The same scene in React, Vue, and plain JavaScript; mount/unmount controls |
| Generic data panels | http://127.0.0.1:3100/examples/panels | Neutral value/detail/process/list primitives in native React/Vue/JS; API at /docs/data-panels |
| Building containers | http://127.0.0.1:3100/examples/buildings | Peek/open cutaways, lazy interiors and independent child selection in native JS/React/Vue |
| Logistics objects | http://127.0.0.1:3100/examples/logistics | Shared forklift, loading dock, container and pallet composition in native JS/React/Vue |
| Performance playground | http://127.0.0.1:3100/examples/performance | Deterministic 256/1,024/2,048-instance stress scene, live diagnostics and exportable timed FPS recordings; [measurement guide](docs/PERFORMANCE_PLAYGROUND.md) |

The local documentation site covers the implemented API. The planning documents below also contain proposed future APIs and clearly distinguish them from implementation.

All 161 registered assets have serializable descriptors in `assetDescriptors`, checked against their factories without WebGL. Catalog detail pages display geometry, supported palette roles, fixed decoration, options, motion, anchors and ownership from that data. Ground, Zone and Path use separate typed primitive contracts. See [the coverage decision](docs/decisions/0057-complete-catalog-descriptors.md).

The shared `building` object offers generic, warehouse, distribution-center, workshop, office, retail and storage-shed exteriors. Type selectors preserve dimensions and ordinary child nodes using building-local `parentId` transforms. Closed interiors allocate no child render resources; optional `bindBuildingInterior` loads host data on demand with cancellation and successful-data caching. Explicit Open/Close controls pin a static cutaway, while opt-in mouse hover provides a temporary peek. See `/docs/buildings`, `/docs/objects/building` and [ADR 0011](docs/decisions/0011-building-containers.md). Placement and data rules remain host-owned.

## Toolkit architecture and examples

- `apps/site`: the private Next.js website `@opsorama/site` (documentation, domain examples, object browser); never published. Root scripts delegate to it.
- `tests/`: workspace-wide unit tests; Playwright specs live in `apps/site/e2e`.
- `packages/core`: framework-independent types, immutable scene snapshots, validated settings, selection, and subscriptions. No browser or graphics dependencies.
- `packages/renderer-three`: shared renderer, HTML labels, camera framing, transform interpolation, asset factories, and explicit teardown.
- `packages/react`: native provider, hooks, scene components, EntityLayer, and headless EntityInspector.
- `packages/vue`: native components, composables, subscriptions, events, and slots. No React dependency.
- `packages/ui`: optional generic presentation contracts/builders, DOM mount and scoped CSS; native components via `@opsorama/react/ui` and `@opsorama/vue/ui`. Hosts supply data meanings, content, actions and dashboard layouts. [Panel contract](docs/DATA_PANELS.md).
- `apps/site/examples/shared.ts`: one definition with two zones and three objects used by all three adapters.
- `apps/site/examples/react-minimal`, `apps/site/examples/vue-minimal`, `apps/site/examples/vanilla-minimal`: working examples rendered on the framework comparison page.
- `apps/site/examples/react-composition`: compiled declarative quickstart using Ground, Zone, and Asset.
- `apps/site/src/features/ecommerce`: shop and fulfilment centre mock snapshots, scene composition with lane-checked routes, and the floating HUD.
- `apps/site/src/features/docs`: typed reference content, navigation, copyable snippets, live configuration playground, and adapter comparison.

### E-commerce example

`/examples/ecommerce` shows a shop (shop floor, checkouts, click & collect, parcel lockers) next to the warehouse that fulfils its online orders: receiving, reserve pallet racks, forward picking, sortation with robots and put walls, packing, dispatch and returns. It is a full-viewport React scene with a floating HUD built from the shared `@opsorama/ui` panels. Three mock snapshots (Monday peak, Wednesday afternoon, Sunday night) drive the metrics, order and stock tables, inspectors and the model counts; pickers and vehicles follow routes planned on lane rules. The host owns all records and commands. Source: `apps/site/src/features/ecommerce`; guide: `/docs/recipes/ecommerce`; [domain notes](docs/domains/ecommerce.md).

Shared scene views support left-mouse dragging on the canvas to pan the camera. Short clicks still select objects; dragging preserves selection and domain positions. The Overview control restores the camera target while retaining zoom. With the `wheelZoom` option, the mouse wheel over the scene changes zoom.

Port **3100** is used to avoid existing local services on 3000/3001. Hosting is local; no site or npm package has been publicly published. SceneCanvas handles renderer disposal, while the host owns the store lifecycle. The renderer uses per-instance procedural geometry/material ownership; shared custom resources require an explicit ownership strategy. Quantity browser checks profile bounded views with software WebGL; hardware FPS and all-units capacity remain unverified.

### Countable models

Countable models now expose explicit counts: Parcels on base and Pallet with boxes 0–27 (the single parcel is one carton) and shelf contents 0–12. A multiplier changes the disclosed symbolic quantity without adding geometry. Try `/docs/objects/parcel-base`; the general Scale slider is removed. Implementers choose and calculate the mapping from visible parts to source quantities in their own application. Source-backed unit detail is a separate optional API.

## Project direction and roadmap

- [Vision, goal, and success criteria](docs/PROJECT_VISION.md)
- [Architecture and data contracts](docs/ARCHITECTURE.md)
- [Implementation guidelines](AGENTS.md)

## Preserved logistics objects

The warehouse recipe, its operations UI and deterministic congestion simulation were removed at the user's request. The unique forklift, loading dock and shipping container are now shared static factories with palette inheritance, instance materials, state marks, local anchors/bounds and owned resources. Existing building, pallet, truck, tree and shelf objects cover the other useful models. Ground, Zone, Path and wall segments cover future layouts. See [the preservation audit](docs/decisions/0015-warehouse-retirement.md).

`/examples/logistics` mounts the same composition through React, native Vue and JavaScript. The dock supports static closed/open poses. Cargo, movement, lifting, reservations and source quantities remain host-owned. Catalog previews and usage snippets are available for all three objects.

## Run

Requires Node.js 22+ and pnpm 11+. Dependencies are pinned by `pnpm-lock.yaml`.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3100 to browse the examples. No API keys, external models, downloaded textures, or backend services are required.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @opsorama/site exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm start
```

## License

Opsorama is licensed under the [MIT License](LICENSE), copyright 2026 Tomas Jirsa. Unless identified otherwise, this covers the project's original source code, procedural models, documentation and supplied SVG assets. Third-party material retains its own licenses and notices.

An on-screen logo, project link or “Powered by Opsorama” credit is welcome but optional. Redistribution must retain the copyright and permission notice as specified in the license.

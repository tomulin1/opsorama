# Contributing catalog objects

This guide describes what a complete catalog object in `@opsorama/objects` needs. It applies to new objects and to changes of existing ones. The parcel (`parcelDescriptor`) is the reference implementation.

## Where an object lives

1. **Factory.** A function `(node: AssetNode, context?: MaterialContext) => THREE.Object3D` in `packages/objects/src/`, next to related models. It builds procedural geometry from named parts; it owns every geometry, material and texture it creates.
2. **Kit.** Add the factory to exactly one kit in `packages/objects/src/kits/<kit>.ts`. Kits mirror the object browser categories (`CATALOG_KITS`); a new category means a new kit, a new subpath in `packages/objects/package.json` and a new entry in the website's category map.
3. **Descriptor.** Add a serializable `ObjectDescriptor` to `assetDescriptors`. `checkAssetDescriptor(descriptor, factory)` builds the model and verifies the descriptor against it; every descriptor must pass in `tests/catalog-descriptors.test.ts`. The descriptor also feeds `catalog.json` and the object page.
4. **Optional definitions.** Declare only what the model supports: counts (`assetCountDefinitions`), count layouts, displays, measurements, surface labels, footprints, interaction slots, handling (`assetHandling`, checked by `checkAssetHandling`) and motion profiles.
5. **Object page.** Add the catalog entry in `apps/site/src/features/docs/objects.ts` with the matching category, honest availability labels and supported controls only.
6. **Examples and tests.** Runnable JavaScript, React and Vue usage (the object page snippets cover the basic case; add an example page when the object has behavior worth showing) and unit tests for its options, states and disposal.

`tests/catalog-kits.test.ts` fails when an object is missing from a kit, appears in two kits or disagrees with its browser category.

## The common contract

Every object documents the following. A capability may be explicitly unsupported; a static tree needs no artificial animation or load-transfer action.

| Area | Required definition |
| --- | --- |
| Identity | Stable registry key, purpose, category (kit), implementation status and related examples |
| Geometry | Y-up, metric dimensions (or a disclosed process scale), footprint and bounds, pivot, forward direction (+z) and supported size limits; rotations in radians |
| Palette and materials | Named semantic color roles for every visible part, default role mappings, supported overrides and resource ownership; parts such as skin or wood still have overridable roles |
| Customization | Typed options with defaults, validation and live-update behavior for meaningful sizes, materials, parts, labels and variants; no untyped bag of renderer internals |
| State | Visual-state mapping (normal, busy, warning, critical, inactive) where the model has a native status display; otherwise declare states as unchanged. Selection and hover stay separate from body styling |
| Motion | A useful static pose, supported optional animation, enable policy, pause/resume/speed, interruption and cleanup; objects without animation declare that explicitly |
| Interaction | Selectability, hit area, event target identity, framing and label anchors, and named attachment or input/output anchors where meaningful |
| Handling | For movable objects: handling class, family, size, stacking and scale. For containers: receptacles with arrangement, anchors, capacity, envelope and accepted families |
| Lifecycle | Create, update, remove and dispose behavior; ownership of geometry, materials and textures; animator and subscription teardown |
| Evidence | Runnable examples, relevant checks and documented limits; proposals clearly marked |

## Palette inheritance

Use semantic roles such as `surface`, `structure`, `accent`, `trim`, `text`, `wood`, `metal`, `foliage` and the status roles. Resolve each part from the scene palette, then the definition's role mapping, the variant mapping and explicit instance overrides; unspecified parts keep inheriting. A scene palette change updates every inherited part and keeps explicit overrides. A theme or palette change rebuilds every asset node with the new `MaterialContext`.

Status indicators and selection emphasis are resolved separately from body styling: a custom truck color must not hide its warning marker or selected outline. Keep a text or symbol alternative so meaning never depends on color or motion alone.

## Shadows, merging and instancing

- **Shadows.** Factories declare which parts cast and receive shadows; transparent parts and flat overlays opt out. The renderer then applies one policy to every object: parts narrower than `SHADOW_MIN_WIDTH` (0.06 m) or contained in a larger casting part (`SHADOW_CONTAINMENT_TOLERANCE`, 0.03 m) stop casting, and indoor nodes (inside a `building`, or on a ground, zone or surface with `interior: true`) neither cast nor receive. The policy never turns a flag on.
- **Static merging.** Build models from separate named parts; the renderer merges static opaque meshes that differ only in base color into one mesh per material and shadow-flag group after building. Anchors, labels, transparent parts, instanced meshes and lines are never merged. Declare every part an animator moves, hides or recolors with `setAssetAnimator(object, animator, animatedParts)`; parts changed by other code opt out with `keepPartsSeparate(part)`. Tests and descriptor checks see the unmerged factory output.
- **Instancing.** Across nodes, four or more meshes with identical geometry and a material that differs only in base color draw as one `InstancedMesh`. Nothing extra is needed in the factory; build repeated objects identically to benefit.

## Animation

The scene owns the clock and the motion policy. An object can disable its own animation but cannot bypass scene motion-off or reduced motion. Separate decorative pose animation from movement toward host data; with animation off the object still shows the current state and position. Each animated object declares its static pose and a deterministic reset; re-enabling motion must not jump because of elapsed time. Use the renderer's animator hook, never a timer or frame loop per object.

## Surroundings and interaction

Declare bounds, pivot, forward direction and label/framing anchors. Where meaningful, add named local anchors (`anchor-*` children) such as a work position, shelf slot, load point, entry/exit or approach. Selection identifies the owning node and its optional `entityId`; decorative meshes never become invented business entities. Host actions go through typed events; routes, transfers and attachments are optional bindings with teardown. Generic objects contain no physics, navigation or business rules.

## Counts

A countable object declares a finite integer range or exact count variants and exposes count controls only where supported. A disclosed `multiplier` expresses symbolic totals; geometric scale never encodes quantity. Hosts keep exact totals and unit identities in their own code. See [bounded object counts](QUANTITY_SCALING.md).

## Verification checklist

For a new or changed object, verify what applies:

- palette inheritance, live palette and theme changes, partial overrides and invalid options;
- each declared state, and that undeclared states leave the model unchanged;
- hover, selection and their survival across rebuilds;
- static appearance, motion-off, pause/resume, reduced motion and removal during motion;
- anchors under instance transforms;
- mount, resize, update and dispose, including animator, listener and resource cleanup;
- the same behavior through JavaScript, React and Vue.

Then run `pnpm typecheck`, `pnpm lint`, `pnpm test` and, when the change touches package entry points or kits, `pnpm build:packages && pnpm check:packages && pnpm check:bundles`.

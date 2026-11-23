# Roadmap

Opsorama is pre-release. This page lists what is implemented, what comes before the first public release and what follows. It describes outcomes, not dates.

## Implemented

- **Core** (`@opsorama/core`): framework-free, domain-free scene model with immutable snapshots, validated settings, selection, subscriptions, generic containment, shape, line, text, image and group nodes with routes and controllers on shapes and groups, typed asset options, movement graphs and route planning, interaction slots, behaviors with carried items and a generic item policy.
- **Renderer** (`@opsorama/three`): one Three.js renderer for every framework, without built-in models; orthographic and perspective cameras with a camera API (read and set views, timed and interruptible transitions for views, framing and the overview, mouse orbit, following a moving node, camera paths, change events, React and Vue hooks), camera framing, panning and wheel zoom, opt-in touch gestures (one-finger pan, pinch zoom, two-finger orbit), engine hooks (pointer events on nodes with the world point, a frame hook with a fixed simulation step, renderer plugins, and their React and Vue forms), primitive shapes (box, sphere, cylinder) that share instanced unit geometry, lines and tubes, text drawn into shared canvas textures and images loaded in the background with a placeholder, each flat or as a camera-facing billboard, groups with selection that bubbles to the nearest selectable group (with React and Vue `Group`, `Shape`, `Line`, `SceneText` and `SceneImage`), labels and markers, selection styles, motion playback, shadows, static merging, instancing, a sliced initial load with a loading indicator, a live node preview for detail panels, and explicit disposal.
- **Object catalog** (`@opsorama/objects`): 161 procedural models with checked descriptors, split into 21 kits that mirror the object browser categories, plus `catalogAssets`, a machine-readable `catalog.json`, and handling rules, handling state and optional move mode in `@opsorama/objects/handling`.
- **Adapters**: native React (`@opsorama/react`) and Vue (`@opsorama/vue`) components with the same scene contract, and plain JavaScript through the renderer.
- **UI** (`@opsorama/ui`): optional framework-neutral panels (metric cards, data panels, inspectors, lists, meters) with native React and Vue components.
- **Website**: documentation, a searchable object browser with live previews and usage snippets, and full-viewport domain examples (e-commerce, distribution centre, office, datacenter, restaurant, farm, aquatics) whose inspectors show a live 3D copy of the selected object.
- **Distribution**: package builds with declarations, package checks from packed tarballs, bundle size budgets and four standalone starters (plain TypeScript, Vite + React, Vite + Vue, Next.js).
- **Documentation for agents**: package READMEs with type-checked examples, an agent skill (`skills/opsorama`) and `llms.txt` / `llms-full.txt` on the website.
- **Scene validation**: `validateScene` in `@opsorama/core` reports every problem of a scene definition in one pass with a JSON Pointer path, a stable rule ID and a suggested fix, and the store throws `SceneValidationError` with the same problems. A JSON Schema of scene definitions, generated from the core types, is published as `@opsorama/core/scene-definition.schema.json` and on the website.
- **Performance**: [measurements](PERFORMANCE.md) of frame rate at 256–2,048 objects, load time and repeated mount/unmount on a documented reference machine, plus bundle size budgets.
- **Project**: contributor guide, code of conduct, security policy, issue and pull request templates, and GitHub Actions for checks, end-to-end tests, security scanning, site deployment and Changesets releases.

## Direction

Opsorama is a toolkit for declarative 3D scenes in web applications that AI coding agents can build with reliably. Operational dashboards are the flagship use; management games, interactive explainers and spatial visualizations are further target uses (see the [project vision](PROJECT_VISION.md#target-uses)).

## Before the first release (0.1)

- Done: a domain-free core. `@opsorama/core` keeps the scene model, store, selection, events, placement, routes, movement and behaviors. Containment is generic for any asset; model-specific node props (such as `heatEnabled`, `fillLevel` or `forks`) live in one `AssetNode.options` field that `@opsorama/objects` types and validates per catalog asset; handling rules, handling state and move mode live in `@opsorama/objects/handling`, and the behavior runner checks carried items through a generic `ItemPolicy`; the renderer draws generic pick targets. A unit test keeps core and the renderer free of handling and catalog model names.
- Publication of the packages on npm and of the documentation at opsorama.dev (the release and deployment workflows exist and are switched off until then).

## After the first release

- **Engine API (0.2):** implemented (see Implemented): perspective and orthographic cameras with a camera API, orbit, following and camera paths; opt-in touch gestures; pointer events, a frame hook and renderer plugins; shape, line, text, image and group nodes, with selection that bubbles through groups. The scene schema and `validateScene` cover every node kind.
- **Content (0.3):** glTF/GLB models with instancing and disposal, textures and sprites, lighting and environment presets, optional post-processing (outline, bloom) and quality profiles, including a lighter profile for large scenes.
- **Showcases beyond dashboards:** a small management game and a visualization built from the same building blocks. Dedicated visualization or game packages are considered only after these showcases.
- **Building with AI agents:** a command-line scene check and headless rendering to an image, an MCP server with catalog search, validation and previews, and agent evaluations reported per release. Every new capability also updates the agent skill, `llms.txt` and the catalog.
- **Reach:** a Web Component adapter for other frameworks, a project scaffolder with agent instructions in its templates, a scene editor producing scene JSON, devtools and video export.
- Real host integrations and read-only connectors to external data sources.
- Streaming data contracts and grouped composition.
- `1.0` once pilot use has shown that the contracts are stable.

## Stability

Until `1.0`, minor versions may change APIs. Changes are listed in each package's changelog.

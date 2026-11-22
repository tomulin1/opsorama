# Roadmap

Opsorama is pre-release. This page lists what is implemented, what comes before the first public release and what follows. It describes outcomes, not dates.

## Implemented

- **Core** (`@opsorama/core`): framework-free scene model with immutable snapshots, validated settings, selection, subscriptions, movement graphs and route planning, interaction slots, behaviors, handling state and move mode.
- **Renderer** (`@opsorama/three`): one Three.js renderer for every framework, without built-in models; camera framing, panning and wheel zoom, labels and markers, selection styles, motion playback, shadows, static merging, instancing, a sliced initial load with a loading indicator, a live node preview for detail panels, and explicit disposal.
- **Object catalog** (`@opsorama/objects`): 161 procedural models with checked descriptors, split into 21 kits that mirror the object browser categories, plus `catalogAssets` and a machine-readable `catalog.json`.
- **Adapters**: native React (`@opsorama/react`) and Vue (`@opsorama/vue`) components with the same scene contract, and plain JavaScript through the renderer.
- **UI** (`@opsorama/ui`): optional framework-neutral panels (metric cards, data panels, inspectors, lists, meters) with native React and Vue components.
- **Website**: documentation, a searchable object browser with live previews and usage snippets, and full-viewport domain examples (e-commerce, distribution centre, office, datacenter, restaurant, farm, aquatics) whose inspectors show a live 3D copy of the selected object.
- **Distribution**: package builds with declarations, package checks from packed tarballs, bundle size budgets and four standalone starters (plain TypeScript, Vite + React, Vite + Vue, Next.js).
- **Documentation for agents**: package READMEs with type-checked examples, an agent skill (`skills/opsorama`) and `llms.txt` / `llms-full.txt` on the website.
- **Performance**: [measurements](PERFORMANCE.md) of frame rate at 256–2,048 objects, load time and repeated mount/unmount on a documented reference machine, plus bundle size budgets.
- **Project**: contributor guide, code of conduct, security policy, issue and pull request templates, and GitHub Actions for checks, end-to-end tests, security scanning, site deployment and Changesets releases.

## Direction

Opsorama is a toolkit for declarative 3D scenes in web applications that AI coding agents can build with reliably. Operational dashboards are the flagship use; management games, interactive explainers and spatial visualizations are further target uses (see the [project vision](PROJECT_VISION.md#target-uses)).

## Before the first release (0.1)

- A domain-free core: `@opsorama/core` keeps the scene model, store, selection, events, placement, routes, movement and behaviors. Done: containment is generic for any asset, and model-specific node props (such as `heatEnabled`, `fillLevel` or `forks`) live in one `AssetNode.options` field that `@opsorama/objects` types and validates per catalog asset. Remaining: handling rules and move mode move out of core. This changes package exports, so it lands before the first publication.
- Publication of the packages on npm and of the documentation at opsorama.dev (the release and deployment workflows exist and are switched off until then).

## After the first release

- **Engine API (0.2):** perspective, orbit and follow cameras with animated transitions and camera paths, a public camera API, touch gestures, primitive nodes (box, sphere, cylinder, line, 3D text, billboard), a group node, a public frame hook, pointer events on nodes and a renderer plugin API.
- **Content (0.3):** glTF/GLB models with instancing and disposal, textures and sprites, lighting and environment presets, optional post-processing (outline, bloom) and quality profiles, including a lighter profile for large scenes.
- **Showcases beyond dashboards:** a small management game and a visualization built from the same building blocks. Dedicated visualization or game packages are considered only after these showcases.
- **Building with AI agents:** a JSON Schema for scene definitions and a validator with located, actionable errors (with 0.2), a command-line scene check and headless rendering to an image, an MCP server with catalog search, validation and previews, and agent evaluations reported per release. Every new capability also updates the agent skill, `llms.txt` and the catalog.
- **Reach:** a Web Component adapter for other frameworks, a project scaffolder with agent instructions in its templates, a scene editor producing scene JSON, devtools and video export.
- Real host integrations and read-only connectors to external data sources.
- Streaming data contracts and grouped composition.
- `1.0` once pilot use has shown that the contracts are stable.

## Stability

Until `1.0`, minor versions may change APIs. Changes are listed in each package's changelog.

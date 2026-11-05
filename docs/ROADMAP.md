# Roadmap

Opsorama is pre-release. This page lists what is implemented, what comes before the first public release and what follows. It describes outcomes, not dates.

## Implemented

- **Core** (`@opsorama/core`): framework-free scene model with immutable snapshots, validated settings, selection, subscriptions, movement graphs and route planning, interaction slots, behaviors, handling state and move mode.
- **Renderer** (`@opsorama/three`): one Three.js renderer for every framework, without built-in models; camera framing, panning and wheel zoom, labels and markers, selection styles, motion playback, shadows, static merging, instancing and explicit disposal.
- **Object catalog** (`@opsorama/objects`): 160 procedural models with checked descriptors, split into 21 kits that mirror the object browser categories, plus `catalogAssets` and a machine-readable `catalog.json`.
- **Adapters**: native React (`@opsorama/react`) and Vue (`@opsorama/vue`) components with the same scene contract, and plain JavaScript through the renderer.
- **UI** (`@opsorama/ui`): optional framework-neutral panels (metric cards, data panels, inspectors, lists, meters) with native React and Vue components.
- **Website**: documentation, a searchable object browser with live previews and usage snippets, and full-viewport domain examples (e-commerce, office, datacenter, restaurant, farm, aquatics).
- **Distribution**: package builds with declarations, package checks from packed tarballs, bundle size budgets and four standalone starters (plain TypeScript, Vite + React, Vite + Vue, Next.js).

## Before the first release (0.1)

- Public documentation and agent support: package READMEs, an agent skill and `llms.txt`.
- Contributor guide, code of conduct, security policy, issue and pull request templates.
- Continuous integration: checks on every pull request, end-to-end tests, installation smoke tests and a release workflow with npm provenance.
- Performance measurement on a documented reference machine: load time, frame rate at several object counts and memory after repeated mount and unmount.
- Publication of the packages on npm and of the documentation at opsorama.dev.

## After the first release

- Real host integrations and read-only connectors to external data sources.
- Streaming data contracts and grouped composition.
- A lighter quality profile for large scenes.
- `1.0` once pilot use has shown that the contracts are stable.

## Stability

Until `1.0`, minor versions may change APIs. Changes are listed in each package's changelog.

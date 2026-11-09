# Roadmap

Opsorama is pre-release. This page lists what is implemented, what comes before the first public release and what follows. It describes outcomes, not dates.

## Implemented

- **Core** (`@opsorama/core`): framework-free scene model with immutable snapshots, validated settings, selection, subscriptions, movement graphs and route planning, interaction slots, behaviors, handling state and move mode.
- **Renderer** (`@opsorama/three`): one Three.js renderer for every framework, without built-in models; camera framing, panning and wheel zoom, labels and markers, selection styles, motion playback, shadows, static merging, instancing, a sliced initial load with a loading indicator, and explicit disposal.
- **Object catalog** (`@opsorama/objects`): 161 procedural models with checked descriptors, split into 21 kits that mirror the object browser categories, plus `catalogAssets` and a machine-readable `catalog.json`.
- **Adapters**: native React (`@opsorama/react`) and Vue (`@opsorama/vue`) components with the same scene contract, and plain JavaScript through the renderer.
- **UI** (`@opsorama/ui`): optional framework-neutral panels (metric cards, data panels, inspectors, lists, meters) with native React and Vue components.
- **Website**: documentation, a searchable object browser with live previews and usage snippets, and full-viewport domain examples (e-commerce, office, datacenter, restaurant, farm, aquatics).
- **Distribution**: package builds with declarations, package checks from packed tarballs, bundle size budgets and four standalone starters (plain TypeScript, Vite + React, Vite + Vue, Next.js).
- **Documentation for agents**: package READMEs with type-checked examples, an agent skill (`skills/opsorama`) and `llms.txt` / `llms-full.txt` on the website.
- **Performance**: [measurements](PERFORMANCE.md) of frame rate at 256–2,048 objects, load time and repeated mount/unmount on a documented reference machine, plus bundle size budgets.
- **Project**: contributor guide, code of conduct, security policy, issue and pull request templates, and GitHub Actions for checks, end-to-end tests, security scanning, site deployment and Changesets releases.

## Before the first release (0.1)

- Publication of the packages on npm and of the documentation at opsorama.dev (the release and deployment workflows exist and are switched off until then).

## After the first release

- Real host integrations and read-only connectors to external data sources.
- Streaming data contracts and grouped composition.
- A lighter quality profile for large scenes.
- `1.0` once pilot use has shown that the contracts are stable.

## Stability

Until `1.0`, minor versions may change APIs. Changes are listed in each package's changelog.

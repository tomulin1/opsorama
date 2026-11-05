# Project direction and working rules

This repository is evolving into **Opsorama**, an **open-source, framework-agnostic 3D dashboard toolkit**. Pronounced “ops-oh-RAH-ma”, the name combines operations + panorama; see `docs/BRAND.md`. The original warehouse prototype is retired; its useful unique models now live in the shared catalog.

## Language

Use **English for all repository content**, including planning documents, documentation, code comments, identifiers, examples, UI copy, and commit messages. Preserve proper names and externally supplied data where appropriate. Communication with the user is not restricted to English; follow the user's language and preferences. A later explicit user instruction takes precedence.

## Public identity and contact

- Write the owner's name as **Tomas Jirsa**, without diacritics, in project attribution and author metadata.
- Use **contact@opsorama.dev** as the public contact email. The project domain is **opsorama.dev**.
- The canonical GitHub repository is **https://github.com/tomulin1/opsorama**. Its existence does not authorize pushing or publishing changes.

## Built for AI agents

The toolkit is meant to be built and used with AI coding agents. Logic, architecture, APIs and documentation must be understandable to an agent that reads only the repository:

- Prefer explicit, typed and declarative contracts (descriptors, enums, documented defaults) over implicit conventions, hidden side effects or behavior that is only visible at runtime.
- Use descriptive names and one obvious way to do each task. Avoid aliases and parallel APIs that do the same thing.
- Document each public type, option and function with its purpose, units, valid ranges, defaults, lifecycle and limits, close to the code.
- Keep examples complete, copyable and runnable; state which snippets are implemented and checked and which are proposals.
- Make errors and validation messages name the problem and the fix.
- Keep the docs, decision records and code consistent; an agent should not have to guess which source is current.

## Persistent project context

Read these documents before substantial architecture or toolkit implementation work:

- `docs/PROJECT_VISION.md`: product goal, scope, principles and success criteria.
- `docs/ARCHITECTURE.md`: proposed shared core/renderer, adapters, data and motion.

The roadmap, object catalog plan, use cases, release plan and decision records are maintained outside this repository by the project owner. Agents working for the owner receive them through a git-ignored `CLAUDE.local.md`; other contributors do not need them. Keep the public documents current when implementation or agreed decisions change. Current user instructions take precedence. Choose the relevant incomplete milestone for an implementation request; a documentation/planning request does not authorize automatically implementing the entire roadmap.

## Architecture boundaries

- Shared core is TypeScript without React, Vue, Next.js, Zustand, DOM or Three.js imports.
- Proposed renderer is shared Three.js without a framework-specific runtime. Validate this in M1 before migrating the complete demo.
- React and Vue are first-class native adapters with the same capabilities and scene contract. Do not hide a React runtime inside Vue.
- Keep domain records separate from visual nodes, assets and animation state.
- Host applications own business rules, authentication, authorization, data sources and command handling.
- Generic building blocks stay generic; warehouse, ecommerce, HR and other domain recipes are optional compositions.
- HTML UI is optional and replaceable. Do not require the host's router, state library or design system to change.

## Implementation and documentation

- Prioritize the reusable object catalog as the foundation for dashboards, examples and domain scenes. Follow `docs/OBJECT_CATALOG.md` before adding recipe-specific geometry.
- Every catalog object inherits the scene's semantic color palette, supports documented instance customization, and declares a useful static appearance with animation disabled. Object overrides cannot re-enable motion disabled by the scene or reduced-motion policy.
- Declare interaction capabilities, bounds, pivots and relevant named anchors so objects can compose with their surroundings. Keep host business commands, path/layout bindings and optional behaviors separate from geometry; do not require physics or domain-specific rules in generic objects.
- Inventory and reuse existing example assets first. Extract inline models into standalone definitions gradually, preserving the current demos and record/quantity meanings. Framework components consume the same definition; avoid separate React/Vue model implementations.
- The common contract is `ObjectDescriptor` (core) plus `checkAssetDescriptor` (renderer); the parcel is the reference. A migrated or new entry declares a descriptor in `assetDescriptors` and passes the check in tests; entries without one keep their partial-contract labels.
- A catalog entry is complete only with typed customization, palette roles, motion and interaction semantics, lifecycle/resource ownership, runnable JS/React/Vue examples and relevant verification. Distinguish inventory, planned contracts and implemented support.
- Explicitly classify catalog animation support. Show animation controls only when a model has built-in animation; distinguish host-driven movement and prototype recipe motion from local model animation.
- Countable objects declare a finite integer range or exact count variants and expose count controls only where supported. Use a disclosed multiplier for symbolic totals; do not use geometric scale as a quantity encoding or invent unit identities. Hosts keep authoritative source totals and unit identities in their own code; the exact unit API was removed (ADR 0076). Follow `docs/QUANTITY_SCALING.md` for the primary bounded-count design.

- Build every new domain example that models a real-world environment (a facility, site, floor or other physical or process space) as a **full-viewport scene with a floating HUD**, following `/examples/datacenter` and ADR 0022: one canvas fills the window below the site header, information panels float inside the scene, an expanded mode covers the header and exits with Escape, and narrow layouts keep the panels inside the viewport with internal scrolling. Compose the HUD in host example code from the shared `@opsorama/ui` components, the zones in `apps/site/src/app/hud.css` and the helpers in `apps/site/src/features/example-hud.tsx`; do not add domain fields or a layout API to the generic packages. Extra panels start closed, and metric cards open the details behind them (ADR 0065). Keep the scene mount stable when panels toggle, and keep panel clicks from picking 3D objects behind them. These examples mount one adapter and show no React/Vue/JavaScript switcher; adapter parity is demonstrated by `/examples/adapters`, the object pages and tests, not by every domain example. Neutral catalog, adapter and object-browser examples are exempt.
- Move mode (`createMoveMode`, `bindMoveMode`) is optional interactivity that hosts add when they need it. Do not add it to domain examples; `/examples/move-mode` is its own example ([ADR 0062](docs/decisions/0062-move-mode.md)). Domain examples may still use handling state and agents.
- The warehouse prototype was retired on October 12, 2026 at the user's request. Preserve the shared logistics objects and the remaining runnable examples.
- The spiral conveyor and pipeline machine models and the entire DevOps & CI/CD example were removed without replacement on October 28, 2026. Do not restore their factories, routes, recipe UI or media. The shared lab-flask, lab-tray and lab-workstation remain catalog objects.
- Implement small complete JS/React/Vue slices before expanding recipes.
- Add public components with documented types, lifecycle, working examples and relevant verification.
- Clearly distinguish proposed API snippets from implemented and CI-checked examples.
- Measure performance; do not claim FPS, bundle budgets or integration support without evidence.
- Test renderer mount/resize/update/dispose, subscription cleanup and adapter parity where relevant.
- Use `pnpm` and strict TypeScript. Run checks appropriate to the code change; documentation-only edits need link/content validation, not a full application test run.
- Run end-to-end tests (`pnpm test:e2e` or any Playwright spec) only after the user approves it. When asking, warn that the run takes a long time and name the specs you would run. Until then, rely on typecheck, lint and unit tests, and report that e2e verification was not run.
- Update roadmap status and the concrete next step at the end of a milestone. Record adopted architectural decisions in `docs/decisions/` when they become real decisions.
- Do not invent a final project name, publish npm packages or assign an open-source license merely because they appear in the roadmap.

## Public boundary

- This repository contains only public material. `scripts/check-public-boundary.mjs` rejects references to non-public material: `--staged` runs from the versioned pre-commit hook (enable once per clone with `git config core.hooksPath .githooks`), `--hook` can run as a Claude Code `PreToolUse` hook on writes, and `pnpm check:boundary` checks the whole tree. Extra local patterns can be supplied with `git config opsorama.privatePatterns <file>`.
- Fix a reported line instead of bypassing the check with `--no-verify`. Existing references in the tree are being removed before the first release, so `pnpm check:boundary` does not pass yet.

## Git workflow

- Keep the project in Git and commit completed changes incrementally in coherent, reviewable groups.
- Use concise English commit messages describing the resulting change.
- Run relevant verification before committing implementation changes. Documentation-only changes need content/link checks.
- Inspect the staged diff and status before each commit. Stage explicit task-related paths and preserve unrelated user changes.
- Exclude dependencies, caches, builds, test reports, generated screenshots, local environment files, and logs from commits.
- Do not push, publish, or rewrite existing history unless the user asks for it.

## Current application commands

`pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (slow; only with user approval), `pnpm build`.

Package distribution: `pnpm build:packages` (tsup build of every package into `dist/`, plus `packages/objects/dist/catalog.json`), `pnpm check:packages` (pack, publint, consumer type check with `bundler` and `node16` resolution, Node import of every entry point; run after `build:packages`), `pnpm check:bundles` (bundle size budgets; `pnpm measure:bundles` only prints), `pnpm smoke:starters` (install every starter from the packed packages outside the workspace and build it; run after `build:packages`), `pnpm changeset` (record a change for the shared package version). Run the package checks when a change touches package entry points, exports, dependencies or build configuration.

The website is the private workspace app `@opsorama/site` in `apps/site` (Next.js source in `apps/site/src/`, website fixtures and adapter samples in `apps/site/examples/`, Playwright specs in `apps/site/e2e/`). Workspace-wide unit tests live in `tests/`. `examples/` holds standalone starters (`vanilla`, `vite-react`, `vite-vue`, `next`) that use the packages like an external project; they are outside the workspace and never import repository sources. Root scripts delegate website commands to `apps/site`. Implemented private workspace packages live in `packages/core`, `packages/three` (renderer engine, no models), `packages/objects` (object catalog and `catalogAssets`), `packages/react`, `packages/vue`, and `packages/ui`. The `@opsorama/*` namespace identifies private local workspace packages; npm scope ownership and publication remain unverified. Dev and production preview commands use loopback port 3100.

The documentation website at `/docs` describes the implemented API; older planning sketches in `docs/COMPONENTS.md` are future proposals. Keep them distinct. `/examples/ecommerce` is the online shop and fulfilment centre domain example (full-viewport scene with a floating HUD and a seeded mock feed in which real objects move and change hands only through people and machines, ADR 0067 and ADR 0068); `/examples/office` is the open-plan office domain example (people, presence, tickets, projects and room bookings; full-viewport scene with a floating HUD); `/examples/adapters` runs native React, Vue, and plain JavaScript minimal examples. The root `/` is the home page: a city of the domain examples in one scene, composed from their own node functions with `placeSceneNodes` in `apps/site/src/features/landing` (ADR 0072). Never copy example scene code into it. `/examples/logistics` demonstrates the extracted shared models.

`/docs/objects` is the shop-style object browser with search, category/availability filters and per-object pages. Portable objects have isolated live previews and usage snippets; the retired embedded warehouse prototype entries are removed. Maintain honest capability/availability labels as the common object contract is implemented. Use static gallery thumbnails and a single live detail viewer rather than an active renderer per card.

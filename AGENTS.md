# Working rules for contributors and their agents

**Opsorama** (pronounced "ops-oh-RAH-ma", operations + panorama) is an open-source, framework-agnostic toolkit for animated 3D dashboards with native React and Vue adapters and plain JavaScript support. These rules apply to everyone who changes this repository, human or AI agent. `CLAUDE.md` points here. Maintainers may add local, git-ignored instructions (`CLAUDE.local.md`, `AGENTS.local.md`); those never change the rules below for public contributions.

## Language and identity

- Use English for all repository content: documentation, code comments, identifiers, examples, UI copy and commit messages. Preserve proper names and externally supplied data.
- Project attribution: **Tomas Jirsa**, contact **contact@opsorama.dev**, domain **opsorama.dev**, repository **https://github.com/tomulin1/opsorama**.

## Built for AI agents

The toolkit is built and used with AI coding agents. Logic, architecture, APIs and documentation must be understandable to an agent that reads only this repository:

- Prefer explicit, typed and declarative contracts (descriptors, enums, documented defaults) over implicit conventions, hidden side effects or behavior visible only at runtime.
- Use descriptive names and one obvious way to do each task. Avoid aliases and parallel APIs.
- Document each public type, option and function with its purpose, units, valid ranges, defaults, lifecycle and limits, close to the code.
- Keep examples complete, copyable and runnable; mark proposals as proposals.
- Make errors and validation messages name the problem and the fix.
- Keep documentation and code consistent; an agent should not have to guess which source is current.

## Read first

- `docs/PROJECT_VISION.md`: goal, scope, principles and success criteria.
- `docs/ARCHITECTURE.md`: layers, packages, data, motion, lifecycle and package builds.
- `docs/ROADMAP.md`: what is implemented and what is planned.
- `docs/CONTRIBUTING_OBJECTS.md`: the contract and checklist for catalog objects.

## Architecture boundaries

- `@opsorama/core` is TypeScript without React, Vue, Next.js, DOM or Three.js imports.
- `@opsorama/three` is the shared Three.js renderer without a framework runtime and without models; it must never import `@opsorama/objects`.
- `@opsorama/objects` holds every catalog model, split into kits that mirror the object browser categories.
- React and Vue are first-class native adapters with the same capabilities and scene contract. Do not hide a React runtime inside Vue.
- Keep domain records separate from visual nodes, assets and animation state. Host applications own business rules, authentication, authorization, data sources and commands.
- Generic building blocks stay generic; domain scenes are optional compositions in the website.
- HTML UI (`@opsorama/ui`) is optional and replaceable; never require the host's router, state library or design system to change.

## Catalog objects

Follow `docs/CONTRIBUTING_OBJECTS.md`. In short:

- Every object inherits the scene's semantic palette, supports documented instance customization and has a useful static appearance with animation off. Object settings cannot re-enable motion that the scene or reduced-motion policy disabled.
- Declare bounds, pivot, forward direction and named anchors; keep host commands, layout bindings and optional behaviors out of geometry. No physics or domain rules in generic objects.
- A new or changed object declares an `ObjectDescriptor` in `assetDescriptors` that passes `checkAssetDescriptor`, belongs to exactly one kit and to the matching browser category, and has JavaScript, React and Vue usage.
- Show animation controls only for models with built-in animation; distinguish host-driven movement from local animation.
- Countable objects declare a finite integer range or exact variants; a disclosed `multiplier` expresses symbolic totals. Never encode quantity with geometric scale. Hosts keep exact totals and unit identities. See `docs/QUANTITY_SCALING.md`.

## Website examples

- Domain examples that model a physical or process space (a facility, site or floor) are a **full-viewport scene with a floating HUD**, like `/examples/datacenter`: one canvas fills the window below the site header, panels float inside the scene, an expanded mode covers the header and exits with Escape, and narrow layouts keep panels inside the viewport with internal scrolling. Compose the HUD in example code from `@opsorama/ui` components, the zones in `apps/site/src/app/hud.css` and the helpers in `apps/site/src/features/example-hud.tsx`; never add domain fields or a layout API to the generic packages. Extra panels start closed; metric cards open the details behind them. Keep the scene mounted when panels toggle, and keep panel clicks from picking 3D objects behind them.
- Domain examples mount one adapter and show no framework switcher; adapter parity is shown by `/examples/adapters`, the object pages and tests.
- Move mode (`createMoveMode`, `bindMoveMode`) is optional; it has its own example (`/examples/move-mode`) and is not added to domain examples.
- The home page (`/`) composes the domain examples' own node functions with `placeSceneNodes` in `apps/site/src/features/landing`; never copy example scene code into it.
- `/docs/objects` uses static gallery thumbnails and one live detail viewer, never an active renderer per card. Keep capability and availability labels honest.

## Quality

- Use `pnpm` and strict TypeScript.
- Add public APIs with documented types, lifecycle, a working example and tests. Test renderer mount, resize, update and dispose, subscription cleanup and adapter parity where relevant.
- Measure performance; never claim frame rates, bundle sizes or integration support without evidence.
- Run the checks that fit the change (see Commands). Documentation-only changes need a link and content check. End-to-end tests are slow; run the specs that cover your change.

## Public boundary

This repository contains only public material. `scripts/check-public-boundary.mjs` rejects references to non-public material: `--staged` runs from the versioned pre-commit hook (enable once per clone with `git config core.hooksPath .githooks`), `--hook` can run as a Claude Code `PreToolUse` hook, and `pnpm check:boundary` checks the whole tree. Fix a reported line instead of bypassing the check with `--no-verify`.

## Git

- Commit coherent, reviewable changes with concise English messages describing the result.
- Inspect the staged diff before committing; stage explicit paths and never include dependencies, caches, builds, test reports, screenshots, local environment files or logs.
- Changes to published packages add a changeset (`pnpm changeset`).
- Do not push, publish or rewrite history unless a maintainer asks.

## Repository layout

- `packages/core`, `packages/three`, `packages/objects`, `packages/ui`, `packages/react`, `packages/vue`: the published `@opsorama/*` packages (not on npm yet). Workspace code imports their `src/` through `exports`; published tarballs use `publishConfig.exports` (`dist/`).
- `apps/site`: the private website `@opsorama/site` (Next.js in `apps/site/src/`, website fixtures and adapter samples in `apps/site/examples/`, Playwright specs in `apps/site/e2e/`).
- `examples/`: standalone starters (`vanilla`, `vite-react`, `vite-vue`, `next`) outside the workspace; they never import repository sources.
- `tests/`: workspace-wide unit tests. `scripts/`: build, package, bundle and boundary tooling. `skills/`: the agent skill for people building with Opsorama.

## Commands

- Website and checks: `pnpm dev` (http://127.0.0.1:3100), `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` (slow), `pnpm build`, `pnpm check:boundary`.
- Packages: `pnpm build:packages` (builds `dist/` and `catalog.json`), `pnpm check:packages` (publint, clean-consumer type check with `bundler` and `node16`, Node imports), `pnpm check:bundles` (size budgets; `pnpm measure:bundles` only prints), `pnpm smoke:starters` (installs and builds every starter from the packed packages). Run them after `build:packages` when a change touches entry points, exports, dependencies or build configuration.
- Versions: `pnpm changeset`, `pnpm version-packages`.

# Opsorama: project vision

Recorded: **October 8, 2026**. The name **Opsorama** and local `@opsorama/*` namespace were selected on October 28, 2026. Opsorama combines operations + panorama and is pronounced “ops-oh-RAH-ma”. See the [brand guide](BRAND.md). npm scope ownership and publication remain unverified. The original warehouse prototype was retired on October 12, 2026.

## Goal

Build an open-source, framework-agnostic toolkit that lets developers assemble a complete animated operational “game board” and embed it in their own administration interface. The first official integrations will support **React and Vue**. Developers must be able to connect their own data, use their own HTML interface, add objects, and customize behavior without modifying the library's core.

The toolkit is designed to be built and used with AI coding agents. Its logic, architecture, APIs and documentation must be explicit enough that an agent reading only the repository can choose the right building blocks, compose a dashboard and verify it.

The spatial scene should improve awareness of status, relationships, workflows, and problems. It should serve e-commerce, logistics, HR, and other domains. The strategy-game inspiration applies to spatial navigation, object selection, progressive detail, and animated changes; the result should remain a credible professional tool.

**Product = shared core + framework adapters + building blocks + data and motion contracts + documentation and runnable examples.**

## Developer experience

1. Choose a documented recipe or start with an empty scene.
2. Install the adapter for the host framework and the relevant asset package.
3. Assemble the board from ground surfaces, zones, buildings, objects, paths, and markers.
4. Map domain entities to visual objects through a mapping function.
5. Add custom KPIs, inspectors, forms, and tables, or use optional prebuilt UI.
6. Configure selection, the camera, highlighting, and motion. Register custom models and behaviors when needed.
7. Verify the scene with mock data, then connect a real data source.

Target for the first public release: a developer with basic React or Vue knowledge can build a simple dashboard from a documented recipe in 30 minutes. This is a proposed target to validate through user testing, not a measured capability.

## Principles

- **Lego-style composition:** small components have clear purposes and combine naturally. A complete domain dashboard is a recipe, rather than a mandatory application.
- **Catalog first:** reusable object definitions form the foundation for dashboards, examples and domain scenes. Reuse existing geometry before expanding models; every object inherits a semantic scene palette, allows documented customization, supports a useful static appearance and declares its interaction capabilities. Follow the [object catalog plan](CONTRIBUTING_OBJECTS.md).
- **React and Vue feature parity:** both adapters use the same scene model, renderer, assets, events, and animations.
- **Framework-independent core:** React, Vue, Next.js, Zustand, and UI libraries are not dependencies of the domain core.
- **Separate data and geometry:** business records retain their identities; a mapping layer creates their visual representations.
- **Bounded models, explicit quantities:** countable objects declare finite count ranges or exact variants. Combine their visible count with a disclosed multiplier to symbolize larger totals without adding geometry. Source quantities and identities remain authoritative; exact-unit detail is optional. See the [bounded count design](QUANTITY_SCALING.md).
- **Motion communicates change:** paths, transfers, queues, and handoffs should have understandable meanings.
- **3D and HTML work together:** the scene shows space and relationships; precise text, forms, and tables remain in the DOM.
- **Respect the host application:** embedding does not require replacing its router, state library, authentication, or design system.
- **Readable by AI agents:** typed, declarative contracts, descriptive names, one obvious way per task, documented defaults and limits, actionable errors and complete runnable examples. Docs, decisions and code stay consistent so an agent never has to guess which is current.
- **Documentation evolves with the API:** a component is complete only when it has a definition, example, edge cases, and relevant verification.
- **Visual quality is functional:** calm materials, readable hierarchy, useful camera behavior, clear states, and working interactions matter.
- **One toolkit, many domains:** generic elements belong in shared layers; warehouse models, vehicles, and team-capacity assets belong in optional packages.

## First public MVP

| Area | Minimum outcome |
| --- | --- |
| Scene | Ground, groups, zones, objects, paths, lighting, orthographic camera |
| Interaction | Hover, selection, highlighting, object framing, return to overview |
| Quantity display | Model-specific count ranges/variants, disclosed multipliers and totals; exact units, where needed, paged by the host |
| Behavior | Follow a path, change state, interrupt and replace motion |
| Data | Initial snapshot, updates, entity removal, connection state |
| Integration | Standalone JavaScript example and React + Vue component adapters |
| Appearance | Themes, asset registry, custom objects, custom HTML overlays |
| Documentation | Guides, component catalog, API reference, recipes, live examples |
| Recipes | Warehouse and generic workflow board; verified transfer to another domain |
| Quality | Leak-free lifecycle, adapter parity tests, measured performance, fallback when WebGL is unavailable |

## Scope and boundaries

The initial milestones do not include a WMS, ERP, HR system, authentication service, generic backend, no-code editor, physics simulator, or marketplace. A complete board means a functional scene with behavior and an accompanying interface; the host application continues to own business rules and permissions.

Native React Three Fiber components are not a portable core. The retired warehouse prototype used this tool. Its unique forklift, loading dock and shipping container silhouettes are preserved as shared Three.js catalog definitions; remaining recipes use the shared renderer. Future warehouse recipes can compose these objects without restoring the retired simulation.

## Open-source direction

- Distribute separate npm packages, versioned together where they share a contract.
- Provide public examples, documentation, a changelog, contribution guidelines, and issue templates.
- Use English for all project communication, planning documents, public documentation, API descriptions, code comments, and UI copy.
- Adopted November 4, 2026: the [MIT License](../LICENSE), copyright 2026 Tomas Jirsa, covers the project's original source, procedural models, documentation and supplied SVG assets unless identified otherwise. No on-screen logo or project-link requirement is imposed. Third-party licenses, provenance and required notices still need review before publication; npm scope ownership remains unverified.
- Public identity confirmed November 4, 2026: author **Tomas Jirsa** (without diacritics), contact [contact@opsorama.dev](mailto:contact@opsorama.dev), project domain **opsorama.dev** and repository [tomulin1/opsorama](https://github.com/tomulin1/opsorama). These contact details do not imply npm publication or a deployed website.
- Example data and procedural models must have clear provenance and be distributable with the project.
- Publish runnable examples and customization instructions alongside screenshots.

## Success criteria

1. The same scene works in React, Vue, and plain JavaScript, with no hidden React runtime in the Vue integration.
2. Developers can embed the toolkit in an existing administration interface without rebuilding the application.
3. A mock source can be replaced with a custom API while preserving the scene and UI.
4. Custom models, motion, and inspectors do not require a library fork.
5. At least one building block is reused in two meaningfully different recipes.
6. Components have discoverable contracts, examples, and documented limitations.
7. Both overview and precise values are accessible without relying exclusively on animation or color.
8. Reference examples publish measured performance and verified mount/unmount behavior.
9. Large quantities remain readable through counted models with disclosed multipliers and exact totals; hosts that need unit detail can map units to nodes without losing totals or identity.

## Navigation

- [Implementation roadmap and next step](ROADMAP.md)
- [Architecture, data, and customization](ARCHITECTURE.md)
- Component design and composition examples
- [Reusable object inventory and implementation plan](CONTRIBUTING_OBJECTS.md)
- 28 application domains
- [Bounded object counts and symbolic quantities](QUANTITY_SCALING.md)

These documents guide the project's future direction. The root README describes the current implementation. Proposed APIs in the documentation are not automatically implemented.

# Contributing to Opsorama

Thank you for helping. Opsorama is a pre-release, open-source toolkit for 3D operational dashboards; contributions of code, objects, examples, documentation and bug reports are welcome. By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) and that you follow the [code of conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs:** open an issue with the bug template and a minimal reproduction.
- **New objects:** open an object request first, unless the object is small and clearly fits an existing kit. Read the [object contribution guide](docs/CONTRIBUTING_OBJECTS.md).
- **New domain examples:** open a domain example issue; the template asks for the user, the decision the dashboard supports, entities, states and a mock dataset.
- **API or architecture changes:** open a design proposal issue before writing code. The maintainers decide, and the adopted outcome is written into the public documentation.
- **Security problems:** never in a public issue; see [SECURITY.md](SECURITY.md).

[AGENTS.md](AGENTS.md) holds the working rules for every contributor, including AI coding agents: architecture boundaries, the object contract, examples, quality and Git rules. Agents should read it first; Claude Code loads it through `CLAUDE.md`.

## Setup

Requires Node.js 22+ and pnpm 11+.

```sh
pnpm install
git config core.hooksPath .githooks   # enables the public boundary pre-commit check
pnpm dev                              # website at http://127.0.0.1:3100
```

## Where things live

| Path | Content |
| --- | --- |
| `packages/core`, `three`, `objects`, `ui`, `react`, `vue` | The published `@opsorama/*` packages |
| `packages/objects/src/kits/` | One registry per kit; every catalog object belongs to exactly one kit |
| `apps/site` | Documentation website, object browser and domain examples (private) |
| `examples/` | Standalone starters that install the packages like an external project |
| `tests/` | Unit tests; Playwright specs are in `apps/site/e2e/` |
| `docs/` | Architecture, guides and domain notes |
| `skills/opsorama/` | Agent skill for people building with Opsorama |

## Making a change

1. Create a branch from `main`.
2. Keep the change focused; add or update tests and documentation with it. Public APIs need documented types, lifecycle, a working example and tests.
3. Run the checks that fit the change:

   | Change | Checks |
   | --- | --- |
   | Any code | `pnpm typecheck`, `pnpm lint`, `pnpm test` |
   | Package entry points, exports, kits, dependencies or build | `pnpm build:packages`, `pnpm check:packages`, `pnpm check:bundles`, `pnpm smoke:starters` |
   | Website pages or examples | `pnpm build`, and the Playwright specs that cover them: `pnpm --filter @opsorama/site exec playwright test <spec>` |
   | Documentation only | Links and content; `pnpm test` covers the README code examples |

4. If the change affects a published package, add a changeset with `pnpm changeset` and describe the change for users. All packages share one version.
5. Commit with a concise English message describing the result, and open a pull request. CI runs the checks above; end-to-end tests run on every push to the pull request.

## Standards

- Strict TypeScript, ESM only, no new runtime dependencies without discussion.
- English for code, comments, documentation and UI copy.
- Measure before claiming performance; do not state frame rates or bundle sizes without numbers from `pnpm check:bundles` or a documented measurement.
- The repository contains only public material; the pre-commit hook and `pnpm test` run `scripts/check-public-boundary.mjs`.

## Review

A maintainer reviews every pull request. Expect questions about lifecycle (mount, update, dispose), adapter parity (JavaScript, React, Vue) and documentation. Small, well-tested pull requests are reviewed fastest.

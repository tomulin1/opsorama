## What and why

<!-- What this pull request changes and the problem it solves. Link the issue: Closes #… -->

## Checklist

- [ ] Tests added or updated; `pnpm typecheck`, `pnpm lint` and `pnpm test` pass
- [ ] Public APIs documented (purpose, units, ranges, defaults, lifecycle, limits) with a working example
- [ ] Behavior is the same through JavaScript, React and Vue where it applies
- [ ] Catalog objects: descriptor passes `checkAssetDescriptor`, object is in exactly one kit and its browser category (see `docs/CONTRIBUTING_OBJECTS.md`)
- [ ] Package entry points, exports, kits or dependencies changed: `pnpm build:packages`, `pnpm check:packages`, `pnpm check:bundles` pass
- [ ] Changeset added (`pnpm changeset`) if a published package changed
- [ ] No performance or compatibility claims without measurements

## Verification

<!-- What you ran and what you checked by hand (browser, framework, screenshots). -->

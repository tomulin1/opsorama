# Changesets

Every pull request that changes a published package (`@opsorama/core`, `three`, `objects`, `ui`, `react`, `vue`) adds a changeset:

```sh
pnpm changeset
```

Choose the affected packages and the bump (`patch`, `minor`, `major`) and describe the change for users. All `@opsorama/*` packages share one version (the `fixed` group in `config.json`), so a bump in one package bumps them all. The website (`@opsorama/site`) is never versioned or published.

`pnpm version-packages` applies the pending changesets: it bumps versions and writes each package's `CHANGELOG.md`. Publishing is not set up yet.

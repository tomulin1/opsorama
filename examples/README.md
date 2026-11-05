# Starters

Complete, standalone projects that use the Opsorama packages the way your application would. Copy one folder, install, run. They are not part of the repository workspace and do not import repository sources.

| Starter | Stack | Adapter |
| --- | --- | --- |
| [`vanilla`](vanilla) | Vite, plain TypeScript | `@opsorama/three` directly |
| [`vite-react`](vite-react) | Vite, React 19 | `@opsorama/react` |
| [`vite-vue`](vite-vue) | Vite, Vue 3 single-file components | `@opsorama/vue` |
| [`next`](next) | Next.js App Router | `@opsorama/react` in a client component |

Every starter renders the same scene from `scene.ts`: a ground, two zones, a shelf, a pallet and three parcels, built only from the `work-items` and `furniture` kits of `@opsorama/objects`. A button moves order #1001 to the ready zone and selects it, the way a host updates the scene after its own data changed.

```sh
cd examples/vite-react
pnpm install   # or npm install / yarn
pnpm dev
```

## Status

The packages are not published on npm yet, so `pnpm install` in a copied starter fails until the first release. Inside this repository, `pnpm smoke:starters` (after `pnpm build:packages`) installs every starter in a temporary folder from the packed packages and runs its type check and production build. Add `--keep` to keep the folder and preview a build, for example with `pnpm exec vite preview`.

## Choosing kits

The renderer ships no models. Pass only the kits your scene uses, merged with `createAssetRegistry`:

```ts
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { furnitureKit } from '@opsorama/objects/furniture';

export const assets = createAssetRegistry(workItemsKit, furnitureKit);
```

Each object page in the documentation names the kit that contains the object. `catalogAssets` from `@opsorama/objects` contains every model and is convenient for prototypes, at a larger bundle size.

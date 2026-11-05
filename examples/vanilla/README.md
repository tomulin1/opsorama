# Opsorama starter: Plain TypeScript

Vite and plain TypeScript, mounting `@opsorama/three` directly without a framework.

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. `pnpm build` type-checks and builds for production.

## Files

- `src/scene.ts`: the scene definition, the asset registry from two kits (`work-items`, `furniture`) and a host update (`shipOrder`).
- `src/main.ts`: mounts the scene. `createSceneRenderer(container, store, { assets })` mounts the scene; `dispose()` tears down the listener, subscription, renderer and store in reverse order (also on Vite hot reload).

## Next steps

- Replace the nodes in `scene.ts` with nodes mapped from your own records; keep business data in your application and link nodes to it with `entityId`.
- Add kits from `@opsorama/objects/<kit>` for the objects you need, or your own factories, merged with `createAssetRegistry`.
- The documentation site lists every object with its kit, options and a usage snippet.

The packages are not published on npm yet; see [the starters overview](../README.md#status).

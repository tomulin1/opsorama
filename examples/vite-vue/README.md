# Opsorama starter: Vue

Vite and Vue 3 single-file components with the native `@opsorama/vue` adapter (no React runtime).

```sh
pnpm install
pnpm dev
```

Open http://localhost:5173. `pnpm build` type-checks and builds for production.

## Files

- `src/scene.ts`: the scene definition, the asset registry from two kits (`work-items`, `furniture`) and a host update (`shipOrder`).
- `src/App.vue`: mounts the scene. `DashboardProvider` shares the store; `SceneCanvas` creates and disposes the renderer. `App.vue` owns the store and disposes it before unmount. `Controls.vue` reads the selection with `useScene()`.

## Next steps

- Replace the nodes in `scene.ts` with nodes mapped from your own records; keep business data in your application and link nodes to it with `entityId`.
- Add kits from `@opsorama/objects/<kit>` for the objects you need, or your own factories, merged with `createAssetRegistry`.
- The documentation site lists every object with its kit, options and a usage snippet.

The packages are not published on npm yet; see [the starters overview](../README.md#status).

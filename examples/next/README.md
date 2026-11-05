# Opsorama starter: Next.js

Next.js App Router with `@opsorama/react` inside a client component.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. `pnpm build` type-checks and builds for production.

## Files

- `app/scene.ts`: the scene definition, the asset registry from two kits (`work-items`, `furniture`) and a host update (`shipOrder`).
- `app/Dashboard.tsx`: mounts the scene. `page.tsx` stays a server component; `Dashboard.tsx` is marked `'use client'` because the renderer needs the browser. `SceneCanvas` mounts after hydration and disposes on unmount.

## Next steps

- Replace the nodes in `scene.ts` with nodes mapped from your own records; keep business data in your application and link nodes to it with `entityId`.
- Add kits from `@opsorama/objects/<kit>` for the objects you need, or your own factories, merged with `createAssetRegistry`.
- The documentation site lists every object with its kit, options and a usage snippet.

The packages are not published on npm yet; see [the starters overview](../README.md#status).

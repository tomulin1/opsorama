# Experimental static instancing

> **Historical record.** This experiment was superseded on October 26, 2026 by automatic instancing ([ADR 0051](decisions/0051-repeated-mesh-instancing.md)). The `staticInstancing` option, the **Static instancing** checkboxes and `instancing=static` no longer exist. Use the renderer option `instancing` (default `true`) and `/examples/performance?instancing=off` for comparisons; current results are in the [performance playground guide](PERFORMANCE_PLAYGROUND.md#instancing). The measurements below describe the October 22 build only.

Implemented and measured October 22, 2026. The first opt-in slice approximately doubled completed-frame throughput in the synthetic Mega fixture while reducing main-pass draw calls by 60.3%. It batches compatible opaque parts of built-in pallets, parcels, shelves, totes and pine trees. Default rendering remains available for direct comparison.

## Measured comparison

Both paths used the same production build (`q4PyASrpr7sYYW15YX0DX`), workload `mixed-catalog-v1`, 2,048 model instances plus one ground, overview camera at zoom 1, motion on, and shadows/labels off. Each recording warmed for at least three seconds and measured at least fifteen actual elapsed seconds. Runs alternated regular → instanced → regular → instanced. No CPU profiler or second WebGL scene ran during the comparison.

Hardware and browser: AMD Ryzen 5 9600X, NVIDIA GeForce GTX 1660 via ANGLE / Direct3D 11, Windows, in-app Chromium 155.0.0.0. CSS viewport 1,280 × 720; canvas 1,280 × 656; DPR 1.25; drawing buffer 1,600 × 820. Hardware acceleration and reduced-motion=false were checked. Power mode, clocks and unrelated machine activity were not controlled; these are local observations rather than a device-independent FPS guarantee.

| Run | Mode | Completed frames | Elapsed seconds | FPS | Main-pass draws | Geometry resources |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Regular | 68 | 15.8861 | 4.28 | 56,833 | 56,833 |
| 2 | Static instancing | 127 | 15.0065 | 8.46 | 22,584 | 22,584 |
| 3 | Regular | 63 | 16.0304 | 3.93 | 56,833 | 56,833 |
| 4 | Static instancing | 129 | 15.9314 | 8.10 | 22,584 | 22,584 |

Combining frames and elapsed time within each mode gives **4.10 FPS regular** and **8.27 FPS instanced**, a **2.02×** throughput improvement. The two pairs both improve, although individual rates vary. Counts remain **2,049 scene entries** in every recording. This is completed-render-call throughput; it is not GPU execution timing or a frame-time percentile. Resource counts are not byte-accurate VRAM measurements.

The draw reduction matches the earlier compatibility estimate: **56,833 → 22,584**, approximately **60.3% fewer draws**. No count multiplier, model scale, detail reduction, lower resolution or reduced worker/fan animation was used. Unit verification expands instance counts when comparing triangle totals and confirms identical geometry totals for the checked fixture.

The remaining cost includes ordinary animated models, transparent parts, retained source/proxy graphs and matrix updates. The broader 94–97% draw-reduction estimate from the analysis would require a larger implementation, including animated-part handling and spatial batching; it is not a result of this slice.

## Try it

- Regular: [Mega without instancing](http://127.0.0.1:3100/examples/performance?load=mega).
- Instanced: [Mega with static instancing](http://127.0.0.1:3100/examples/performance?load=mega&instancing=static).
- Native integrations: `/examples/adapters` has a **Static instancing** checkbox for React, Vue and plain JavaScript.

The performance page's checkbox recreates the renderer, resets the camera and cancels an active recording. It keeps host records and scene settings. Exported JSON records `configuration.staticInstancing`; previous results keep their own mode labels. Hold camera, viewport and other settings equal when comparing modes.

## Public option and runnable examples

`RendererOptions.staticInstancing?: boolean` defaults to `false`. It is a mount-time renderer option. React and Vue expose the same boolean on `SceneCanvas` and recreate the renderer on a prop change. The core's scene/data/settings contracts do not depend on this optimization.

The existing complete minimal examples accept this option and are compiled in the workspace:

```tsx
// examples/react-minimal/index.tsx
<ReactExample staticInstancing />
```

```ts
// examples/vue-minimal/index.ts
const unmount = mountVueExample(container, true);
// On host teardown: unmount();
```

```ts
// examples/vanilla-minimal/index.ts
const unmount = mountVanillaExample(container, true);
// On host teardown: unmount();
```

At the shared API level, JavaScript passes `{ staticInstancing: true }` to `createSceneRenderer`; React uses `<SceneCanvas staticInstancing />`; Vue uses `<SceneCanvas :static-instancing="true" />`. Mount these inside their normal sized container/provider setup. See the runnable adapter examples above rather than treating these option fragments as standalone applications.

## Eligibility, interaction and ownership

- Only built-in, root-level `pallet`, `parcel`, `shelf`, `tote` and `tree-pine` entries qualify. Custom registry overrides, parented/attached nodes, routes, controllers, transfers, artwork, local animators and negative/singular world transforms use ordinary rendering.
- Only compatible opaque regular meshes with supported untextured basic/standard materials are batched. Transparent meshes, existing `InstancedMesh` objects, morph/interleaved geometry and custom render hooks stay ordinary. A hash finds geometry candidates; exact byte equality guards against collisions. Materials, shadow flags and render order must agree.
- Original objects and meshes retain node IDs, anchors, count parts, geometry/material ownership and framing bounds. Batched source meshes use reserved picking layer **31**; the camera/shadow pass sees their replacement batches on layer 0. The raycaster also includes layer 31. Selection markers and descendant scene entries with different node IDs are never absorbed into a parent's batch.
- Each batch owns cloned geometry/materials and its own instance buffer. Rebuilding or disposing batches restores source layers and releases only batch resources. Removing a source can therefore never dispose another source's geometry through a shared batch.
- Root transform changes update instance matrices and batch bounds before the draw. Changes that replace eligible source roots rebuild batches. Hover and selection preserve root references and avoid a rebuild. Retained proxy graphs still consume CPU memory and matrix-update work; this implementation is not a general memory-elimination layer.
- Whole-scene batches can submit offscreen instances whenever any part of the batch is visible. Frequent geometry/state replacements rebuild all eligible batches. This experiment targets static layouts; spatial partitioning, animated-part instancing and incremental batch updates are separate follow-ups.

The implementation and adopted boundary are in [ADR 0045](decisions/0045-experimental-static-instancing.md) and [static-instancing.ts](../packages/renderer-three/src/static-instancing.ts). The website documents the option in SceneCanvas and Renderer API references.

## Verification and evidence

Typecheck, lint, all **497 unit tests** and the production build passed. [The new tests](../tests/static-instancing.test.ts) cover draw/triangle/root counts, source picking identity, bounds/anchors, state materials, transparency, rings, attached-child exclusion, world-transform updates, unchanged-matrix work, source replacement and independent/idempotent disposal.

Manual checks on `/examples/adapters` enabled instancing in each native React, Vue and JavaScript example, moved order #1001 and observed selection 1001 with exactly one canvas. A click on the actual instanced #1002 geometry selected 1002 in the JavaScript example; unmount/remount changed the canvas count from one to zero and back to one. No Playwright spec or e2e suite ran.

Raw accepted exports are retained locally, outside Git, in `artifacts/instancing-comparison/final-regular-1.json`, `final-instanced-1.json`, `final-regular-2.json` and `final-instanced-2.json`. The local `summarize.cjs` checks modes, settings, dimensions and counts before producing `final-summary.json`. Earlier files without the `final-` prefix are preliminary checks and are not the table's source. `environment.json` records GPU/browser metadata, build ID and the SHA-256 of the measured instancing module. Profiling/measurement artifacts and generated screenshots remain excluded from commits.

**Next performance step:** compare a smaller logical/picking proxy representation or spatially partitioned batches against this baseline before extending batching to animated parts. Preserve counts, identities, anchors, material/state behavior and cleanup in any subsequent slice.

# Performance playground

Implemented October 22, 2026 at `/examples/performance`. This is a synthetic catalog workload for repeatable comparisons, not a certified FPS target or a domain simulation. It uses one native React adapter over the ordinary shared Three.js renderer.

## Workload

| Preset | Catalog model instances | Total scene nodes | Route followers |
| --- | ---: | ---: | ---: |
| Baseline | 256 | 257 | 32 |
| Large | 1,024 | 1,025 | 128 |
| Mega (default) | 2,048 | 2,049 | 256 |

Every eight instances repeat the same catalog mix: an overview equipment cabinet with eight mounted units, a pallet with three boxes, a shelf with four boxes, a walking worker, a cooling unit, a tote with three items, three parcels and a pine tree. A counted composition is one model instance; it can contain many meshes and counted parts. These counts are synthetic visual inputs and do not claim source-unit identities or a business total.

All presets use the same miniature model scale (0.32), cell spacing (1.05 scene metres), deterministic IDs, status distribution and route phases. The centred grid grows with the load. Worker routes are closed loops; cabinet activity LEDs, workers and cooling fans use their existing local animators. Scene motion and reduced-motion policy retain authority over animation. Labels and shadows start off, motion starts on, and zoom starts at 1. No automatic quality adjustment is applied. The fixture version is `mixed-catalog-v1`; change it when workload inputs change.

Source: [fixture and throughput calculation](../apps/site/src/features/performance/model.ts), [host scene and controls](../apps/site/src/features/performance/PerformanceDashboard.tsx), [diagnostic sampler](../apps/site/src/features/performance/PerformanceReadout.tsx).

## Instancing

The renderer instances repeated identical meshes by default. The **Instancing** checkbox turns this off for a comparison; open `/examples/performance?load=mega&instancing=off` to start with it disabled. All model counts, geometry detail, animation settings and fixture version remain equal, and the shadow policy and static part merging apply in both modes. Changing the option recreates the renderer, resets the camera and cancels a recording. Exported JSON includes `configuration.instancing`; do not compare results without recording this flag. `/examples/adapters` runs the same option through native React, Vue and JavaScript.

Measured October 26, 2026 on the development server (`pnpm dev`) in Playwright headless Chromium with ANGLE D3D11 on an NVIDIA GeForce GTX 1660, 1600 × 900 viewport, DPR 1, Mega load with default settings (motion on, shadows and labels off), 4 s sample after 12 s warm-up: instancing off 16.3 FPS, 11,265 draws and 2,817 program switches per frame, 63.7 ms JavaScript per frame; instancing on 35.8 FPS, 1,836 draws, 21 program switches, 28.2 ms. Draws here count every WebGL draw call, not the main-pass `drawCalls` readout. Compare production builds with the recorder below before treating these numbers as a device result.

The October 22 opt-in experiment that preceded this is kept as a [historical measurement](STATIC_INSTANCING.md).

## Use

1. For comparisons, run `pnpm build`, then `pnpm start`, and open [the local playground](http://127.0.0.1:3100/examples/performance). Development mode works for exploration but adds development overhead.
2. Select a load and press **Apply load**. Mega builds real procedural geometry and can stall the main thread while loading or disposing. Use Baseline if the computer struggles, or open [Baseline directly](http://127.0.0.1:3100/examples/performance?load=baseline) to avoid creating the Mega load first. The `load` query accepts `baseline`, `large` or `mega`; invalid/missing values use Mega. Applying a load updates this query without remounting the renderer. Scene counts are fixed; a larger preset does not silently reduce model detail.
3. Set motion, shadows and all-label visibility. Use **Reset overview**, keep the same zoom/viewport and wait for model creation to finish. The renderer's fixed camera and ordinary controls are shared with other examples.
4. Press **Record 15 seconds**. The sampler warms for at least three seconds, then measures at least 15 elapsed seconds. Keep the camera still. Pointer navigation, zoom/settings/load changes, viewport resizing, unmounting or hiding the tab cancel an active recording. Diagnostics poll once per second, without an additional animation loop or per-frame React updates.
5. Download the JSON result. Record the Git revision/build mode, GPU, browser hardware-acceleration status and power mode alongside it. Compare several runs with equal configuration on the same computer. The last result remains the previous configuration's result until another recording completes.

The canvas fills the viewport below the site header. The floating HUD scrolls internally on narrow layouts; hide it for an unobstructed view. Hiding panels keeps the sampler and scene mounted. Expanded mode covers the header and exits with Escape. Unmount/mount releases and recreates the ordinary renderer while preserving host settings and the last result.

## What is measured

- **Rendered FPS:** completed shared-renderer calls divided by actual elapsed time. Timer delays are included. The recording reports a time-weighted mean and the minimum/maximum interval rates. Those extrema are not individual frame times, stutter percentiles or GPU execution timings.
- **Main-pass draws:** the latest `getDiagnostics().drawCalls`. The current installed Three.js resets render statistics after its shadow pass, so this counter excludes preceding shadow work. Do not compare it as total frame draw calls when changing shadows.
- **Mounted scene nodes:** renderer entries, including the ground; not mesh count.
- **Geometry/texture resources:** renderer counters, not byte-accurate memory or VRAM usage.
- **Environment:** user agent, device DPR, CSS canvas size, actual drawing-buffer dimensions and reduced-motion preference, captured in the exported JSON. The renderer currently caps device DPR at 2. GPU model, camera pose and build mode are not inferred; record the build/hardware manually and reset the view for comparable runs.

This fixture exercises per-object resources, picking, label layout and continuous rendering. Its instancing switch compares one implemented optimization from the rendering analysis against the same build without it. Performance work should compare identical fixture versions rather than claiming a gain by reducing the workload.

## Verification and next step

[Unit tests](../tests/performance-playground.test.ts) verify deterministic preset counts/IDs, model-specific count limits, route closure/duration, finite geometry from all eight actual factories, disposal, store settings and time-weighted throughput including delayed/zero-frame intervals. Typecheck, lint, all 494 unit tests and the production build passed. Local HTTP checks returned 200 and confirmed the example link.

Manual browser checks confirmed the Mega scene, the direct Baseline link, load changes and URL updates, a completed recording and its JSON data, cancellation on motion changes, unmount/remount with the previous result preserved, and Escape after expansion. The checked recording contained 15 intervals spanning 15,352.5 ms; its rate is specific to the control environment and is not a hardware budget. The Mega overview reported 2,049 mounted nodes and 56,833 main-pass draws. Hardware FPS remains unverified on a documented reference device. No Playwright spec or e2e suite was run.

The next performance step is to capture a production baseline, then compare targeted batching/detail and pointer-picking changes against the same fixture. This page adds benchmark infrastructure; it does not complete a profiling milestone or alter the catalog descriptor sequence. End-to-end suites remain subject to the repository's separate approval rule.

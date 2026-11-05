# Performance measurements

Measured November 5, 2026 at commit `fbc72e6` on one reference machine. These numbers describe this machine and these workloads only; they are not guarantees. Re-measure on your own hardware with the steps below before relying on them.

## Reference machine

| Item | Value |
| --- | --- |
| Computer | Desktop, ASRock X870 Pro RS WiFi |
| CPU | AMD Ryzen 5 9600X, 6 cores / 12 threads |
| GPU | NVIDIA GeForce GTX 1660 (driver 32.0.16.1088); WebGL through ANGLE Direct3D 11 (hardware) |
| Memory | 64 GB (61.6 GB usable) |
| Display | 1920 × 1080 at 60 Hz |
| OS and power | Windows 11 Pro 10.0.26200, power plan "Power saver" |
| Browser | Chromium 152 (the browser of the Claude desktop app), viewport 1600 × 900 CSS px, device pixel ratio 1 |
| Build | Production website (`pnpm build`, `pnpm start`) |

The browser's frame loop was not limited to the 60 Hz display refresh, so frame rates above 60 appear. A normal browser tab usually caps rendering at the display refresh rate.

## Frame rate at several object counts

`/examples/performance`, default settings (motion on, shadows and labels off, instancing on), overview camera, canvas 1600 × 836 px. Each value is the time-weighted mean of one 15-second recording after the playground's 3-second warm-up; min and max are one-second interval rates, not frame-time percentiles.

| Load | Model instances | Mean FPS | Interval min–max | Main-pass draws | Instanced batches (instances) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 256 | 179.7 | 179.4–179.8 | 256 | 31 (1,120) |
| Large | 1,024 | 85.2 | 75.8–95.4 | 928 | 31 (4,480) |
| Mega | 2,048 | 37.8; repeat 36.5 | 32.5–40.0; 31.6–39.7 | 1,824 | 31 (8,960) |

Every eight instances repeat a mix of an equipment cabinet with eight units, a pallet, a shelf, a walking worker, a cooling unit, a tote, three parcels and a tree (see the [performance playground](PERFORMANCE_PLAYGROUND.md)). Scenes with many animated workers and counted contents cost more than the same number of static objects.

## Load time of a minimal application

The [`vite-react` starter](../examples/vite-react) (React 19, `@opsorama/react`, two kits), production build from packed packages, served by `vite preview` on localhost with a warm cache. Measured six times in a same-origin iframe from the start of navigation until the canvas exists and the scene labels are mounted ("scene ready").

| Metric | Result |
| --- | --- |
| JavaScript bundle (three.js, React and Opsorama together) | 856 KiB minified, 242 KiB gzip |
| `DOMContentLoaded` | 26–44 ms |
| Scene ready | 63–125 ms (median about 100 ms) |

Network transfer is not included (local server, cached assets). Toolkit code alone is measured by `pnpm check:bundles`: 59.6 KiB minified for the renderer, 87–116 KiB for the renderer with one kit.

## Repeated mount and unmount

The performance playground's **Unmount scene / Mount scene** control, Baseline load (257 nodes), 20 cycles:

| After | Canvases | Geometry resources | Texture resources | JS heap |
| --- | ---: | ---: | ---: | ---: |
| 10 cycles | 1 | 256 | 0 | 54.8 MB |
| 20 cycles | 1 | 256 | 0 | 57.1 MB |

Resource counts return to the same values after every remount, and no "too many active WebGL contexts" warning appeared (Chromium warns above 16 live contexts), so renderers and their contexts are released. The heap values come from `performance.memory` without a forced garbage collection; the small difference is within ordinary collection timing. GPU memory in bytes is not measured.

## How to reproduce

1. `pnpm build`, then `pnpm start`, and open http://127.0.0.1:3100/examples/performance?load=baseline (also `large` and `mega`).
2. Keep the camera still and press **Record 15 seconds**; download the JSON result. Record the GPU, browser, hardware acceleration, viewport and power plan with it.
3. For load time, build a starter (`pnpm build:packages`, then `pnpm smoke:starters vite-react --keep`) and run `pnpm exec vite preview` in the kept folder.
4. Compare several runs with equal settings on the same computer.

## Not measured yet

Laptops and integrated GPUs, Firefox and Safari, mobile devices, cold network loads, GPU memory, shadows and labels on, and long-running sessions with live data updates.

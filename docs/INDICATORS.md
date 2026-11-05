# Measured indicators

Implemented October 10, 2026. Website reference: `/docs/measurements`; native example: `/examples/indicators`. [ADR 0008](decisions/0008-measured-indicators.md) records the adopted distinction between readings and counts.

## Shared input

```ts
import type { Measurement } from '@opsorama/core';
const load: Measurement = {
  value: 72.5, min: 0, max: 100, unit: '%', target: 80,
  bands: [
    { from: 0, to: 70, state: 'normal' },
    { from: 70, to: 90, state: 'warning' },
    { from: 90, to: 100, state: 'critical' },
  ],
};
// React: <Asset id="load" asset="ring-gauge" measurement={load} />
// Vue:   <Asset id="load" asset="ring-gauge" :measurement="load" />
// JS:    store.upsert({ id: 'load', kind: 'asset', asset: 'ring-gauge', measurement: load });
```

These snippets illustrate the implemented API; the runnable workspace mounts below are independently typechecked. Core exports `Measurement`, `MeasurementBand`, `ResolvedMeasurement`, `resolveMeasurement` and `formatMeasurement`. Range defaults to 0–100, unit to empty. Accept decimal/negative readings and any finite increasing range with a finite span. Target must be finite; units have at most forty characters. Up to twelve bands must be sorted, non-overlapping and inside the range. At a shared boundary, the later band's state wins; gaps are allowed. Invalid store updates preserve the previous immutable snapshot. Readings and nested bands are cloned and frozen.

Null is visibly unknown; zero is a known empty fill/minimum needle. Out-of-range values retain their original data, bounded fill/needle and an amber marker. Percentage readouts round to the nearest whole percent; other units retain their precision. Formatting does not alter source values, fractions, thresholds or out-of-range detection. Targets also retain their source value while their geometric marker is bounded. Measurements cannot be combined with `count`, `multiplier` or source-backed `QuantityTarget`. A UPS module count and charge reading remain separate host facts.

## Models and variants

| Registry key | Variants | Geometry and meaning |
| --- | --- | --- |
| `capacity-gauge` | `vertical-segmented`, `horizontal-segmented`, `vertical-continuous`, `horizontal-continuous` | Vertical fills bottom-to-top; horizontal fills left-to-right. Ten fixed segments retain partial last-segment fill. Existing vertical count geometry remains compatible; count 0–10 works on segmented variants only. |
| `ring-gauge` | `full`, `semicircle` | Full fills clockwise from the top through 360 degrees; semicircle fills left-to-right through 180 degrees. |
| `dial-gauge` | `semicircle`, `full` | Needle sweeps 180 or 270 degrees. Eleven ticks are decoration; exact values/ranges remain in HTML. |
| `battery-indicator` | `vertical-continuous`, `horizontal-continuous`, `vertical-segmented`, `horizontal-segmented` | Five fixed cells or continuous fill, bottom-to-top/left-to-right. Cells are not installed modules. API state busy adds a static bolt, critical a fault cross; inactive changes fill color. |

Renderer-three exports `assetMeasurementDefinitions`, `CapacityGaugeVariant`, `RingGaugeVariant`, `DialGaugeVariant` and `BatteryIndicatorVariant`. Each definition declares its default reading and variant list. Unsupported variants and unsupported built-in measurement/count combinations throw.

All measured variants are static, front +z, Y-up and grounded at a base-center pivot. Measured definitions expose local `anchor-front` and `anchor-value` empty objects. Bounds are geometry-derived, with typical dimensions below 2.6 m on each principal gauge axis; these are simplified display instruments, not engineering devices. The legacy count-only capacity column retains its original geometry/anchor limits.

The semicircle dial insets its scale above the flat cut. Needle, tick and target endpoints stay within the face at minimum/maximum readings, with marks placed close to the surface to avoid an apparent offset in the isometric view. The 180-degree sweep and source value mapping are preserved.

Color customizes fill or the dial needle. Bands color a secondary scale strip/arc and determine fill color when a reading falls in a band; host state does not override measured capacity, ring or dial color. Only battery-indicator retains native charging/fault/inactive indication. Frame, track, ticks and symbols use fixed tones. Thresholds only visualize host-supplied data. Scene theme changes the environment, not an inherited material palette; C1 palette/descriptor/transformed-anchor work remains incomplete.

## Controls and lifecycle

Catalog pages use a value slider with the current reading beside it, following the last valid min/max range. Percentage sliders use whole-number steps when the range endpoints are integers; fractional ranges and other units allow decimal input. Range, unit, target and band editors remain numeric/text controls. Unknown readings disable the slider. Changing a range does not overwrite an out-of-range source reading: its original value/snippet remains, while the slider thumb is bounded until the user moves it. The native percentage indicator example also uses whole-number slider steps. A capacity-only selector switches measurement/count modes without combining meanings. Invalid drafts retain the last valid preview/snippet; reset restores defaults. Only supported controls appear. All measured models declare no local animation, and their static pose remains usable with motion disabled or reduced motion.

Without a custom node label, the renderer projects the formatted value/unit or Unknown text above the measured geometry, with whole-number percentages. Node labels override it; scene label settings still apply. The host owns accessible HTML readings, source records and commands. Values/variants rebuild per-instance geometries/materials; node IDs, selection and source identities survive. Factories own no textures or timers. Dispose the renderer before the host store and release host subscriptions on unmount.

Native examples: [React](../apps/site/examples/indicator-react.tsx), [Vue](../apps/site/examples/indicator-vue.ts) and [JavaScript](../apps/site/examples/indicator-javascript.ts), hosted by [IndicatorExample](../apps/site/src/features/docs/IndicatorExample.tsx). Each mounts the same factory/input contract, updates values/variants/unknown readings and disposes its renderer/store. Vue uses its own native Asset prop; it contains no React runtime.

Verification: [core reading tests](../tests/measurement.test.ts), [factory/lifecycle tests](../tests/gauges.test.ts) and [browser checks](../apps/site/e2e/indicators.spec.ts). Check finite grounded geometry, exact/unknown/out-of-range semantics, bands/targets, decimal fills, immutable validation, instance ownership, disposal, static appearance, adapter parity and desktop/mobile previews. No hardware FPS or memory budget is claimed.

Verified October 10: strict TypeScript, ESLint, all 149 unit tests, eleven relevant production-browser checks and the production build pass. Desktop/mobile screenshots were reviewed, with canvas-pixel checks for all measured variants. Existing count and Datacenter / IT workflows also pass. These checks are not a hardware benchmark.

Factory geometry inspection on October 10 used value 100, target 100, twelve equal normal-state bands and the default host state. The table records maxima across each model's variants for that fixed sample, excluding scene grid/selection geometry, materials and renderer overhead; it is not a GPU-memory or FPS measurement. Busy/fault/overflow marks can add small meshes in other inputs.

| Model | Meshes / owned geometries | Triangles | Geometry buffer bytes |
| --- | --- | --- | --- |
| Capacity | 35 | 420 | 29,400 |
| Ring | 17 | 4,996 | 125,592 |
| Dial | 30 | 3,356 | 101,096 |
| Battery | 22 | 264 | 18,480 |

## Existing-object audit and next step

All thirteen existing countable models retain finite count definitions and catalog configurators; capacity's measured mode hides its count control. Status beacon and map pin still have API state/motion semantics without numerical readings. Network-switch counts connected plugs; UPS counts installed modules; rack-server offers 1U/2U variants; cooling offers decorative fan motion. These do not accept measurement as telemetry. Structured per-port/module contents remain separate future work.

Next: C1's common palette/descriptor contract. Level vessels, status panels, beacon/pin variants and structured per-item contents remain proposals, rather than part of this implemented batch.

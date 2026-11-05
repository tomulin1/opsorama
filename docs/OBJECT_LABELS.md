# Object surface labels

Implemented October 9, 2026 as a focused M2/M4 catalog customization slice. The common palette, descriptor and general anchor API remain C1 work. See [ADR 0007](decisions/0007-object-surface-labels.md).

`AssetNode.surfaceLabel` attaches static text or self-contained SVG to a model. The existing `label` and `labelMode` retain their projected HTML meaning and quantity disclosure. Surface artwork follows position, rotation and scale, remains visible with motion disabled, and selects the owning node. Scene `settings.labels` controls HTML labels only. Artwork introduces no records, units, commands or animation.

## Supported placements

| Asset | Surface |
| --- | --- |
| `parcel` | Front sticker on each visible package; replaces decorative barcode |
| `pallet` | Same front sticker on every visible box, under one owning node |
| `bag` | Front sticker |
| `tote` | Front wall |
| `storefront` | Sign above the awning; replaces blank decorative sign text |
| `parcel-locker` | Header above compartments |
| `returns-drop-box` | Front plate; replaces decorative return arrow |
| `delivery-van` | Right cargo side above the stripe |
| `truck` | Right cargo side above the accent stripe |
| `whiteboard` | Header strip above the three columns |
| `order-ticket` | Colored header strip, for an order number |
| `put-wall` | Header sign above the cubbies |
| `label-printer` | Printed label on the feed tongue |
| `parcel-scale` | Display screen for a host-supplied weight |
| `poly-mailer` | Top sticker on each visible mailer; replaces the blank sticker |
| `carrier-pickup-point` | Sign panel on the post |
| `hold-cage` | Door sign |
| `click-collect-counter` | Front panel facing customers |
| `checkout-counter` | Lane sign on the pole |
| `store-shelving` | Header board |
| `customer-house` | House number plate beside the door |
| `lab-tray` | Front plaque |

The same parcel sticker repeats over a bounded composition, sharing one texture within that instance and retaining its node/count/multiplier. Other built-in models reject `surfaceLabel` rather than inventing a floating or inappropriate placement. Catalog controls appear only for declared supported portable models; warehouse prototypes retain their current embedded signage.

## Implemented contract

Exported from `@opsorama/core`:

```ts
type SurfaceLabel = (
  | { kind: 'text'; text: string; color?: string; layout?: 'single-line' | 'multiline' }
  | { kind: 'svg'; svg: string; alt: string }
) & { background?: string };
```

Default text and SVG alternatives retain the 1–80 character single-line contract. Text can explicitly set layout: 'multiline' for up to six display lines, 80 characters per line and 480 total. Explicit newlines are preserved; text is fitted as a block and aligned left in multiline mode. The TV catalog uses a multiline textarea; ordinary sticker controls remain single-line. Text is fitted to the declared surface. The October 10 readability update enlarges the model-specific sticker/sign areas and uses more of each surface for text and SVG. Long text still shrinks to fit; short names or outlined logos work best at overview distance. Default ink is `#243650`; background is transparent when omitted. Explicit colors use `#RRGGBB`. Catalog controls default to a light background. Labels are decorative textures, not accessible DOM text: provide `label` or equivalent host HTML for keyboard selection and record information. SVG `alt` supplies a decoding fallback and is available to the host; it does not automatically become an HTML label.

SVG source is at most 20,000 characters, with at most 512 elements and a finite positive `viewBox` bounded to 10,000 and a 100:1 aspect ratio. Supported static elements are svg, g, defs, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, title, desc, linearGradient, radialGradient, stop and clipPath. Presentation attributes and local `url(#id)` references are supported. Inline CSS/style, scripts/events, foreignObject, images, external resources, href/use, nested svg, animation, doctype and entities are rejected before decoding. Decoded SVG bitmaps and final textures are bounded by the declared surface resolution: 1024 pixels on the longest side by default, 2048 for the pipeline TV. Validation always runs before decoding; the optional validateLabelSvg resolution parameter accepts only 1024 or 2048. Text uses browser system fonts; outline text for consistent logo typography. SVG is fitted without stretching. Failed browser decoding retains the alternative text.

Core validates the serializable content limits and clones/freezes label inputs. The browser renderer additionally validates XML using `validateLabelSvg`. Invalid catalog drafts show an error and retain the last valid artwork/snippet. Remove `surfaceLabel` to restore the original model appearance. Selection and source quantity totals survive updates.

## Examples and lifecycle

Try labels directly on [Storefront](http://127.0.0.1:3100/docs/objects/storefront) or [Parcel](http://127.0.0.1:3100/docs/objects/parcel) catalog pages. Their React, Vue and JavaScript snippets reflect the current valid configuration. The [Asset guide](http://127.0.0.1:3100/docs/components/asset) includes a runnable native three-adapter sign example using the existing mount helpers in `apps/site/examples/counted-react.tsx`, `apps/site/examples/counted-vue.ts` and `apps/site/examples/counted-javascript.ts`. The snippets are integration examples; the live examples and source are checked by TypeScript and browser tests.

```tsx
// React: inside DashboardProvider and SceneCanvas
<Asset id="branch" asset="storefront" selectable label="North branch"
  surfaceLabel={{ kind: 'text', text: 'NORTH', color: '#243650', background: '#fffaf2' }} />
```

```vue
<!-- Vue: inside DashboardProvider and SceneCanvas -->
<Asset id="branch" asset="storefront" :selectable="true" label="North branch"
  :surfaceLabel="{ kind: 'text', text: 'NORTH', color: '#243650', background: '#fffaf2' }" />
```

```ts
// JavaScript: a host-owned scene store
store.upsert({ id: 'branch', kind: 'asset', asset: 'storefront', selectable: true,
  label: 'North branch', surfaceLabel: { kind: 'text', text: 'NORTH' } });
```

Each labeled instance owns one canvas texture (1024 pixels on its longest side by default, or 2048 for the TV, with aspect-fitted dimensions), sticker planes and materials. Updates rebuild the owned model under the same node ID. `disposeObject` releases label textures alongside geometry/materials, cancels pending image handlers and revokes temporary Blob URLs on update, removal and renderer disposal. A completed or failed decode also revokes its URL; a late callback cannot update a disposed texture. No per-label frame loop is created. Custom factories can use `applySurfaceLabel(object, node, surface)` once per fresh model with an explicit finite `LabelSurface`, and must use `disposeObject` for this helper's cleanup. Registry overrides own their declared support.

Unit checks cover validation, defensive copying, repeated artwork, placement and resource ownership. Browser checks cover upload/paste validation, catalog snippets, reset, mobile layout, native prop updates, static rendering and bounded texture counts across update/remount. These resource checks are not a hardware performance benchmark.

## October 11 TV readability update

The original pipeline machine was removed without replacement on October 28, 2026. Multiline artwork remains supported by monitors, information boards and other declared label surfaces. Large display surfaces use a bounded 2048-pixel raster; ordinary artwork surfaces retain 1024 resolution. Surface textures use linear magnification, mipmapped linear minification and requested anisotropy 8 (clamped by Three.js to device capability). Shared scene rendering uses device pixel ratio up to 2.

A 2048 × 1024 RGBA8 raster occupies 8 MiB before mipmaps/driver costs; this is a bounded pixel calculation, not a measured GPU/FPS claim. Removing or replacing artwork releases the texture through the existing lifecycle. Exact source values remain in accessible HTML; a distant or steeply angled 3D screen cannot make arbitrarily dense text readable.

# Panels

Implemented: **October 15, 2026** as an optional M2/M4 UI slice. The earlier visual proposal led to basic presentation primitives; domain-specific dashboards remain the host's responsibility. Packages are private local workspace packages under the `@opsorama/*` namespace; they are not published on npm.

## Choose by purpose

Panels are grouped by what a reader does with them, not by domain. See [ADR 0065](decisions/0065-hud-panel-system.md).

| Family | Purpose | Typical zone |
| --- | --- | --- |
| Short panels | Answer one question at a glance | Under the top edge |
| Data panels | Browse, compare and read detail | At the bottom or side |

| Need | Use |
| --- | --- |
| One number at a glance | MetricCard |
| Several numbers in little room | MetricCard at size s |
| A labeled reading against a range, inside a panel | CapacityCard, or ValueMeter inside your own panel |
| Records to choose from | ResourceList |
| Detail of the selected record | EntityInspector |
| Ordered stages | ProcessTracker |
| Events over time | ActivityFeed |
| Anything else | DataPanel with your own content |

## Available entry points

| Entry point | Responsibility |
| --- | --- |
| @opsorama/ui | Framework-free typed inputs and pure presentation builders; no DOM, scene or graphics imports |
| @opsorama/ui/dom | Optional browser mount/update/dispose layer for plain JavaScript |
| @opsorama/ui/styles.css | Optional scoped reference appearance; no global reset or required design system |
| @opsorama/react/ui | Native React components and ReactNode content |
| @opsorama/vue/ui | Native Vue components, VNode content and named slots |

The root adapters' existing EntityInspector remains the selection-aware scene helper. EntityInspector from /ui is an independent presentation panel. No scene provider, renderer, router, source, timer or application store is required. See [ADR 0021](decisions/0021-generic-data-panels.md).

## Public blocks

| Block | Supplied inputs beyond common panel props |
| --- | --- |
| DataPanel | Arbitrary children, header/icon/actions/footer content and state placeholders |
| MetricCard | required size, number/string/null value, optional unit, formatter, comparison, unknown label, tone, delta, visual and action |
| EntityInspector | Optional fields with stable IDs, labels and values; arbitrary extra children |
| ProcessTracker | Ordered steps with stable IDs, arbitrary status labels/tones, current flags, descriptions, metadata and optional onSelect(id) |
| ResourceList | Items with stable IDs, labels/descriptions/values/statuses, optional selectedId and onSelect(id) |
| CapacityCard | ValueMeter inputs in a panel, plus arbitrary children |
| ActivityFeed | Events with stable IDs, content, supplied time label/dateTime and metadata; supplied ordering is preserved |
| StatusBadge | Arbitrary label, optional decorative icon and semantic tone |
| FieldList | Fields with stable IDs, content labels/values and an unknown label |
| ValueMeter | Label, finite value/null, min (default 0), max/null, optional unit/formatter/tone/unknown label |
| ZoomControl | Standalone compact bar: controlled value/onChange, range, step, orientation, appearance, buttons/slider, reset, caption, icons, labels and host content |

Common panel inputs: id, className, style, label (accessible name; defaults to title), title, description, density (comfortable/compact), children, slots, state and freshness. Content state defaults to ready; loading/empty/error use overridable messages. Freshness is independently supplied as a state and visible label. A ready panel may show stale values; there is no automatic freshness clock or empty detection.

Authoritative types and behavior live in [the shared implementation](../packages/ui/src/index.ts). The [website reference](../apps/site/src/features/docs/panel-content.ts) documents exact inputs, imports, defaults and snippets at /docs/data-panels. No future proposal is presented there as an export.

## Host customization

- React accepts ReactNode content and a slots object: header, icon, actions, footer, loading, empty and error. Vue accepts the same contract through its typed options prop; native named slots override those slots and the default slot overrides children. Use callbacks in options for selection. Neither integration hides a React runtime in Vue.
- Plain JavaScript content is a string, number or DOM Node. Text is escaped without parsing HTML. Supplied Nodes are moved into their slot, not cloned; use separate Nodes for separate slots/mounts. Hosts own any listeners they attach to custom content.
- Individual field, item, step and event content can be native framework content. Status labels are arbitrary; tone is neutral/info/success/warning/critical. Icon slots are decorative; labeled interactive content belongs in actions or the body.
- Import the optional stylesheet for the rounded, softly shadowed reference preset. Override --panel-surface, --panel-text, --panel-muted, --panel-border, --panel-radius, --panel-padding, --panel-gap, --panel-font, --panel-font-size, --panel-value-size, --panel-accent, --panel-selection, --panel-success, --panel-warning, --panel-critical and --panel-shadow through ordinary inherited CSS or per-panel style. Themes follow the host's color-scheme; variables override individual roles.
- Host content can reuse a tone: an element with class dp-tone and data-tone reads the preset color as --dp-tone.
- Omit the stylesheet for host-owned styling. Shared dp-* classes/data attributes remain available. No styles are injected, no global layout or reset is installed, and CSS does not modify scene materials.
- Hosts choose grid/flow/sidebar/overlay layout, responsive breakpoints and commands. The preset only reflows a process to vertical on narrow screens and wraps long content. Core and renderer remain unchanged.

## Short panels

Size is a purpose, not a scale. Every MetricCard needs a size; leaving it out throws in plain JavaScript and fails typecheck elsewhere. MetricCard has no density input.

| Size | Question | Height | Visible content |
| --- | --- | --- | --- |
| s | Is it fine? | 52 px | Title, value, one graphic |
| m | How much, and how does it stand? | 84 px | Adds one context, delta before comparison |

| Visual | Input | Behavior |
| --- | --- | --- |
| symbol (default) | Icon slot | Tinted block in the tone color |
| trend | points (finite, oldest first), required label | Sparkline. Replaces the icon at s and the context at m. Fewer than two points draw nothing |
| capacity | max, optional min (default 0) | Ring around the icon from the numeric metric value, with meter semantics. A non-numeric value or null max leaves it empty |

Context a size does not show stays in the accessible tree. Heights are exact without footer or freshness, the title stays on one line, comparison on two, and description is ignored, so a host can position other panels from the size. Below 130 px an s metric drops its graphic; narrow m cards shrink theirs through container queries. Hosts supply tone, delta, trend points and capacity; favorable meaning is theirs to decide. Warning and critical tones also color the value.

Pass action to make a sized card one button that opens the detail behind it: label is the accessible name, onActivate is the host handler and pressed reports that the detail is open. It runs only while state is ready, as a stretched button beside the card content.

```tsx
<MetricCard size="m" title="Peak inlet" value={34.8} unit="°C" tone="critical"
  delta={{ label: '4.8 °C over limit', direction: 'up', tone: 'critical' }}
  action={{ label: 'Inspect the rack with the peak inlet', onActivate: inspectPeakRack, pressed: peakInspected }}
  slots={{ icon: <Thermometer /> }} />
```

## Compose a HUD

Zones are host layout, not a library feature, as [ADR 0022](decisions/0022-datacenter-viewport-panels.md) requires. Short panels sit under the top edge, data panels at the bottom or side, and the scene fills the box behind them.

- Start with extra panels closed and open them from a button or a metric card, so the scene is visible first.
- Position the side panel from the metric height. Sized cards have exact heights, so a CSS variable set per size is enough.
- Set pointer-events: none on zone wrappers and auto on the panels, so empty zone space still reaches the scene and panel clicks do not pick objects behind them.
- Keep the scene mount stable when panels toggle or the size changes.
- Choose the size per breakpoint in host code. The domain examples use size s on phones.
- The domain examples share their zones in `apps/site/src/app/hud.css` and their metric row, size control and zoom bar in `apps/site/src/features/example-hud.tsx`. Both are example code, not package API.
- On narrow layouts, keep panels inside the viewport with internal scrolling.

[The panel page](../apps/site/src/features/docs/PanelDemos.tsx) runs this composition without WebGL, and [the datacenter viewport](../apps/site/src/features/datacenter/DatacenterViewport.tsx) runs it over a scene.

## Zoom control

ZoomControl is a standalone compact control rather than a panel: by default the datacenter viewport bar, or `plain` inside a host toolbar. It shares this package, its presentation tree and its `--panel-*` variables. Options, theming, scene binding and a live configurator are on the [Zoom control page](../apps/site/src/features/docs/zoom-control-content.ts) at /docs/zoom-control. See [ADR 0038](decisions/0038-zoom-control.md).

## Semantics and boundaries

Null means unknown; zero is an actual value. Metric strings are host-formatted readings. Meters require finite numeric inputs, reject maximum below minimum, and retain exact out-of-range text while clamping only the drawn fill and numeric ARIA value. Their accessible value text preserves the exact reading. Unknown or zero-width ranges have no numeric meter role and show no fill. No bar implies geometric quantity, unit identity or automatically derived source total.

Lists require nonempty unique IDs and do not mutate supplied collections. Selection is controlled; a missing selected ID selects nothing. Disabled interactive items emit nothing. Without onSelect, rows and process steps are static content. Multiple supplied current process steps are allowed; later steps never synthesize completion of earlier ones. Steps do not execute work, infer percentages or implement dependency scheduling. Events do not start a clock or reorder themselves.

Hosts supply record fields, KPI calculations, comparisons, favorable/unfavorable meaning, source quantities, units, status mappings, filtering/paging/scope disclosure, timestamps/time zones, loading/errors, freshness, permissions, source subscriptions and confirmed actions. The basic primitives contain no domain rules, warehouse/order records, vendor connector, physics or simulation. Advanced tabs, charting, automatic scene bindings, modal sheets and layout editors remain outside this slice; hosts compose their own controls.

When using symbolic objects, show source totals and units separately from visible count × multiplier; follow [bounded counts](QUANTITY_SCALING.md).

## Lifecycle and accessibility

The shared builders produce a typed presentation tree with opaque native content. React and Vue translate it to native elements and own their normal reconciliation/unmount. The JS mount owns exactly one root and its listeners, preserves host siblings, reconciles keyed children and restores retained control focus when a native DOM move blurs it. Its dispose is idempotent; updates after disposal throw. The mount installs no window/document listeners, observers, intervals, animation loops or subscriptions. Build/validate the next tree before passing it to update, so invalid IDs/numeric inputs leave the current view intact.

Primitives use native sections/headings, description/ordered/unordered lists, buttons, meters and time elements. Supply a title or accessible label for standalone panels, meaningful labels for custom actions and explicit empty/error/stale text. Decorative icons are hidden from assistive technology. There is no forced focus or automatic camera action; a host modal owns its focus policy. The preset preserves browser focus outlines and pairs statuses with text. These are static components without built-in animation; source updates are independent of scene motion.

## Runnable samples and verification

The implemented datacenter recipe now provides a concrete host composition at `/examples/datacenter`: shared panels float over one native scene, with host-owned layout, panel visibility, fixture calculations, room focus and selection. See [the viewport implementation](../apps/site/src/features/datacenter/DatacenterViewport.tsx) and [recipe](domains/datacenter.md#facility-overview-and-room-focus). The library primitives do not gain datacenter fields or mandatory overlay positioning. The completed panel worktree implementation was integrated into the main checkout on October 16; its standalone documentation and examples are available here as well.

Neutral samples at /examples/panels and /docs/data-panels exercise all blocks, custom native content, controlled values/selection/content states, row reordering and mount/unmount. They are component API samples, not a prescribed dashboard or a domain recipe:

- [React](../apps/site/examples/panels-react.tsx)
- [Vue](../apps/site/examples/panels-vue.ts)
- [JavaScript](../apps/site/examples/panels-javascript.ts)
- [Shared neutral fixture](../apps/site/examples/panels-fixture.ts)
- [Documentation samples and generated snippets](../apps/site/examples/panel-docs-fixture.ts), checked by [the unit tests](../tests/panels.test.ts)

[Unit checks](../tests/panels.test.ts) and [zoom checks](../tests/zoom-control.test.ts) cover zero/unknown/overflow semantics, invalid inputs and IDs, disabled/static interaction, supplied process states, independent freshness, extreme finite ranges, safe text and native server rendering without a browser or scene provider. [Browser checks](../apps/site/e2e/panels.spec.ts) cover native adapter updates/content/selection, numeric and content states, keyboard interaction, JS keyed focus/reordering, teardown/remount and narrow layout.

Implementation verification: strict TypeScript, ESLint, all 268 unit tests, the production build and both targeted panel browser tests passed. Browser verification used an isolated production preview on loopback port 3101 because an existing server already owned 3100; normal repository dev/preview commands remain on 3100. These checks do not establish a hardware performance or bundle budget.

This completes the requested basic panel family, not a domain dashboard, all M2/M4 work, or C1. The next UI work should follow an actual host need. The toolkit-wide next foundation task remains [C1](ROADMAP.md#immediate-next-step).

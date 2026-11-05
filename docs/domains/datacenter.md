# Datacenter operations and shared IT assets

Updated November 2, 2026. Preview: `/examples/datacenter`, listed as Domain 12 in the domain examples. It mounts one native React scene with a floating HUD and no adapter switcher ([ADR 0041](../decisions/0041-datacenter-domain-example.md)). The shared kit now composes a researched regional facility: four IT halls, 128 rack records, ten support rooms and an outdoor plant yard. The original eight rack records, selected devices and three incidents remain within Hall 01. [Research, primary sources and the dimensioned room schedule](datacenter-facility.md) distinguish source evidence from this original concept. Live monitoring, operational commands, topology and vendor connectors remain proposed.

## Definitions and customization

All ten models below are built into `basicAssets` in `@opsorama/renderer-three` and use the typed `AssetNode` contract from `@opsorama/core`. React and native Vue consume the same factories. Exported variants are `RackServerVariant` (`1u`/`2u`), `EquipmentCabinetVariant` (`detailed`/`overview`) and `AisleContainmentVariant` (`portal`/`roof`); unsupported variants throw. Color/material/count/variant changes rebuild owned geometry; transform-only changes preserve it. Theme and scene palette changes rebuild all ten models.

| Asset | Size (width × height × depth, metres) | Customization | Anchors |
| --- | --- | --- | --- |
| `rack-server` | 0.483 × 0.04445 or 0.0889 × about 0.69 | Front panel color; `1u` or default `2u` | `mount` at base plane; `front`, `rear` |
| `network-switch` | 0.483 × 0.04445 × about 0.312 | Front panel color; integer count 0–24, default 12 | `mount`, `port-0…port-23`, `uplink` |
| `cooling-unit` | 0.6 × 2 × about 1.06 | Housing color; optional fan motion | `intake` (+z), `exhaust` (−z) |
| `ups-unit` | 0.7 × 1.65 × about 0.82 | Housing/control panel color; integer count 0–6, default 4 | `module-0…module-5`, `power-in`, `power-out` |
| `equipment-cabinet` | 0.86 × about 2.16 × 0.93 | Frame color; 0–12 generic mounted units | `front`, `rear`, `top` |
| `generator-set` | 6 × about 3.4 × 2.5 | Enclosure color; no model health mark | `power-out`, `service`, `exhaust` |
| `air-cooled-chiller` | 8 × about 2.43 × 2.8 | Housing color; six fixed decorative fans | `supply`, `return`, `service` |
| `electrical-switchgear` | 3.6 × 2.35 × about 1.12 | Housing color; three fixed door bays | `power-in`, `power-out`, `service` |
| `battery-bank` | 1.2 × 2.02 × about 1 | Housing color; six fixed decorative panels | `dc-out`, `service` |
| `aisle-containment` | Portal 1.98 × 2.67 × 0.16; roof 2.4 × 0.1 × 1.98 | Frame color; static portal/roof variants | Portal `entry`, `roof`; module `start`, `end` |

Sizes describe original simplified silhouettes, not engineering specifications. All use Y-up, a base-center pivot and front +z; containment roof length runs along x. Named anchors are local empty `Object3D` children; `SceneRenderer.getAnchor(id, name)` returns their world pose. Bounds derive from geometry; new facility assets also expose local `userData.facilityBounds`. Selection targets the entire asset, including decorative parts; `selectable` enables picking/highlighting. Exact readings and host commands belong in HTML. New plant/battery/switchgear models are static, have no count controls, and do not infer capacity, runtime, fuel, chemistry, airflow, circuit state or redundancy. The containment portal is a static closed-door silhouette; it has no access-control, door-motion or fire-system behavior.

Materials inherit the light/midnight semantic palette, scene overrides and partial `AssetNode.materials`. `surface` supplies device panels/modules, `structure` frames/handles, `trim` chassis/rails/fan blades, `screen` vents/displays, `accent` plugs/module marks, `text` mounting screws, and `normal` supplies decorative link/activity light color. Legacy `color` overrides the documented front panel or housing; cabinet color overrides its frame. It does not recolor the entire model. Chassis screws, drive LEDs, port LEDs and plug boots are decorative. Host health stays in labels, overhead incident markers and the HTML HUD; small status lights were removed by [ADR 0056](../decisions/0056-remove-small-status-lights.md). Full C1 descriptors and per-role catalog controls remain incomplete.

## Counts, motion and relationships

Each generic mounted unit and standalone rack server has twelve decorative LEDs: four front drive pairs and two rear link/activity pairs. One light in each pair stays steady; the activity partner uses a deterministic staggered burst pattern with occasional quiet cycles. The default facility has 13,056 decorative LEDs across IT and carrier cabinets and the two standalone servers, including 6,528 activity channels. These are fixed model details, not additional count controls, drive records or telemetry. The paired drive layout is inspired by [Dell's documented activity/status indicators](https://www.dell.com/support/manuals/en-us/poweredge-r550/per550_ism_pub/drive-indicator-codes?guid=guid-8130f10e-2989-4a9d-bb30-8091095b5ebb&lang=en-us), reviewed October 15, 2026; this example does not emulate vendor fault codes.

One instanced bank per server/cabinet batches all LED boxes into a single mesh, with unlit per-instance colors that remain legible at overview scale. The model owns its geometry, material, matrices and color buffer; disposal releases the instance buffers as well as geometry/materials. Decorative LEDs do not intercept picking. Scene/local motion-off, pause, speed and reduced motion still apply. State never dims decorative channels; health belongs to separate host indicators.

The switch fills twelve bottom ports then twelve top ports. The UPS fills installed modules from the bottom. Both declare ranges in `assetCountDefinitions`, rejecting fractional/out-of-range values. A disclosed multiplier may symbolize larger totals without increasing geometry. Counts mean connected ports or installed modules, never traffic, charge, kWh or runtime. Counted parts share their owning node identity without invented device or battery serials.

Server drive bays and cooling fans are fixed decoration without count controls. Cooling rotation follows the renderer's shared clock: motion-off, pause, `localMotion: false` and reduced motion prevent updates; scene speed changes the clock. Cooling with localMotion: false registers no animator. Static fans retain their visible shape. Rack servers and equipment cabinets also offer staggered decorative activity-LED blinking, using the same visual clock and motion/pause/speed/reduced-motion gates. `localMotion: false` leaves a steady static appearance, independent of State. Activity LEDs have no traffic, I/O or health meaning; small health LEDs have been removed. The example control is named Equipment motion. Switches and UPS units have no local animation. Capacity, health policies and links stay in host data; node state remains host alert metadata and does not change equipment geometry.

The 106 × 90 m site contains a 68 × 48 m building. Four 20 × 18 m IT halls total 1,440 m² of room footprints. Each has four facing rows of eight racks, 1.8 m cold aisles, a 1.2 m central warm aisle, containment portals/roof modules and reserved growth floor. The support belts separate electrical/UPS/carrier spaces A/B, batteries, a NOC and staging; the yard contains three generic generators and three chillers. A closed ring road, a perimeter fence with an entrance gate, a service apron, an entrance path and staff parking surround the building on its axis ([ADR 0073](../decisions/0073-datacenter-site-and-room-focus.md)). [The schedule](datacenter-facility.md#chosen-dimensions-and-room-schedule) records all positions and their assumptions. These are original design choices, not measured operator geography or certified engineering clearances.

The original eight rack records retain their IDs, readings, counts and incidents in Hall 01. Rack A01 retains eight generic counted units plus two identified servers and a switch above them. Additional rack readings are deterministic fictional records; counted internals share rack identity without invented drive/server serials. Eight carrier cabinets are separate decorative equipment fixtures, outside the 128 IT-rack record total. Readings are independent of visible hardware; scale never encodes quantities or load.

## Facility overview and room focus

October 16 UI increment: the scene now fills the available browser window below the responsive site header, with an optional expanded view and Escape to return. All information boxes live inside that viewport. The React example host uses the implemented [shared panel family](../DATA_PANELS.md): four MetricCards, a ResourceList for incidents, the UI EntityInspector with FieldList/ValueMeter readings, StatusBadges, and DataPanels for navigation, records, controls and facility information. These are ordinary replaceable HTML overlays; geometry and scene definitions remain framework-independent.

Use the bottom toolbar to open **Racks**, **Controls**, **Info** or **Alerts**. Records remain paginated eight at a time; choosing a rack/equipment item opens its inspector and closes the floating left panel. Incident and inspector tabs share the right panel. On narrow screens, the floating information panels occupy the same in-viewport area one at a time and scroll internally. The eye control hides/restores information panels while preserving the canvas, selected equipment, room, readings and controls. Pointer interaction belongs to each HTML widget, so clicking a metric does not pick the scene behind it.

The shared DataPanel above the toolbar provides **Zoom out**, **Zoom in** and **Reset zoom**; the mouse wheel over the scene zooms too. It stays visible when information panels are hidden. Zoom uses the existing SceneStore range 0.65–5 and defaults to 1.05. Focusing a room or resetting the facility view restores the default multiplier; resetting zoom alone preserves the current room and selection. Camera controls are disabled while the scene is unavailable.

The zoom panel also shows live **FPS**, calculated from completed scene render calls over elapsed monotonic time and sampled once per second. Sampling is local to the readout; it adds no animation loop or per-frame React updates. It resets on unmount and document visibility changes, showing a dash until a fresh sample is available. Motion-off still renders frames. The reading is browser scene throughput, not GPU execution time or a hardware performance guarantee. The shared renderer exposes a cumulative `getDiagnostics().renderedFrames` counter, which stops advancing when rendering stops or the renderer is disposed.

The outer demonstration application is React/Next.js; its HUD uses `@opsorama/react/ui` around one native React scene. Adapter parity is covered by `/examples/adapters`, the object pages and tests, not by this domain example. Native Vue/JavaScript panel implementations remain available through `@opsorama/vue/ui` and `@opsorama/ui/dom`, with separate neutral runnable samples at `/examples/panels`.

Every room stays open in every view. `setDatacenterRoom(store, 'overview')` uses the cabinet `overview` variant everywhere. It keeps the same count slots, exterior bounds, anchors and paired LEDs as the compatible `detailed` default, with fewer structural meshes. `setDatacenterRoom(store, roomId)` uses detailed cabinets in that room only; it accepts the fourteen room IDs and `plant-yard`, which details none, and unknown IDs fail atomically. This is detail management, not record removal or an adaptive source-count multiplier.

A pick in the scene selects and opens the inspector without changing the focused room, as in the other domain examples ([ADR 0073](../decisions/0073-datacenter-site-and-room-focus.md)). The room selector frames a room; the incident queue, rack table and equipment buttons reach the relevant room before framing equipment. **Reset view** returns to the overview and clears the selection. The table pages eight records at a time: all 128 in overview/support views, or the selected hall's 32. Room/scenario/count/motion choices survive scene remounts. Explicit controls support keyboard and touch; pointer drag still pans the camera. The initial overview disables shadow rendering; this is a fixture choice, not a performance guarantee.

## Incident snapshots and inspection

The default mock snapshot shows a [scene marker](../decisions/0075-scene-markers.md) on each affected rack's `top` anchor: a pin in the incident's tone with an icon for the kind of problem (thermometer, network or plug). The critical pin pulses while Motion is on, never under reduced motion. Hover, keyboard focus or selection opens a card with severity, title and reading; clicking/tapping still opens the rack inspector. The pin stays 32 px wide while its card is visible, so it does not displace nearby markers. Accessible button names carry the full card text, and the incident queue provides the same information on touch devices.

| Rack | Alert | Evidence | Severity |
| --- | --- | --- | --- |
| A02 | High inlet temperature | 34.8 °C, above the fixture's 30 °C policy | Critical |
| A04 | Uplink packet loss | 2.4% loss, above the fixture's 1% policy; secondary link available | Warning |
| B03 | Host PSU redundancy lost | PSU 2 failed, PSU 1 online; no UPS outage inferred | Warning |

These are illustrative host policies, not equipment-wide safety thresholds. The incident queue and rack table provide an HTML alternative to the scene. Clicking a rack, incident or overhead marker opens the same rack reading and investigation context; independent servers/switches/cooling/UPS nodes retain their own inspector and model link. Suggested investigation text does not execute commands.

`setDatacenterScenario(store, 'recovered')` removes the overhead markers, resets rack health and shows 24.2 °C on A02. The recovered snapshot also declares 0.02% uplink loss and both host PSUs online. Returning to `'incident'` restores the same incident IDs. Counts, equipment IDs and selected equipment survive the change; removing a selected marker clears selection. Motion-off does not hide alerts or health indicators. Scene remount preserves the host-selected snapshot and controls. Counts remain connected plugs or installed modules and do not alter mock telemetry.

The facing-row layout is informed by [Dell's hot/cold aisle guidance](https://i.dell.com/sites/csdocuments/Business_solutions_brochures_Documents/en/assess-power-and-cooling-reqmts.pdf). Inlet sensing and power readings are realistic monitoring categories described in [Dell server health monitoring](https://www.dell.com/support/kbdoc/en-us/000394350/poweredge-how-to-monitor-server-health-from-idrac10); the distinction between failed supply and lost redundancy follows [Dell power-supply events](https://www.dell.com/support/manuals/en-hk/dell-opnmang-srvr-admin-v7.4/mrg-v1/power-supply-events?guid=guid-103c1013-c32c-4044-9878-9900feac8648&lang=en-us). Reviewed October 14, 2026. These references do not establish vendor support or a telemetry connector.

## Runnable examples and lifecycle

- [Shared records, scenario and room updates](../../examples/datacenter-data.ts).
- [Dimensioned facility composition](../../examples/datacenter-facility.ts).
- [Host controls, selection and the React scene mount](../../src/features/datacenter/DatacenterDashboard.tsx).
- [Host viewport and shared panel composition](../../src/features/datacenter/DatacenterViewport.tsx).

Host controls update counts, motion, rooms and mock scenarios through SceneStore. Selection retains fixture entity IDs while geometry changes. Record buttons select/frame equipment and link to isolated model previews; no external writes occur. Leaving the page disposes the renderer before its store, and the host removes its store subscription. Each factory owns geometry/materials; `disposeObject` also releases LED instance buffers and animators. IT/plant models have no textures or independent frame loops; reused reserved-floor signs and the NOC display own static artwork textures under the surface-label lifecycle.

Catalog snippets illustrate integration and are not independently compiled projects. The example files above are typechecked workspace code. [Unit checks](../../tests/datacenter-objects.test.ts) cover geometry, counts, anchors, animation/static state, ownership, palette overrides and recovery without identity/count/selection loss. [Browser checks](../../tests/e2e/datacenter.spec.ts) cover catalog controls, nonblank desktop/mobile canvases, the single React scene without an adapter switcher, marker/incident inspection, recovery/remount and reduced motion. No hardware FPS, memory budget, vendor compatibility or complete C1 compliance is claimed.

Measured visible asset geometry, excluding ground/zones, label artwork, renderer rings, material/texture memory and driver overhead:

| View | Mesh objects | Triangles including instances | Geometry/instance buffer bytes |
| --- | --- | --- | --- |
| Facility overview | 6,403 | 309,534 | 10,694,572 |
| Hall 01 detail | 8,713 | 337,254 | 12,634,972 |
| Plant yard focus | 6,403 | 309,534 | 10,694,572 |

Mesh objects are counted before renderer merging and instancing. These unit measurements are not draw-call, GPU-memory or hardware FPS benchmarks. Browser checks use software WebGL and include native room selection, source totals, pagination, alerts, resize, remount and isolated previews for all new assets. [Facility unit verification](../../tests/datacenter-facility.test.ts) checks bounds, anchors, materials, static behavior, ownership, identity conservation with every room open, and the site plan. [ADR 0020](../decisions/0020-datacenter-facility.md) records this increment; [ADR 0019](../decisions/0019-datacenter-operations-fixture.md) remains the original incident-fixture decision.

[HUD browser verification](../../tests/e2e/datacenter-hud.spec.ts) checks full-window bounds, shared panel usage, desktop/mobile containment, non-interfering widget clicks, expansion/Escape and panel visibility without an extra canvas. Existing native-adapter checks exercise records, controls, recovery, motion and teardown through this host composition. Larger viewport dimensions and CSS compositing have not been hardware-profiled; the geometry table above is unchanged by this UI increment.

## Next work

Complete C1's descriptor/lifecycle verification before expanding other kits. A live operational datacenter recipe still needs a scoped host source contract, authoritative capacity/health, snapshot/stream recovery, real topology and confirmed host commands. The [ServiceNow integration profile](../INTEGRATION_CANDIDATES.md#servicenow) remains research, not an implemented connector.

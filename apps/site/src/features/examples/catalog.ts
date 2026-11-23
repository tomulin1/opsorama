import type { Metadata } from 'next';
import { pageMetadata } from '@/features/seo/site';

/**
 * One card in the /examples gallery. The same record supplies the example page's title, description, canonical URL,
 * social preview image and sitemap entry, so the gallery and the search metadata cannot drift apart.
 */
export interface Example {
  /** Card heading; the page title is `<title> · Opsorama`. */
  title: string;
  /** Card text and meta description. */
  description: string;
  /** Site-relative URL of the example page, for example `/examples/datacenter`. */
  href: string;
  /** File name without extension under `public/example-previews/` (768 × 480 WebP), captured from the linked page. */
  preview: string;
  /** Accessible name of the card link. */
  action: string;
}

/** Size of every image in `public/example-previews/`. */
export const EXAMPLE_PREVIEW_SIZE = { width: 768, height: 480 } as const;

/** Full-viewport domain scenes with a floating HUD. */
export const domainExamples: readonly Example[] = [
  { title: 'Online shop & warehouse', description: 'Follow online orders from release through picking, sortation, packing and dispatch beside a shop with checkouts and click & collect. Inspect a short pick, a late inbound truck and orders at risk of the carrier cut-off.', href: '/examples/ecommerce', preview: 'ecommerce', action: 'Open e-commerce example' },
  { title: 'Regional distribution centre', description: 'A large distribution centre with 16 dock doors, a truck yard, seven reserve aisles, a chilled chamber, a hazardous goods cage, each picking, robot sortation and packing. Inspect a load at risk of its departure, a rack hit by a forklift and a warm chilled chamber.', href: '/examples/warehouse', preview: 'warehouse', action: 'Open distribution centre example' },
  { title: 'Open-plan office', description: 'See who is at a desk, in a meeting, in a focus pod or remote, and which ticket and project each person is working on. Inspect a blocked release, the incident bridge and the room bookings.', href: '/examples/office', preview: 'office', action: 'Open office example' },
  { title: 'Restaurant operations', description: 'Follow tables from seating to bill, kitchen tickets to the pass and takeout bags to pickup. Inspect a late grill ticket and a warm walk-in cooler.', href: '/examples/restaurant', preview: 'restaurant', action: 'Open restaurant example' },
  { title: 'Datacenter operations', description: 'Explore a four-hall facility with 128 racks, support rooms and outdoor plant. Follow an inlet, uplink or PSU alert to its rack and compare incident and recovered snapshots.', href: '/examples/datacenter', preview: 'datacenter', action: 'Open datacenter example' },
  { title: 'Aquatic centre', description: 'Watch lane bookings and occupancy, lifeguard cover and water quality around a 25 m pool and a teaching pool. Inspect a lane alert, an empty lifeguard chair and low chlorine.', href: '/examples/aquatics', preview: 'aquatics', action: 'Open aquatic centre example' },
  { title: 'Farm', description: 'Check pens, troughs and tagged animals, fields and today’s chores on a mixed farm with cows, horses, sheep, pigs and hens. Inspect an empty water tank, a heat-stressed cow and a missing ewe.', href: '/examples/farm', preview: 'farm', action: 'Open farm example' },
];
/** Focused toolkit demos and the object catalog. */
export const toolkitExamples: readonly Example[] = [
  { title: 'Performance playground', description: 'Stress one shared-renderer scene with up to 2,048 catalog model instances. Compare motion, shadows and labels, inspect live counters and export a timed FPS recording.', href: '/examples/performance', preview: 'performance', action: 'Open performance playground' },
  { title: 'Generic data panels', description: 'Optional presentation primitives for values, details, processes and lists. Supply your own data, content and layout through native React, Vue or JavaScript.', href: '/examples/panels', preview: 'panels', action: 'Open panel samples' },
  { title: 'Logistics objects', description: 'Forklift, loading dock and shipping container preserved as shared static models. Mount, update and dispose through native React, Vue and JavaScript.', href: '/examples/logistics', preview: 'logistics', action: 'Open logistics objects' },
  { title: 'Site, energy & automation', description: 'Mobile robot, robot arm, machine tool, EV chargers, solar array, wind turbine, tank, pump and site equipment through native React, Vue and JavaScript.', href: '/examples/site-energy', preview: 'site-energy', action: 'Open site and energy objects' },
  { title: 'Warehouse objects', description: 'Pallet racks, reach truck, carton flow racks, stretch wrapper, safety barriers, IBC tanks, drums and bulk bags through native React, Vue and JavaScript.', href: '/examples/warehouse-objects', preview: 'warehouse-objects', action: 'Open warehouse objects' },
  { title: 'Domain kits', description: 'Aircraft and baggage carts, tower and gantry cranes, valve, tractor and silo, hospital beds, kitchen stations, a stage and exhibition booths through native React, Vue and JavaScript.', href: '/examples/domain-kits', preview: 'domain-kits', action: 'Open domain kit objects' },
  { title: 'Street & site surfaces', description: 'Road tiles, sized sidewalks, floors, terrain and a parking lot composed on one ground through native React, Vue and JavaScript.', href: '/examples/surfaces', preview: 'surfaces', action: 'Open surfaces example' },
  { title: 'Building containers', description: 'Peek inside a workshop and office, load contents on demand and inspect independent objects through native React, Vue and JavaScript.', href: '/examples/buildings', preview: 'buildings', action: 'Open building example' },
  { title: 'Selection styles', description: 'Mark the selected and hovered object with floor brackets or a colored glow, from a parcel to a silo, on moving and instanced objects and in alert states.', href: '/examples/selection', preview: 'selection', action: 'Open selection styles' },
  { title: 'Cameras', description: 'Orthographic and perspective projection, yaw, pitch and field of view, and timed camera transitions to objects and back to the overview, through native React, Vue and JavaScript.', href: '/examples/cameras', preview: 'cameras', action: 'Open camera example' },
  { title: 'Engine hooks', description: 'Pointer events with the node and world point under the pointer, a fixed-step frame hook and renderer plugins with their own Three.js objects: click the floor to send a robot, through native React, Vue and JavaScript.', href: '/examples/engine-hooks', preview: 'engine-hooks', action: 'Open engine hooks example' },
  { title: 'Primitives and groups', description: 'A 3D bar chart built from box shapes, tube lines, text and groups driven by data, with billboard value labels, an image node, selection that bubbles from a bar to its series and a group of shapes driving on a route, through native React, Vue and JavaScript.', href: '/examples/primitives', preview: 'primitives', action: 'Open primitives example' },
  { title: 'Move mode', description: 'Optional interaction: select a parcel, tote or pallet, see the compatible free places and request a move in the scene or an HTML list, through native React, Vue and JavaScript.', href: '/examples/move-mode', preview: 'move-mode', action: 'Open move mode' },
  { title: 'Rule-based movement', description: 'Scripted pickers share shelf and desk slots, queue when they are full and follow walkway rules, while a pallet jack keeps to its one-way lane.', href: '/examples/motion', preview: 'motion', action: 'Open movement example' },
  { title: 'Displays, clocks & timers', description: 'Portable monitors, information boards, numeric readouts, clocks and timers across native React, Vue and JavaScript.', href: '/examples/displays', preview: 'displays', action: 'Open display examples' },
  { title: 'Scene markers', description: 'Alert and status markers in eight shapes with semantic tones, icons and a detail card, configured live through native React, Vue and JavaScript.', href: '/examples/markers', preview: 'markers', action: 'Open marker examples' },
  { title: 'Measured indicators', description: 'Decimal readings, ranges, targets and threshold bands across native React, Vue and JavaScript.', href: '/examples/indicators', preview: 'indicators', action: 'Open indicator examples' },
  { title: 'Object contract', description: 'The parcel with the complete common contract: two scene palettes, instance overrides, status tints, selection, motion gates and resource cleanup in native React, Vue and JavaScript.', href: '/examples/object-contract', preview: 'object-contract', action: 'Open object contract' },
  { title: 'Object catalog', description: 'Browse reusable models, try individual previews and choose building blocks for your next scene.', href: '/docs/objects', preview: 'objects', action: 'Browse object catalog' },
  { title: 'Framework comparison', description: 'Mount, update and unmount the same minimal scene in React, native Vue and plain JavaScript.', href: '/examples/adapters', preview: 'adapters', action: 'Open adapter examples' },
];

/** Every gallery entry; `/docs/objects` is listed among them but is a documentation page. */
export const allExamples: readonly Example[] = [...domainExamples, ...toolkitExamples];

/**
 * Metadata for an example page from its gallery entry. Throws at build time when the route has no entry,
 * so a new example page must be added to the gallery first.
 */
export function exampleMetadata(href: string): Metadata {
  const example = allExamples.find(item => item.href === href);
  if (!example) throw new Error(`No gallery entry for ${href}. Add it to domainExamples or toolkitExamples in src/features/examples/catalog.ts.`);
  return pageMetadata({ title: `${example.title} · Opsorama`, description: example.description, path: example.href, image: { url: `/example-previews/${example.preview}.webp`, ...EXAMPLE_PREVIEW_SIZE, alt: `${example.title} — Opsorama 3D dashboard example` } });
}

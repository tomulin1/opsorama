import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';

export const metadata = { title: 'Examples · Opsorama' };

// Capture each preview from its linked page and store it under public/example-previews.
const domainExamples = [
  { title: 'Online shop & warehouse', description: 'Follow online orders from release through picking, sortation, packing and dispatch beside a shop with checkouts and click & collect. Inspect a short pick, a late inbound truck and orders at risk of the carrier cut-off.', href: '/examples/ecommerce', preview: 'ecommerce', action: 'Open e-commerce example' },
  { title: 'Regional distribution centre', description: 'A large distribution centre with 16 dock doors, a truck yard, seven reserve aisles, a chilled chamber, a hazardous goods cage, each picking, robot sortation and packing. Inspect a load at risk of its departure, a rack hit by a forklift and a warm chilled chamber.', href: '/examples/warehouse', preview: 'warehouse', action: 'Open distribution centre example' },
  { title: 'Open-plan office', description: 'See who is at a desk, in a meeting, in a focus pod or remote, and which ticket and project each person is working on. Inspect a blocked release, the incident bridge and the room bookings.', href: '/examples/office', preview: 'office', action: 'Open office example' },
  { title: 'Restaurant operations', description: 'Follow tables from seating to bill, kitchen tickets to the pass and takeout bags to pickup. Inspect a late grill ticket and a warm walk-in cooler.', href: '/examples/restaurant', preview: 'restaurant', action: 'Open restaurant example' },
  { title: 'Datacenter operations', description: 'Explore a four-hall facility with 128 racks, support rooms and outdoor plant. Follow an inlet, uplink or PSU alert to its rack and compare incident and recovered snapshots.', href: '/examples/datacenter', preview: 'datacenter', action: 'Open datacenter example' },
  { title: 'Aquatic centre', description: 'Watch lane bookings and occupancy, lifeguard cover and water quality around a 25 m pool and a teaching pool. Inspect a lane alert, an empty lifeguard chair and low chlorine.', href: '/examples/aquatics', preview: 'aquatics', action: 'Open aquatic centre example' },
  { title: 'Farm', description: 'Check pens, troughs and tagged animals, fields and today’s chores on a mixed farm with cows, horses, sheep, pigs and hens. Inspect an empty water tank, a heat-stressed cow and a missing ewe.', href: '/examples/farm', preview: 'farm', action: 'Open farm example' },
];
const toolkitExamples = [
  { title: 'Performance playground', description: 'Stress one shared-renderer scene with up to 2,048 catalog model instances. Compare motion, shadows and labels, inspect live counters and export a timed FPS recording.', href: '/examples/performance', preview: 'performance', action: 'Open performance playground' },
  { title: 'Generic data panels', description: 'Optional presentation primitives for values, details, processes and lists. Supply your own data, content and layout through native React, Vue or JavaScript.', href: '/examples/panels', preview: 'panels', action: 'Open panel samples' },
  { title: 'Logistics objects', description: 'Forklift, loading dock and shipping container preserved as shared static models. Mount, update and dispose through native React, Vue and JavaScript.', href: '/examples/logistics', preview: 'logistics', action: 'Open logistics objects' },
  { title: 'Site, energy & automation', description: 'Mobile robot, robot arm, machine tool, EV chargers, solar array, wind turbine, tank, pump and site equipment through native React, Vue and JavaScript.', href: '/examples/site-energy', preview: 'site-energy', action: 'Open site and energy objects' },
  { title: 'Warehouse objects', description: 'Pallet racks, reach truck, carton flow racks, stretch wrapper, safety barriers, IBC tanks, drums and bulk bags through native React, Vue and JavaScript.', href: '/examples/warehouse-objects', preview: 'warehouse-objects', action: 'Open warehouse objects' },
  { title: 'Domain kits', description: 'Aircraft and baggage carts, tower and gantry cranes, valve, tractor and silo, hospital beds, kitchen stations, a stage and exhibition booths through native React, Vue and JavaScript.', href: '/examples/domain-kits', preview: 'domain-kits', action: 'Open domain kit objects' },
  { title: 'Street & site surfaces', description: 'Road tiles, sized sidewalks, floors, terrain and a parking lot composed on one ground through native React, Vue and JavaScript.', href: '/examples/surfaces', preview: 'surfaces', action: 'Open surfaces example' },
  { title: 'Building containers', description: 'Peek inside a workshop and office, load contents on demand and inspect independent objects through native React, Vue and JavaScript.', href: '/examples/buildings', preview: 'buildings', action: 'Open building example' },
  { title: 'Selection styles', description: 'Mark the selected and hovered object with floor brackets or a colored glow, from a parcel to a silo, on moving and instanced objects and in alert states.', href: '/examples/selection', preview: 'selection', action: 'Open selection styles' },
  { title: 'Move mode', description: 'Optional interaction: select a parcel, tote or pallet, see the compatible free places and request a move in the scene or an HTML list, through native React, Vue and JavaScript.', href: '/examples/move-mode', preview: 'move-mode', action: 'Open move mode' },
  { title: 'Rule-based movement', description: 'Scripted pickers share shelf and desk slots, queue when they are full and follow walkway rules, while a pallet jack keeps to its one-way lane.', href: '/examples/motion', preview: 'motion', action: 'Open movement example' },
  { title: 'Displays, clocks & timers', description: 'Portable monitors, information boards, numeric readouts, clocks and timers across native React, Vue and JavaScript.', href: '/examples/displays', preview: 'displays', action: 'Open display examples' },
  { title: 'Scene markers', description: 'Alert and status markers in eight shapes with semantic tones, icons and a detail card, configured live through native React, Vue and JavaScript.', href: '/examples/markers', preview: 'markers', action: 'Open marker examples' },
  { title: 'Measured indicators', description: 'Decimal readings, ranges, targets and threshold bands across native React, Vue and JavaScript.', href: '/examples/indicators', preview: 'indicators', action: 'Open indicator examples' },
  { title: 'Object contract', description: 'The parcel with the complete common contract: two scene palettes, instance overrides, status tints, selection, motion gates and resource cleanup in native React, Vue and JavaScript.', href: '/examples/object-contract', preview: 'object-contract', action: 'Open object contract' },
  { title: 'Object catalog', description: 'Browse reusable models, try individual previews and choose building blocks for your next scene.', href: '/docs/objects', preview: 'objects', action: 'Browse object catalog' },
  { title: 'Framework comparison', description: 'Mount, update and unmount the same minimal scene in React, native Vue and plain JavaScript.', href: '/examples/adapters', preview: 'adapters', action: 'Open adapter examples' },
];

type Example = (typeof domainExamples)[number];

function ExampleCard({ example }: { example: Example }) {
  return <Link className="examples-card" href={example.href} prefetch={false} aria-label={example.action}>
    <div className="examples-card-preview">
      <Image src={`/example-previews/${example.preview}.webp`} alt="" width={768} height={480} unoptimized />
    </div>
    <div className="examples-card-body">
      <h3>{example.title}</h3>
      <p>{example.description}</p>
      <span className="examples-card-action">{example.action}<ArrowUpRight size={15} aria-hidden="true" /></span>
    </div>
  </Link>;
}

export default function ExamplesPage() {
  return <main className="examples-page">
    <SiteHeader />
    <div className="examples-container">
      <header className="examples-heading">
        <div className="examples-hero-image">
          <Image src="/example-previews/city.webp" alt="" fill preload unoptimized />
        </div>
        <div className="examples-hero-copy">
          <h1>Explore 3D dashboards.</h1>
          <p>Open an interactive scene or try a focused toolkit demo. All examples run locally with fictional data.</p>
          <div className="examples-hero-actions">
            <Link href="#domain-examples">Browse examples<ArrowDown size={16} aria-hidden="true" /></Link>
            <Link href="/docs">Start building<ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </div>
      </header>
      <section aria-labelledby="domain-examples">
        <h2 id="domain-examples">Domain examples</h2>
        <div className="examples-grid">{domainExamples.map(example => <ExampleCard key={example.href} example={example} />)}</div>
      </section>
      <section aria-labelledby="toolkit-examples">
        <h2 id="toolkit-examples">Toolkit examples</h2>
        <div className="examples-grid">{toolkitExamples.map(example => <ExampleCard key={example.href} example={example} />)}</div>
      </section>
      <footer>
        <p>External integrations remain separate from these mock examples. Your host owns data, permissions and commands.</p>
        <nav className="site-footer-links" aria-label="Footer">
          <Link href="/brand">Website colors</Link>
          <Link href="/docs">Read the documentation →</Link>
          <ProjectLinks />
        </nav>
      </footer>
    </div>
  </main>;
}

'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Building2, ChartColumnBig, ChevronLeft, ChevronRight, Code2, Gamepad2, GraduationCap, Layers, LayoutPanelTop, Route, SquareTerminal, Warehouse, type LucideIcon } from 'lucide-react';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { ExampleCard } from '@/components/toolkit/ExampleCard';
import { domainExamples } from '@/features/examples/catalog';

/** What a slide shows beside the panel: a preview captured from the linked example, or the agent commands. */
type SlideVisual = { kind: 'preview'; preview: string } | { kind: 'terminal' };
interface UseCase { title: string; description: string; href: string; action: string; icon: LucideIcon; visual: SlideVisual }

/** The slides after the introduction: one use of the toolkit each, with the example that runs it. */
const USE_CASES: readonly UseCase[] = [
  { title: 'Live operations boards', description: 'Watch orders, people and vehicles move through a shop and its warehouse. Map your records to shelves, pickers and trucks; problems show up as markers you can open.', href: '/examples/ecommerce', action: 'Open the shop and warehouse', icon: Warehouse, visual: { kind: 'preview', preview: 'ecommerce' } },
  { title: 'Facility overviews', description: 'Rooms, racks, equipment and readings on a plan of the real place. Follow an inlet, uplink or power alert in a datacenter to the rack that raised it.', href: '/examples/datacenter', action: 'Open the datacenter', icon: Building2, visual: { kind: 'preview', preview: 'datacenter' } },
  { title: 'Management games', description: 'Turn the same scene and simulation into a playable shift. In Cut-off you staff the zones, move stock and race the carrier cut-off.', href: '/examples/cutoff', action: 'Play Cut-off', icon: Gamepad2, visual: { kind: 'preview', preview: 'cutoff' } },
  { title: 'Training and explainers', description: 'Show how work moves through a place: pickers share shelf slots, queue when they are full and keep to the walkway rules, instead of a slide deck.', href: '/examples/motion', action: 'Open the movement example', icon: GraduationCap, visual: { kind: 'preview', preview: 'motion' } },
  { title: 'Spatial visualizations', description: 'Build 3D charts, process maps and flows from shapes, lines, text and groups bound to your data, with selection that bubbles from a bar to its series.', href: '/examples/primitives', action: 'Open the primitives example', icon: ChartColumnBig, visual: { kind: 'preview', preview: 'primitives' } },
  { title: 'Built with AI coding agents', description: 'Your agent searches the catalog, writes the scene, checks it and renders a preview image from the command line. Typed contracts and errors that name the fix keep it on track.', href: '/docs/validation', action: 'Read about validation', icon: SquareTerminal, visual: { kind: 'terminal' } },
];
/** The introduction's mosaic: four use cases with distinct previews, each a shortcut to its slide. */
const MOSAIC_EXAMPLES = ['/examples/ecommerce', '/examples/datacenter', '/examples/cutoff', '/examples/primitives'];
const MOSAIC = MOSAIC_EXAMPLES.map(href => { const index = USE_CASES.findIndex(item => item.href === href); return { item: USE_CASES[index], slide: index + 1 }; });
/** Slide 0 is the introduction; the carousel only moves when the visitor asks, so it never rotates on its own. */
const SLIDE_TITLES = ['Introduction', ...USE_CASES.map(item => item.title)];
/** Toolkit building blocks, listed below the carousel. */
const CAPABILITIES = [
  { title: 'A catalog of real objects', description: 'Buildings, racks, vehicles, people, animals and displays with typed options, palette roles and a static pose for reduced motion.', href: '/docs/objects', action: 'Browse the catalog', icon: Boxes },
  { title: 'Your data, your rules', description: 'Map records to scene nodes in your own code. The host keeps business rules, permissions and commands; the scene shows confirmed state.', href: '/docs/data', action: 'Connect your data', icon: Layers },
  { title: 'Movement with meaning', description: 'Routes, shared slots, queues, capacity and hand-overs let people and machines move work through a place instead of animating a picture.', href: '/examples/motion', action: 'Open movement example', icon: Route },
  { title: 'Panels you can replace', description: 'Metric cards, inspectors and lists float over the scene as optional HTML. Use them, restyle them or bring your own interface.', href: '/examples/panels', action: 'Open panel samples', icon: LayoutPanelTop },
  { title: 'React, Vue and JavaScript', description: 'One scene model and one Three.js renderer with native adapters. No hidden React runtime inside Vue.', href: '/examples/adapters', action: 'Compare the adapters', icon: Code2 },
];
/** The agent slide's commands, each with what it gives the agent. */
const AGENT_COMMANDS = [
  { command: 'npx opsorama catalog search pallet truck', note: 'models matching every word, with their kit' },
  { command: 'npx opsorama check scene.json', note: 'every problem, with its location and a fix' },
  { command: 'npx opsorama render scene.json -o scene.png', note: 'a picture of the scene, from headless Chromium' },
];

function previewSource(preview: string) { return `/example-previews/${preview}.webp`; }

/** The visual of one slide. Hidden slides keep their place in the stack so switching only fades. */
function SlideStage({ active, show }: { active: number; show: (index: number) => void }) {
  return <div className="landing-stage">
    <div className="landing-visual landing-mosaic" aria-hidden={active !== 0} inert={active !== 0}>
      {MOSAIC.map(({ item, slide }) => <button type="button" key={item.href} aria-label={`Show slide ${slide + 1}: ${item.title}`} onClick={() => show(slide)}>
        {item.visual.kind === 'preview' && <Image src={previewSource(item.visual.preview)} alt="" width={768} height={480} unoptimized preload />}
        <span><item.icon size={13} aria-hidden="true" />{item.title}</span>
      </button>)}
    </div>
    {USE_CASES.map((item, index) => <div className="landing-visual" key={item.href} aria-hidden={active !== index + 1} inert={active !== index + 1}>
      {item.visual.kind === 'preview'
        ? <Image src={previewSource(item.visual.preview)} alt="" width={768} height={480} unoptimized />
        : <div className="landing-terminal">{AGENT_COMMANDS.map(line => <p key={line.command}><code><span aria-hidden="true">$ </span>{line.command}</code><small># {line.note}</small></p>)}</div>}
    </div>)}
  </div>;
}

/** The first screen: a panel with the introduction and one slide per use case, and the matching visual beside it. Every slide shares one grid cell, so the panel keeps the height of the tallest slide. */
function UseCaseCarousel() {
  const [active, setActive] = useState(0), count = SLIDE_TITLES.length;
  const show = (index: number) => setActive((index + count) % count);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
  };
  return <section className="landing-hero" aria-roledescription="carousel" aria-label="About Opsorama" onKeyDown={onKeyDown}>
    <div className="landing-intro">
      <div className="landing-slides">
        <div className="landing-slide" role="group" aria-roledescription="slide" aria-label={`1 of ${count}: ${SLIDE_TITLES[0]}`} aria-hidden={active !== 0} inert={active !== 0}>
          <span className="docs-eyebrow">OPSORAMA · 3D OPERATIONS TOOLKIT</span>
          <h1>A clear view of your operations.</h1>
          <p>An open-source toolkit for 3D scenes in web apps: live operations boards, management games and spatial views. Build them from your own data and a catalog of 161 ready models, in React, Vue or plain JavaScript.</p>
          <div className="examples-hero-actions"><Link href="/docs">Start building<ArrowUpRight size={16} /></Link><Link href="/examples">All examples<ArrowUpRight size={16} /></Link></div>
        </div>
        {USE_CASES.map((item, index) => <div className="landing-slide landing-use-case" key={item.href} role="group" aria-roledescription="slide" aria-label={`${index + 2} of ${count}: ${item.title}`} aria-hidden={active !== index + 1} inert={active !== index + 1}>
          <span className="docs-eyebrow"><item.icon size={14} />WHAT YOU CAN BUILD</span>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
          <Link href={item.href}>{item.action}<ArrowUpRight size={15} /></Link>
        </div>)}
      </div>
      <div className="landing-carousel-controls">
        <button type="button" className="landing-icon-button" aria-label="Previous slide" onClick={() => show(active - 1)}><ChevronLeft size={16} /></button>
        <div className="landing-carousel-dots">{SLIDE_TITLES.map((title, index) => <button type="button" key={title} aria-label={`Show slide ${index + 1}: ${title}`} aria-current={active === index ? 'true' : undefined} onClick={() => show(index)} />)}</div>
        <button type="button" className="landing-icon-button" aria-label="Next slide" onClick={() => show(active + 1)}><ChevronRight size={16} /></button>
      </div>
    </div>
    <SlideStage active={active} show={show} />
  </section>;
}

export function LandingPage() {
  return <main className="landing-page">
    <SiteHeader active={null} />
    <UseCaseCarousel />
    <div className="examples-container landing-sections">
      <section aria-labelledby="landing-places">
        <h2 id="landing-places">Places you can model</h2>
        <p className="landing-lead">Every example is a complete scene with fictional data, built only from the toolkit and its catalog.</p>
        <div className="examples-grid">{domainExamples.map(example => <ExampleCard key={example.href} example={example} />)}</div>
      </section>
      <section aria-labelledby="landing-blocks">
        <h2 id="landing-blocks">What the toolkit gives you</h2>
        <div className="landing-blocks">{CAPABILITIES.map(item => <Link key={item.href} href={item.href} className="landing-block">
          <item.icon size={18} aria-hidden="true" />
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          <span>{item.action}<ArrowUpRight size={15} aria-hidden="true" /></span>
        </Link>)}</div>
      </section>
      <footer><p>All scenes run locally with fictional data. Your host owns data, permissions and commands.</p><nav className="site-footer-links" aria-label="Footer"><Link href="/brand">Website colors</Link><Link href="/docs">Read the documentation →</Link><ProjectLinks /></nav></footer>
    </div>
  </main>;
}

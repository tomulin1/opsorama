'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, Gamepad2, SquareTerminal, Warehouse } from 'lucide-react';
import type { SceneStore } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, useSceneStore } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { HudZoom } from '../example-hud';
import { runFeedLoop } from '../ecommerce/feed-loop';
import { DEFAULT_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import { createEcommerceSimulation, createEcommerceStore, type EcommerceSimulation } from '../ecommerce/simulation';
import '@opsorama/ui/styles.css';

/** Later slides of the intro carousel; each names one use of the toolkit and links to the page that runs it. */
const USE_CASES = [
  { title: 'Live operations boards', description: 'Watch orders, people and vehicles move through a shop and its warehouse. Map your records to shelves, pickers and trucks; problems show up as markers you can open.', href: '/examples/ecommerce', action: 'Open the shop and warehouse', icon: Warehouse },
  { title: 'Facility overviews', description: 'Rooms, racks, equipment and readings on a plan of the real place. Follow an inlet, uplink or power alert in a datacenter to the rack that raised it.', href: '/examples/datacenter', action: 'Open the datacenter', icon: Building2 },
  { title: 'Management games', description: 'Turn the same scene and simulation into a playable shift. In Cut-off you staff the zones, move stock and race the carrier cut-off.', href: '/examples/cutoff', action: 'Play Cut-off', icon: Gamepad2 },
  { title: 'Built with AI coding agents', description: 'Your agent searches the catalog, writes the scene, checks it and renders a preview image from the command line. Typed contracts and errors that name the fix keep it on track.', href: '/docs/validation', action: 'Read about validation', icon: SquareTerminal },
];
/** Slide 0 is the introduction; the carousel only moves when the visitor asks, so it never rotates on its own. */
const SLIDE_TITLES = ['Introduction', ...USE_CASES.map(item => item.title)];

/** The floating intro panel: the introduction followed by one slide per use. Every slide shares one grid cell, so the panel keeps the height of the tallest slide. */
function IntroCarousel() {
  const [active, setActive] = useState(0), count = SLIDE_TITLES.length;
  const show = (index: number) => setActive((index + count) % count);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
  };
  return <section className="landing-intro" aria-roledescription="carousel" aria-label="About Opsorama" onKeyDown={onKeyDown}>
    <div className="landing-slides">
      <div className="landing-slide" role="group" aria-roledescription="slide" aria-label={`1 of ${count}: ${SLIDE_TITLES[0]}`} aria-hidden={active !== 0} inert={active !== 0}>
        <span className="docs-eyebrow">OPSORAMA · 3D OPERATIONS TOOLKIT</span>
        <h1>A clear view of your operations.</h1>
        <p>An open-source toolkit for 3D scenes in web apps: live operations boards, facility overviews and management games, built from your own data and a catalog of 161 ready models in React, Vue or plain JavaScript. Behind this panel runs the shop and warehouse example.</p>
        <div className="examples-hero-actions"><Link href="/docs">Start building<ArrowUpRight size={16} /></Link><Link href="/examples">All examples<ArrowUpRight size={16} /></Link></div>
      </div>
      {USE_CASES.map((item, index) => <div className="landing-slide landing-capability" key={item.href} role="group" aria-roledescription="slide" aria-label={`${index + 2} of ${count}: ${item.title}`} aria-hidden={active !== index + 1} inert={active !== index + 1}>
        <span className="docs-eyebrow"><item.icon size={14} />WHAT YOU CAN BUILD</span>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <Link href={item.href}>{item.action}<ArrowUpRight size={15} /></Link>
      </div>)}
    </div>
    <div className="landing-carousel-controls">
      <button type="button" className="hud-icon-button" aria-label="Previous slide" onClick={() => show(active - 1)}><ChevronLeft size={16} /></button>
      <div className="landing-carousel-dots">{SLIDE_TITLES.map((title, index) => <button type="button" key={title} aria-label={`Show slide ${index + 1}: ${title}`} aria-current={active === index ? 'true' : undefined} onClick={() => show(index)} />)}</div>
      <button type="button" className="hud-icon-button" aria-label="Next slide" onClick={() => show(active + 1)}><ChevronRight size={16} /></button>
    </div>
  </section>;
}

/** The shop and warehouse example's own scene and feed, running behind the carousel. */
function ShopViewport({ simulation }: { simulation: EcommerceSimulation }) {
  const store = useSceneStore(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  useEffect(() => runFeedLoop({ feed: () => simulation, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords: () => {} }), [store, simulation]);
  return <>
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} /></div>
    <div className="hud-viewport-controls landing-controls"><HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} /></div>
  </>;
}

export function LandingPage() {
  const [session, setSession] = useState<{ store: SceneStore; simulation: EcommerceSimulation } | null>(null);
  useEffect(() => {
    const simulation = createEcommerceSimulation('peak'), store = createEcommerceStore('peak', simulation);
    setSession({ store, simulation });
    return () => { setSession(null); store.dispose(); simulation.dispose(); };
  }, []);
  return <main className="landing-page">
    <SiteHeader active={null} />
    <section className="hud-viewport landing-hero" data-left-panel="none" data-panel-theme="light" aria-label="Shop and warehouse scene">
      {session && <DashboardProvider store={session.store}><ShopViewport simulation={session.simulation} /></DashboardProvider>}
      <IntroCarousel />
    </section>
    <div className="examples-container landing-sections">
      <footer><p>All scenes run locally with fictional data. Your host owns data, permissions and commands.</p><nav className="site-footer-links" aria-label="Footer"><Link href="/brand">Website colors</Link><Link href="/docs">Read the documentation →</Link><ProjectLinks /></nav></footer>
    </div>
  </main>;
}

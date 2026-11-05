'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, ChevronLeft, ChevronRight, Code2, Crosshair, Layers, LayoutPanelTop, MapPin, Route, X } from 'lucide-react';
import { createSceneStore, type SceneNode, type SceneStore } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel, StatusBadge } from '@opsorama/react/ui';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { HudZoom } from '../example-hud';
import { runFeedLoop } from '../ecommerce/feed-loop';
import { ecommerceControllers } from '../ecommerce/scene';
import { createEcommerceSimulation, type EcommerceSimulation } from '../ecommerce/simulation';
import { cityStaticNodes, DISTRICTS, districtFacts, districtFocusId, districtPinId, placeEcommerce, type DistrictId } from './city';
import '@opsorama/ui/styles.css';

/** Default city zoom: four zoom-button steps (0.2 each) above the fitted 1.05, so buildings and people are readable on the first screen. */
const CITY_ZOOM = 1.85;
/** Later slides of the intro carousel; each names a toolkit capability and links to the page that runs it. */
const CAPABILITIES = [
  { title: 'A catalog of real objects', description: 'Buildings, racks, vehicles, people, animals and displays with typed options, palette roles and a static pose for reduced motion.', href: '/docs/objects', action: 'Browse the catalog', icon: Boxes },
  { title: 'Your data, your rules', description: 'Map records to scene nodes in your own code. The host keeps business rules, permissions and commands; the scene shows confirmed state.', href: '/docs/data', action: 'Connect your data', icon: Layers },
  { title: 'Movement with meaning', description: 'Routes, shared slots, queues, capacity and hand-overs let people and machines move work through a place instead of animating a picture.', href: '/examples/motion', action: 'Open movement example', icon: Route },
  { title: 'Panels you can replace', description: 'Metric cards, inspectors and lists float over the scene as optional HTML. Use them, restyle them or bring your own interface.', href: '/examples/panels', action: 'Open panel samples', icon: LayoutPanelTop },
  { title: 'React, Vue and JavaScript', description: 'One scene model and one Three.js renderer with native adapters. No hidden React runtime inside Vue.', href: '/examples/adapters', action: 'Compare the adapters', icon: Code2 },
];
/** Slide 0 is the introduction; the carousel only moves when the visitor asks, so it never rotates on its own. */
const SLIDE_TITLES = ['Introduction', ...CAPABILITIES.map(item => item.title)];

/** The floating intro panel: the introduction followed by one slide per capability. Every slide shares one grid cell, so the panel keeps the height of the tallest slide. */
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
        <span className="docs-eyebrow">OPSORAMA · OPERATIONS + PANORAMA</span>
        <h1>A clear view of your operations.</h1>
        <p>Animated 3D boards for commerce, logistics, people and places. This city runs six of our examples in one scene, from their own code.</p>
        <div className="examples-hero-actions"><Link href="/docs">Start building<ArrowUpRight size={16} /></Link><Link href="/examples">All examples<ArrowUpRight size={16} /></Link></div>
      </div>
      {CAPABILITIES.map((item, index) => <div className="landing-slide landing-capability" key={item.href} role="group" aria-roledescription="slide" aria-label={`${index + 2} of ${count}: ${item.title}`} aria-hidden={active !== index + 1} inert={active !== index + 1}>
        <span className="docs-eyebrow"><item.icon size={14} />WHAT YOU CAN BUILD WITH</span>
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

/** Keeps a selection on the district pin, so a moving object that disappears cannot close the card. */
function useDistrict(renderer: React.RefObject<SceneRenderer | null>) {
  const store = useSceneStore(), { selection } = useScene();
  const id = (selection?.entityId ?? null) as DistrictId | null, district = DISTRICTS.find(item => item.id === id) ?? null;
  useEffect(() => { if (id && selection?.nodeId !== districtPinId(id)) store.select(districtPinId(id), selection?.origin); }, [store, id, selection]);
  // The renderer pans to a selected node; a whole district needs the fitted view instead.
  const selected = selection?.nodeId;
  useEffect(() => {
    if (!district) renderer.current?.overview();
    else if (selected === districtPinId(district.id)) renderer.current?.frame(districtFocusId(district), { fit: true });
  }, [renderer, district, selected]);
  return district;
}

function CityViewport({ city, simulation }: { city: readonly SceneNode[]; simulation: EcommerceSimulation }) {
  const store = useSceneStore(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [records, setRecords] = useState(() => simulation.snapshot()), district = useDistrict(renderer);
  useEffect(() => runFeedLoop({ feed: () => simulation, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace([...city, ...placeEcommerce(nodes)]), onRecords: setRecords }), [store, city, simulation]);
  return <>
    <div className="hud-scene-surface"><SceneCanvas className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} /></div>
    <nav className="landing-districts" aria-label="City districts">
      {DISTRICTS.map(item => <button type="button" key={item.id} aria-pressed={district?.id === item.id} onClick={() => store.select(district?.id === item.id ? null : districtPinId(item.id), 'api')}><MapPin size={13} />{item.name}</button>)}
    </nav>
    {district && <DataPanel className="hud-side-panel landing-district" title={district.name} label="District details" description="Live scene · fictional data" density="compact" slots={{ actions: <button type="button" className="hud-icon-button" aria-label="Close district" onClick={() => store.select(null)}><X size={16} /></button> }}>
      <p>{district.summary}</p>
      <dl>{districtFacts(district.id, records).map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
      <div className="landing-shows">{district.shows.map(item => <StatusBadge key={item} label={item} tone="info" />)}</div>
      <Link href={district.href}>Open the full example<ArrowUpRight size={15} /></Link>
    </DataPanel>}
    <div className="hud-viewport-controls landing-controls">
      <HudZoom rendererRef={renderer} defaultZoom={CITY_ZOOM} />
      {district && <button type="button" className="landing-overview" onClick={() => store.select(null)}><Crosshair size={14} />Whole city</button>}
    </div>
  </>;
}

export function LandingPage() {
  const [session, setSession] = useState<{ store: SceneStore; city: readonly SceneNode[]; simulation: EcommerceSimulation } | null>(null);
  useEffect(() => {
    const simulation = createEcommerceSimulation('peak'), city = cityStaticNodes();
    const store = createSceneStore({ schemaVersion: 1, nodes: [...city, ...placeEcommerce(simulation.nodes())] }, { zoom: CITY_ZOOM, shadows: false });
    setSession({ store, city, simulation });
    return () => { setSession(null); store.dispose(); simulation.dispose(); };
  }, []);
  return <main className="landing-page">
    <SiteHeader active={null} />
    <section className="hud-viewport landing-hero" data-left-panel="none" aria-label="Opsorama city">
      {session && <DashboardProvider store={session.store}><CityViewport city={session.city} simulation={session.simulation} /></DashboardProvider>}
      <IntroCarousel />
    </section>
    <div className="examples-container landing-sections">
      <footer><p>All scenes run locally with fictional data. Your host owns data, permissions and commands.</p><nav className="site-footer-links" aria-label="Footer"><Link href="/brand">Website colors</Link><Link href="/docs">Read the documentation →</Link><ProjectLinks /></nav></footer>
    </div>
  </main>;
}

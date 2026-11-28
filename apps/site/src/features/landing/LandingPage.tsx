'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, GripHorizontal, Maximize2, Minimize2 } from 'lucide-react';
import { DashboardProvider, NodeHtml, SceneCanvas, useScene } from '@opsorama/react';
import { ActionRing, DataPanel } from '@opsorama/react/ui';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ProjectLinks } from '@/components/toolkit/ProjectLinks';
import { HudMetrics, HudNodePreview, HudZoom, useHudMetricSize } from '../example-hud';
import { createLandingScene, LANDING_SCENE_IMAGES, type LandingScene, type LandingSceneId, type SceneInspector, type SceneMenu, type SceneMetrics } from './scenes';
import type { AgentLog } from './agent-build';
import '@opsorama/ui/styles.css';

/** Later slides of the intro carousel; each names one use of the toolkit, links to the page that runs it and shows that page's scene behind the panel. */
interface UseCase {
  title: string; description: string; href: string; action: string; scene: LandingSceneId;
  /** One sentence the collapsed panel shows under the title. */
  summary: string;
}
const USE_CASES: readonly UseCase[] = [
  { title: 'Live operations boards', description: 'Watch docks, aisles, vehicles and loads in a distribution centre. Map your records to doors, racks and trucks; a load at risk of its departure or a rack hit by a forklift shows up as a marker you can open.', href: '/examples/warehouse', action: 'Open the distribution centre', scene: 'warehouse', summary: 'Docks, aisles, vehicles and loads of a distribution centre, live from your records.' },
  { title: 'Facility overviews', description: 'Rooms, racks, equipment and readings on a plan of the real place. Follow an inlet, uplink or power alert in a datacenter to the rack that raised it.', href: '/examples/datacenter', action: 'Open the datacenter', scene: 'datacenter', summary: 'Follow a datacenter alert to the rack that raised it.' },
  { title: 'Management games', description: 'Turn the same scene and simulation into a playable shift. In Cut-off you staff the zones, move stock and race the carrier cut-off.', href: '/examples/cutoff', action: 'Play Cut-off', scene: 'cutoff', summary: 'Run a shift yourself: staff the zones, move stock and beat the carrier cut-off.' },
  { title: 'Built with AI coding agents', description: 'Your agent searches the catalog, writes the scene, checks it and renders a preview image from the command line. Behind this panel, an agent builds the office example node by node.', href: '/docs/validation', action: 'Read about validation', scene: 'office', summary: 'Watch an agent build the office example from the catalog, node by node.' },
];
/** Slide 0 is the introduction; the carousel only moves when the visitor asks, so it never rotates on its own. */
const SLIDE_TITLES = ['Introduction', ...USE_CASES.map(item => item.title)];
/** The sentence under each slide's title in the collapsed panel. */
const SLIDE_SUMMARIES = ['Open-source 3D scenes for operations in web apps, built from your own data.', ...USE_CASES.map(item => item.summary)];
/** The scene behind each slide; the introduction shows the shop. */
const SLIDE_SCENES: readonly LandingSceneId[] = ['shop', ...USE_CASES.map(item => item.scene)];

/** Gap the panel keeps from the scene's edges, in pixels. */
const EDGE = 8;
/** Distance one arrow key moves the panel, in pixels. */
const KEY_STEP = 24;
type Point = { x: number; y: number };

/**
 * Lets the visitor move the panel by its grip, with a pointer or the arrow keys, inside the scene. The panel keeps its CSS
 * place until it is first moved; from then on it is placed at `position`, kept inside the scene when it or the window changes size.
 */
function usePanelPosition(panel: React.RefObject<HTMLElement | null>, collapsed: boolean) {
  const [position, setPosition] = useState<Point | null>(null), drag = useRef<{ pointer: number; start: Point; from: Point } | null>(null);
  const clamp = useCallback((point: Point): Point => {
    const element = panel.current, scene = element?.offsetParent as HTMLElement | null | undefined;
    if (!element || !scene) return point;
    const maxX = Math.max(EDGE, scene.clientWidth - element.offsetWidth - EDGE), maxY = Math.max(EDGE, scene.clientHeight - element.offsetHeight - EDGE);
    return { x: Math.min(Math.max(point.x, EDGE), maxX), y: Math.min(Math.max(point.y, EDGE), maxY) };
  }, [panel]);
  const current = (): Point => ({ x: panel.current?.offsetLeft ?? 0, y: panel.current?.offsetTop ?? 0 });
  // Collapsing or expanding changes the panel's size; a window resize changes the scene's.
  useLayoutEffect(() => { setPosition(value => value && clamp(value)); }, [collapsed, clamp]);
  useEffect(() => {
    const onResize = () => setPosition(value => value && clamp(value));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);
  const grip = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, from: current() };
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const value = drag.current;
      if (value?.pointer === event.pointerId) setPosition(clamp({ x: value.from.x + event.clientX - value.start.x, y: value.from.y + event.clientY - value.start.y }));
    },
    onPointerUp: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
    // The carousel turns slides with the arrow keys; on the grip they move the panel instead.
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!step) return;
      event.preventDefault(); event.stopPropagation();
      const from = position ?? current();
      setPosition(clamp({ x: from.x + step[0] * KEY_STEP, y: from.y + step[1] * KEY_STEP }));
    },
    // A double click returns the panel to its starting place.
    onDoubleClick: () => setPosition(null),
  };
  const style: React.CSSProperties | undefined = position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined;
  return { grip, style };
}

/**
 * The floating intro panel: the introduction followed by one slide per use. Every slide shares one grid cell, so the panel
 * keeps the height of the tallest slide. The visitor can move it by its grip and collapse it to one line with the slide's
 * title and the slide controls.
 */
function IntroCarousel({ active, onShow }: { active: number; onShow: (index: number) => void }) {
  const count = SLIDE_TITLES.length, panel = useRef<HTMLElement>(null), [collapsed, setCollapsed] = useState(false);
  const { grip, style } = usePanelPosition(panel, collapsed);
  const show = (index: number) => onShow((index + count) % count);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
  };
  return <section ref={panel} className="landing-intro" data-collapsed={collapsed || undefined} style={style} aria-roledescription="carousel" aria-label="About Opsorama" onKeyDown={onKeyDown}>
    <button type="button" className="hud-icon-button landing-grip" aria-label="Move panel" title="Drag to move, double-click to reset" {...grip}><GripHorizontal size={16} /></button>
    <button type="button" className="hud-icon-button landing-collapse" aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <Maximize2 size={15} /> : <Minimize2 size={15} />}</button>
    {collapsed && <div className="landing-intro-compact" aria-live="polite">
      <p className="landing-intro-compact-title"><span>{active + 1}/{count}</span>{SLIDE_TITLES[active]}</p>
      <p>{SLIDE_SUMMARIES[active]}</p>
    </div>}
    <div className="landing-slides" hidden={collapsed}>
      <div className="landing-slide" role="group" aria-roledescription="slide" aria-label={`1 of ${count}: ${SLIDE_TITLES[0]}`} aria-hidden={active !== 0} inert={active !== 0}>
        <span className="docs-eyebrow">OPSORAMA · 3D OPERATIONS TOOLKIT</span>
        <h1>A clear view of your operations.</h1>
        <p>An open-source toolkit for 3D scenes in web apps: live operations boards, facility overviews and management games, built from your own data and a catalog of 161 ready models in React, Vue or plain JavaScript. The scene behind this panel is the example each slide describes.</p>
        <div className="examples-hero-actions"><Link href="/docs">Start building<ArrowUpRight size={16} /></Link><Link href="/examples">All examples<ArrowUpRight size={16} /></Link></div>
      </div>
      {USE_CASES.map((item, index) => <div className="landing-slide landing-capability" key={item.href} role="group" aria-roledescription="slide" aria-label={`${index + 2} of ${count}: ${item.title}`} aria-hidden={active !== index + 1} inert={active !== index + 1}>
        <span className="docs-eyebrow">WHAT YOU CAN BUILD</span>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <div className="examples-hero-actions"><Link href={item.href}>{item.action}<ArrowUpRight size={16} /></Link></div>
      </div>)}
    </div>
    <div className="landing-carousel-controls">
      <button type="button" className="hud-icon-button" aria-label="Previous slide" onClick={() => show(active - 1)}><ChevronLeft size={16} /></button>
      <div className="landing-carousel-dots">{SLIDE_TITLES.map((title, index) => <button type="button" key={title} aria-label={`Show slide ${index + 1}: ${title}`} aria-current={active === index ? 'true' : undefined} onClick={() => show(index)} />)}</div>
      <button type="button" className="hud-icon-button" aria-label="Next slide" onClick={() => show(active + 1)}><ChevronRight size={16} /></button>
    </div>
  </section>;
}

/** A scene's canvas and zoom controls; its feed runs while it is shown. */
function SceneViewport({ scene }: { scene: LandingScene }) {
  const renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  useEffect(() => scene.run?.(), [scene]);
  return <>
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" controllers={scene.controllers} wheelZoom onReady={onReady} /></div>
    <div className="hud-viewport-controls landing-controls"><HudZoom rendererRef={renderer} defaultZoom={scene.zoom} /></div>
  </>;
}

/** The coding agent's log over the scene it builds: the prompt, its commands and each node it adds. */
function AgentLogPanel({ log }: { log: AgentLog }) {
  const lines = useSyncExternalStore(log.subscribe, log.getSnapshot, log.getSnapshot);
  return <section className="landing-agent-log" aria-label="Coding agent log (illustration)">
    <header><span aria-hidden="true" />Coding agent<small>illustration</small></header>
    <ol>{lines.map(line => <li key={line.id} data-kind={line.kind}>{line.kind === 'command' ? <><b aria-hidden="true">$ </b>{line.text}</> : line.text}</li>)}</ol>
  </section>;
}

/** The example's top panels over its scene; the game's are dark, as in the game. They only show values, so a click keeps the visitor here. */
function SceneMetricsPanel({ metrics }: { metrics: SceneMetrics }) {
  const { metricSize } = useHudMetricSize();
  useSyncExternalStore(metrics.subscribe, metrics.version, metrics.version);
  return <div className="hud-top landing-top" data-panel-theme={metrics.dark ? 'dark' : undefined}><HudMetrics label={metrics.label} size={metricSize} metrics={metrics.read()} /></div>;
}

/** The example's command ring, open over its node as in the example. It only shows the commands: `inert` keeps clicks and focus off it. */
function SceneMenuRing({ menu }: { menu: SceneMenu }) {
  useSyncExternalStore(menu.subscribe, menu.version, menu.version);
  const ring = menu.read();
  return ring && <NodeHtml nodeId={menu.nodeId} className="co-ring-anchor landing-ring">
    <div inert><ActionRing layout="card" density="compact" unfold title={ring.title} label={`Commands of ${ring.title}`} tone={ring.tone} actions={ring.actions} /></div>
  </NodeHtml>;
}

/** The example's inspector on the right, as the example shows it: for the node the visitor selects, otherwise for the scene's opening node. */
function SceneInspectorPanel({ inspector }: { inspector: SceneInspector }) {
  const selected = useScene().selection?.nodeId ?? inspector.initial;
  return <DataPanel className="hud-side-panel landing-inspector" label={inspector.label} density="compact"><HudNodePreview nodeId={inspector.preview(selected)} />{inspector.render(selected)}</DataPanel>;
}

/** Creates the scene for `id` and disposes it when another scene replaces it or the page closes. */
function BackgroundScene({ id }: { id: LandingSceneId }) {
  const [scene, setScene] = useState<LandingScene | null>(null);
  useEffect(() => {
    const value = createLandingScene(id);
    setScene(value);
    return () => { setScene(null); value.dispose(); };
  }, [id]);
  return scene && <DashboardProvider store={scene.store}><SceneViewport scene={scene} />{scene.metrics && <SceneMetricsPanel metrics={scene.metrics} />}{scene.menu && <SceneMenuRing menu={scene.menu} />}{scene.inspector && <SceneInspectorPanel inspector={scene.inspector} />}{scene.log && <AgentLogPanel log={scene.log} />}</DashboardProvider>;
}

export function LandingPage() {
  const [active, setActive] = useState(0), sceneId = SLIDE_SCENES[active];
  return <main className="landing-page">
    <SiteHeader active={null} />
    <section className="hud-viewport landing-hero" data-left-panel="none" data-panel-theme="light" aria-label="Example scene" style={{ backgroundImage: `url('${LANDING_SCENE_IMAGES[sceneId]}')` }}>
      <BackgroundScene key={sceneId} id={sceneId} />
      <IntroCarousel active={active} onShow={setActive} />
    </section>
    <div className="examples-container landing-sections">
      <footer><p>All scenes run locally with fictional data. Your host owns data, permissions and commands.</p><nav className="site-footer-links" aria-label="Footer"><Link href="/brand">Website colors</Link><Link href="/docs">Read the documentation →</Link><ProjectLinks /></nav></footer>
    </div>
  </main>;
}

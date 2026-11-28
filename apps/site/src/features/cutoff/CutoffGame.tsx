'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, ChevronDown, Crosshair, Eye, EyeOff, FastForward, Flag, Hand, MapPin, Pause, Play, RotateCcw, Timer, Trophy } from 'lucide-react';
import { DashboardProvider, NodeHtml, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { ActionRing, DataPanel, type Tone } from '@opsorama/react/ui';
import { DEFAULT_CAMERA_SETTINGS, createSceneStore, type SceneStore } from '@opsorama/core';
import type { NodeHighlight, PickTarget, ScenePointerEvent, SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import '@opsorama/ui/styles.css';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudDockStatus, HudMetrics, HudZoom, useHudMetricSize } from '../example-hud';
import { runFeedLoop, type LoopFeed } from '../ecommerce/feed-loop';
import { DEPARTMENTS, GOODS_LABELS, SKUS, minutesOf, skuGoods, type EcommerceSnapshot } from '../ecommerce/model';
import { DEFAULT_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import type { Move } from '../ecommerce/simulation';

import { QUEUE_LIMIT, SHIFT_LEVELS, SHIFT_SECONDS, createShiftGame, type ActorView, type BikeStatus, type CarrierStatus, type ChannelStatus, type ShiftGame, type ShiftNotice, type ShiftReport, type ShiftScenario, type ShiftScore } from './rules';
import { GOODS_COLORS, TARGET_TINT, actorSources, clickedNodes, faceNode, goodsLegend, markAnchor, pickTarget, rackRoom, sourceMarks, sourceTints, targetMarks, targetTints } from './menu';
import { FLOAT_SECONDS, lightingAt, moveLabel, playNodes, type Floating } from './scene';
import { cutoffHudMetrics, plural, shelfState, toneOf } from './metrics';
import { MACHINES, actorActions } from './ring';

/** Everything the HUD shows, read from the game at most four times a second. */
interface GameView {
  snapshot: EcommerceSnapshot; actors: ActorView[]; score: ShiftScore; channels: ChannelStatus[]; carriers: CarrierStatus[]; bike: BikeStatus;
  clock: string; time: number; over: boolean; departing: boolean; report: ShiftReport;
}
const viewOf = (game: ShiftGame): GameView => ({
  snapshot: game.snapshot(), actors: game.actors(), score: game.score(), channels: game.channels(), carriers: game.carriers(), bike: game.bike(),
  clock: game.clock, time: game.time, over: game.over, departing: game.departing, report: game.report(),
});
const LEVELS = Object.values(SHIFT_LEVELS);
const SPEEDS = [1, 2, 3] as const;
const actorNow = (actor: ActorView) => actor.waiting ?? actor.task ?? (actor.assist ? 'Works by itself' : 'Idle');
/** The shift clock some minutes on, e.g. "12:40". */
const clockPlus = (clock: string, minutes: number) => { const total = minutesOf(clock) + Math.ceil(minutes); return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };
/** A command being given: the actor, and the source once one is taken; the scene lights its sources, then its targets. */
type Commanding = { actor: string; picking: boolean; source: string | null };

function createStore(game: ShiftGame): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: playNodes(game, []) }, { zoom: DEFAULT_ZOOM, selectionStyle: 'glow', camera: { ...DEFAULT_CAMERA_SETTINGS, frameOnSelect: false }, paused: true, lighting: lightingAt(game.clock) });
}

/**
 * The scene with the game's HUD. The rules run in `rules.ts`; this component only reads them and sends commands. A command
 * takes three clicks: one of the crew (its sources are tinted), what it should take (a ghost stands at each of its targets)
 * and the ghost to bring it to. An action ring over the actor holds its commands and its assist. The shift panel on the left
 * sums up the sales channels, the crew, the stock and receiving; it folds into the bottom bar.
 */
function CutoffViewport({ game }: { game: { current: ShiftGame } }) {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null), [ready, setReady] = useState<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; setReady(value); }, []);
  const [view, setView] = useState(() => viewOf(game.current)), [generation, setGeneration] = useState(0);
  const [scenario, setScenario] = useState<ShiftScenario>(game.current.level.scenario), [seed, setSeed] = useState(game.current.seed);
  const [started, setStarted] = useState(false), [panelsVisible, setPanelsVisible] = useState(true), [panelOpen, setPanelOpen] = useState(true), [folding, setFolding] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null);
  const [commanding, setCommanding] = useState<Commanding | null>(null);
  const { metricSize } = useHudMetricSize();
  const nextFloat = useRef(1), floats = useRef<Floating[]>([]);
  const quiet = useRef(false), quietRevision = useRef(0);

  // The scene clock drives the game: pause and speed apply to both.
  useEffect(() => {
    const feed: LoopFeed<GameView> = {
      // While point changes float, every step republishes so they rise.
      get sceneRevision() { return game.current.sceneRevision + quietRevision.current * 1e6 + (floats.current.length ? Math.round(game.current.time * 10) : 0); }, get recordsRevision() { return game.current.recordsRevision; },
      advance: seconds => game.current.advance(seconds),
      nodes: () => { const time = game.current.time; floats.current = floats.current.filter(item => time - item.start < FLOAT_SECONDS); return playNodes(game.current, floats.current, quiet.current); },
      snapshot: () => viewOf(game.current),
    };
    return runFeedLoop({ feed: () => feed, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords: setView });
  }, [store, game]);
  // Sales float their points over the scene; a command that could no longer start says why.
  useEffect(() => game.current.subscribe((notice: ShiftNotice) => {
    if (notice.type === 'scored') floats.current.push({ id: nextFloat.current++, points: notice.points, at: notice.at, start: notice.time });
    if (notice.type === 'move-ended' && notice.outcome === 'refused') setMessage({ text: `${moveLabel(notice.move)}: ${notice.reason}`, tone: 'critical' });
  }), [game, generation]);
  // Time of day: studio light by day, dusk from 16:00.
  const lighting = lightingAt(view.clock);
  useEffect(() => { if (store.getSnapshot().settings.lighting !== lighting) store.configure({ lighting }); }, [store, lighting]);

  // The sources of the commanded actor and the chosen source, read when the game's records change.
  const sources = useMemo(() => commanding ? actorSources(commanding.actor, view.snapshot, (subject, actor) => game.current.options(subject, actor), view.actors.flatMap(actor => actor.queue)) : [], [commanding, view, game]);
  const source = commanding?.source ? sources.find(item => item.node === commanding.source) : undefined;
  // Pills light the sources of the commanded actor, then the targets of the chosen source; the problem markers step aside.
  // The card unfolds only in its first mount for a newly commanded actor, not when it mounts again for Move or a source.
  const ringKey = commanding ? `${commanding.actor}:${commanding.picking}:${commanding.source ?? ''}` : '', unfoldKey = useRef<string | null>(null);
  if (commanding && unfoldKey.current === `new:${commanding.actor}`) unfoldKey.current = ringKey;
  const marks = useMemo(() => !commanding?.picking ? [] : source ? targetMarks(source, view.snapshot) : sourceMarks(sources), [commanding, source, sources, view]);
  useEffect(() => {
    quiet.current = !!commanding?.picking; quietRevision.current++;
    store.replace(playNodes(game.current, floats.current, quiet.current));
  }, [commanding, store, game]);
  // The scene shows the command: what the actor can take is tinted; once a source is taken it stays tinted, and a ghost of the
  // material stands at each place it can go (a target that has to wait, such as a full pick face, is tinted instead). A click on
  // a ghost queues the move. Both are set again only when they change, not on every update of the records.
  const tints = useMemo<NodeHighlight[]>(() => !commanding?.picking ? [] : source ? targetTints(source, view.snapshot) : sourceTints(sources), [commanding, source, sources, view]);
  const ghosts = useMemo(() => source ? source.options.flatMap(option => (option.previews ?? []).map(target => ({ target: { ...target, color: TARGET_TINT } as PickTarget, move: option.move }))) : [], [source]);
  const tintKey = JSON.stringify(tints), ghostKey = JSON.stringify(ghosts.map(item => item.target)), ghostMoves = useRef(ghosts);
  ghostMoves.current = ghosts;
  useEffect(() => { if (ready && !ready.getDiagnostics().disposed) ready.setHighlights(JSON.parse(tintKey) as NodeHighlight[]); }, [ready, tintKey]);
  useEffect(() => {
    if (!ready || ready.getDiagnostics().disposed) return;
    const targets = JSON.parse(ghostKey) as PickTarget[];
    ready.setPickTargets(targets.length ? targets : null, (_, index) => { const found = ghostMoves.current[index]; if (found) bringMove.current(found.move); });
  }, [ready, ghostKey]);
  // A source that is gone (a pallet taken by someone else, a truck that left) falls back to choosing a source.
  useEffect(() => { if (commanding?.source && !source) setCommanding({ ...commanding, source: null }); }, [commanding, source]);

  const refresh = () => setView(viewOf(game.current));
  const command = (run: () => void, text: string) => {
    try { run(); setMessage({ text, tone: 'success' }); return true; } catch (failure) { setMessage({ text: failure instanceof Error ? failure.message : String(failure), tone: 'critical' }); return false; } finally { refresh(); }
  };
  const actorOf = (id: string) => view.actors.find(item => item.id === id);
  const show = (node: string) => { const value = renderer.current; if (value && !value.getDiagnostics().disposed) void value.frame(node); };
  const close = () => { setCommanding(null); store.select(null); };
  /** Command one of the crew: its sources light up and its menu opens over it. */
  const commandActor = (id: string) => { if (commanding?.actor !== id) unfoldKey.current = `new:${id}`; setCommanding({ actor: id, picking: false, source: null }); setMessage(null); store.select(id, 'keyboard'); };
  /** The ring's Move command: what the actor can take lights up, or goes dark again on a second press. */
  const toggleMove = () => { if (commanding) setCommanding({ actor: commanding.actor, picking: !commanding.picking, source: null }); setMessage(null); };
  /** Take a source: its targets light up. */
  const takeSource = (node: string) => { if (!commanding) return; setCommanding({ actor: commanding.actor, picking: true, source: node }); setMessage(null); };
  /** Bring the chosen source to a lit target. */
  const bringTo = (key: string) => {
    const found = source && pickTarget(source, [key], game.current.snapshot());
    if (found && 'option' in found) bring(found.option.move);
  };
  /** Queue the move to a target; the actor stays commanded for the next one. */
  const bring = (move: Move) => {
    if (!commanding) return;
    const actor = actorOf(commanding.actor)!;
    if (command(() => game.current.move(actor.id, move), `${actor.label}: ${moveLabel(move)}.`)) setCommanding({ actor: actor.id, picking: false, source: null });
  };
  const bringMove = useRef(bring); bringMove.current = bring;
  // Escape goes back one step: from the targets to the sources, then out of the command.
  const back = useRef(() => {}); back.current = () => {
    if (commanding?.source) setCommanding({ ...commanding, source: null });
    else if (commanding?.picking) setCommanding({ ...commanding, picking: false });
    else if (commanding) close();
    else if (store.getSnapshot().selection) store.select(null);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') back.current(); };
    document.addEventListener('keydown', cancel); return () => document.removeEventListener('keydown', cancel);
  }, []);
  // A click on one of the crew commands it; while it is commanded, a click takes a tinted source, then picks a target (a click on a
  // ghost reaches bringTo through the renderer). A click anywhere else ends the command, so the ring hides, and selects as usual.
  const pointer = useRef<(event: ScenePointerEvent) => void>(() => {}); pointer.current = event => {
    if (event.type !== 'click' || view.over) return;
    const nodes = event.nodeId ? clickedNodes(event.nodeId, event.ancestors, game.current.snapshot()) : [];
    const actor = nodes.find(id => view.actors.some(item => item.id === id));
    if (actor) { event.preventSelection(); commandActor(actor); return; }
    if (!commanding) return;
    if (!commanding.picking) { /* a click elsewhere: the ring hides below */ }
    else if (!source) {
      const taken = sources.find(item => nodes.includes(item.node));
      if (taken) { event.preventSelection(); takeSource(taken.node); return; }
    } else {
      const found = pickTarget(source, nodes, game.current.snapshot());
      if (found && 'option' in found) { event.preventSelection(); bring(found.option.move); return; }
      if (found) { event.preventSelection(); setMessage({ text: `${found.refused.target}: ${found.refused.reason}`, tone: 'critical' }); return; }
    }
    setCommanding(null); setMessage(null);
  };
  const onPointer = useCallback((event: ScenePointerEvent) => pointer.current(event), []);

  const restart = (level: ShiftScenario, value: number) => {
    game.current.dispose();
    game.current = createShiftGame({ scenario: level, seed: value });
    floats.current = []; quiet.current = false;
    setCommanding(null);
    store.select(null); store.replace(playNodes(game.current, [])); store.configure({ paused: true, lighting: lightingAt(game.current.clock) });
    setMessage(null); setStarted(false); setScenario(level); setSeed(value); setGeneration(current => current + 1); refresh();
  };
  const start = () => { setStarted(true); store.configure({ paused: false }); };
  const finish = () => { close(); game.current.advance(SHIFT_SECONDS); refresh(); };
  const overview = () => { const value = renderer.current; if (value && !value.getDiagnostics().disposed) value.overview(); close(); };
  // A choice from the panel takes it when it is a lit source of the commanded actor; otherwise it selects and centres it.
  const select = (node: string) => {
    if (commanding?.picking && !source && sources.some(item => item.node === node)) { takeSource(node); return; }
    store.select(node, 'keyboard'); show(node);
  };
  const send = (carrier: CarrierStatus) => command(() => game.current.depart(), `The ${carrier.name} truck leaves once no cage is on its way to it.`);

  const { snapshot, score, report, channels } = view, paused = scene.settings.paused;
  const sold = score.lines.reduce((sum, line) => sum + line.count, 0);
  const truck = view.carriers.find(item => item.loading);
  // Pallets in staging, which the reach truck puts away: buttons for them help where a click in the scene is hard.
  const staged = useMemo(() => view.snapshot.units.filter(unit => unit.kind === 'pallet' && unit.sku && unit.at === 'On the floor' && game.current.options(unit.id, 'reach-truck').some(choice => [...choice.options.map(option => option.move.kind), ...choice.refused.map(item => item.kind)].includes('put-away'))), [view, game]);
  // The shift panel folds into the bottom bar: it sinks toward the bar, then the bar shows its tab with the score.
  const fold = () => { if (folding) return; if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setPanelOpen(false); return; } setFolding(true); window.setTimeout(() => { setFolding(false); setPanelOpen(false); }, 180); };
  const scoreButton = <button type="button" className="co-panel-tab" aria-expanded={panelOpen} aria-label={`Open the shift panel, score ${score.total}`} onClick={() => setPanelOpen(true)}><Flag size={14} />Shift<strong>{score.total}</strong><ChevronDown size={14} className="co-tab-chevron" /></button>;

  return <section className="co-viewport hud-viewport" aria-label="Cut-off shift game" data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel="none" data-commanding={commanding ? 'true' : undefined}>
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} onPointer={onPointer} /></div>

    {/* The pills are the keyboard's way to take and bring: hidden until focused, so the scene shows only the tints and ghosts. */}
    {commanding && !view.over && marks.map(mark => <NodeHtml key={`${mark.kind}:${mark.key}`} nodeId={markAnchor(mark.key)} className="co-ring-anchor co-pill-anchor">
      <ActionRing density="compact" tone={mark.kind === 'source' ? 'info' : 'success'} arc={0} label={mark.kind === 'source' ? `Take ${mark.label}` : `Bring here: ${mark.label}`} actions={[{
        // Sources are many, so they are round icons named by their tooltip; the few targets carry their names.
        id: mark.key, ...(mark.kind === 'source' ? {} : { label: mark.label }), icon: mark.kind === 'source' ? <Hand /> : <MapPin />,
        ariaLabel: mark.kind === 'source' ? `Take ${mark.label}` : `Bring here: ${mark.label}`,
        onSelect: () => { if (mark.kind === 'source') takeSource(mark.key); else bringTo(mark.key); },
      }]} />
    </NodeHtml>)}
    {/* Attached HTML stacks in attach order: the ring attaches again after the pills change, so it stays on top of them. */}
    {commanding && !view.over && actorOf(commanding.actor) && <NodeHtml key={ringKey} nodeId={commanding.actor} className="co-ring-anchor">
      <ActionRing layout="card" density="compact" unfold={unfoldKey.current === ringKey} title={actorOf(commanding.actor)!.label} label={`Commands of ${actorOf(commanding.actor)!.label}`} tone={MACHINES.has(commanding.actor) ? 'warning' : 'success'}
        actions={actorActions(actorOf(commanding.actor)!, view, game.current, (run, text) => command(run, text), { picking: commanding.picking, available: sources.length > 0, toggle: toggleMove })} />
    </NodeHtml>}
    {commanding?.picking && <div className="co-picking" role="status" aria-label="Giving a command">
      <Crosshair size={15} /><span><strong>{actorOf(commanding.actor)?.label}:</strong> {source ? `taking ${source.label} · click a ghost to bring it there` : sources.length ? 'click a tinted object to take' : 'nothing to take now'} · a click elsewhere ends · Escape goes back</span>
      <button type="button" onClick={() => back.current()}>{source ? 'Back' : 'Cancel'}</button>
    </div>}

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Shift" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Timer size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">GAME / SHIFT LEAD</span><h1>Cut-off</h1></div><span className="hud-clock co-clock" role="timer" aria-label="Shift clock"><strong>{view.clock}</strong></span></div> }}>
        <div className="hud-navigation-control">
          <label htmlFor="co-level">Level</label>
          <select id="co-level" aria-label="Level" value={scenario} onChange={event => restart(event.target.value as ShiftScenario, seed)}>{LEVELS.map(item => <option key={item.scenario} value={item.scenario}>{item.title}</option>)}</select>
          <label htmlFor="co-seed">Seed</label>
          <input id="co-seed" className="co-seed" aria-label="Seed" type="number" min={1} max={9999} value={seed} onChange={event => setSeed(Math.max(1, Math.min(9999, Math.round(Number(event.target.value) || 1))))} />
          <button type="button" onClick={() => restart(scenario, seed)}><RotateCcw size={13} />New shift</button>
        </div>
      </DataPanel>
      <HudMetrics label="Shift metrics" size={metricSize} metrics={cutoffHudMetrics(view)} />
    </div>}

    {panelsVisible && panelOpen && <DataPanel id="co-shift-panel" className={`hud-floating-panel co-summary${folding ? ' co-folding' : ''}`} title="Shift" label="Shift summary" description="Every item sold scores its channel's points · keep the shelves and outlets supplied" density="compact" slots={{ icon: <Flag size={16} />, actions: <button type="button" className="co-fold" aria-label="Fold the shift panel into the bottom bar" title="Fold into the bottom bar" onClick={fold}><ChevronDown size={16} /></button> }}>
      {message && <p className="co-message" role="status" data-tone={message.tone}>{message.text}</p>}
      <section className="co-section" aria-label="Sales channels"><h3>Sales <span>{plural(sold, 'item')} · {score.total} points</span></h3>
        <table className="co-channels"><tbody>{channels.map(item => <tr key={item.id}>
          <th scope="row"><button type="button" className="co-name" onClick={() => select(item.node)}>{item.label}</button><small>{item.points} {item.points === 1 ? 'point' : 'points'} per item</small></th>
          <td>{channelNow(item, view)}{item.id === 'truck' && truck && <button type="button" className="co-send" disabled={view.departing} aria-label={`Send the ${truck.name} truck now`} onClick={() => send(truck)}>{view.departing ? 'Leaving' : 'Send'}</button>}</td>
          <td className="co-sold"><strong>{item.sold}</strong><small>+{item.sold * item.points}</small></td>
        </tr>)}</tbody></table>
      </section>
      <section className="co-section" aria-label="Crew"><h3>Crew <span>commanding: {commanding ? actorOf(commanding.actor)?.label : 'none'}</span></h3>
        <div className="co-crew">{view.actors.map(actor => <button key={actor.id} type="button" className="co-portrait" aria-pressed={actor.id === commanding?.actor} aria-label={`${actor.label}: ${actorNow(actor)}`} data-waiting={actor.waiting ? 'true' : undefined} onClick={() => commandActor(actor.id)}>
          <strong>{actor.label}</strong><span>{actorNow(actor)}</span>
          <em>{actor.queue.length}/{QUEUE_LIMIT}{actor.assist ? ' · auto' : ''}</em>
        </button>)}</div>
      </section>
      <section className="co-section" aria-label="Stock"><h3>Stock</h3><ul className="co-list">
        {DEPARTMENTS.filter(item => snapshot.shop.facings[item.id] === 0).map(item => <li key={item.id}><button type="button" className="co-name" onClick={() => select(`gondola:${item.id}:0`)}>{item.label}</button><span>Department empty: its sales are lost</span></li>)}
        {snapshot.alerts.length ? snapshot.alerts.map(alert => <li key={alert.sku}><button type="button" className="co-name" onClick={() => select(faceNode(SKUS[alert.sku].pick))}>{SKUS[alert.sku].pick}</button><span>{alert.sku} below minimum · {alert.onHand}/{alert.min}</span></li>) : <li><span>Every pick face at its minimum</span></li>}
      </ul></section>
      <section className="co-section" aria-label="Receiving"><h3>Receiving <span>{snapshot.staging} of 6 in staging</span></h3><ul className="co-list">
        {snapshot.docks.filter(dock => dock.direction === 'inbound').map(dock => <li key={dock.id}><button type="button" className="co-name" onClick={() => select(`dock:${dock.id}`)}>Dock {dock.id}</button><span><HudDockStatus status={dock.status} />{dock.pallets ? ` ${dock.pallets.total - dock.pallets.done} of ${dock.pallets.total} left` : ''}</span></li>)}
      </ul>
        {staged.length > 0 && <div className="co-staged" role="group" aria-label="Pallets in staging">{staged.map(unit => <button key={unit.id} type="button" aria-label={`Pallet ${unit.id.slice(7)} in staging, ${GOODS_LABELS[skuGoods(unit.sku!)]}`} onClick={() => select(unit.id)}><i style={{ background: GOODS_COLORS[skuGoods(unit.sku!)] }} aria-hidden="true" />{unit.id.slice(7)}</button>)}</div>}
        <p className="co-room">Free rack positions <strong>{rackRoom(snapshot).free}/{rackRoom(snapshot).total}</strong> · any pallet, any place</p>
        <ul className="co-legend" aria-label="Pallet colors by type of goods">{goodsLegend().map(item => <li key={item.goods}><i style={{ background: item.color }} aria-hidden="true" /><span>{item.label}</span></li>)}</ul>
      </section>
    </DataPanel>}

    {!started && !view.over && <div className="co-dialog-layer"><DataPanel className="co-dialog" title={SHIFT_LEVELS[scenario].title} label="Shift briefing" description={`${SHIFT_LEVELS[scenario].start} start · seed ${seed} · eight hours in eight minutes`} slots={{ icon: <Flag size={18} /> }}>
      <p>{SHIFT_LEVELS[scenario].description}</p>
      <ul className="co-rules">
        <li>Every item sold scores the points of its channel: {CHANNEL_POINTS}. Nothing else scores.</li>
        <li>Keep the shop&apos;s shelves stocked: unload the trucks, put pallets away, bring them behind the pick faces, fill the lanes and restock the departments. A shopper who finds a department empty leaves without its goods.</li>
        <li>Packers put each parcel into the roll cage of its outlet. Send the dispatcher with a cage to the click &amp; collect counter, the parcel lockers or the delivery bike before customers come and before the bike leaves on its round; carriers&apos; cages go onto their truck at D3 before its cut-off.</li>
        <li>Give a command from the card over one of the crew: Move tints what it can take; click it, then the ghost where it should go. Auto lets one work by itself, Stop ends a command, and Escape goes back. Each holds three commands.</li>
      </ul>
      <button type="button" className="co-primary" onClick={start}><Play size={14} />Start shift</button>
    </DataPanel></div>}
    {view.over && <div className="co-dialog-layer"><Report report={report} onAgain={() => restart(scenario, seed)} onNext={() => restart(LEVELS[(LEVELS.findIndex(item => item.scenario === scenario) + 1) % LEVELS.length].scenario, seed)} /></div>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        {panelsVisible && !panelOpen && <div className="hud-toolbar-group co-tab-group">{scoreButton}</div>}
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" aria-pressed={paused} aria-label={paused ? 'Resume shift' : 'Pause shift'} disabled={!started || view.over} onClick={() => store.configure({ paused: !paused })}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Resume' : 'Pause'}</button>
          {SPEEDS.map(value => <button key={value} type="button" aria-pressed={scene.settings.speed === value} aria-label={`Speed ${value}×`} onClick={() => store.configure({ speed: value })}>{value}×</button>)}
          <button type="button" disabled={!started || view.over} onClick={finish}><FastForward size={14} />Finish shift</button>
          <button type="button" onClick={overview}><Crosshair size={14} />Overview</button></div>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button><span>Click one of the crew, Move, what to take, where to bring it · Escape goes back · drag to pan</span></div>
      </DataPanel>
    </div>
  </section>;
}

/** The channels' points in words, for the briefing. */
const CHANNEL_POINTS = 'shop checkouts 1 per item, click & collect 2, parcel lockers 3, the delivery bike 3 and carrier trucks 2';
/** What a channel holds and waits for now, in words. */
function channelNow(channel: ChannelStatus, view: GameView): string {
  switch (channel.id) {
    case 'checkout': { const shelves = shelfState(view.snapshot); return `Shelves ${shelves.percent}% full${shelves.empty.length ? ` · ${shelves.empty.length} empty` : ''}`; }
    case 'counter': return `${channel.there} ready · ${channel.cage} in the cage`;
    case 'lockers': return `${channel.there} of ${channel.capacity} filled · ${channel.cage} in the cage`;
    case 'bike': return view.bike.away ? `On a round, back at ${clockPlus(view.clock, view.bike.next)} · ${channel.cage} in the cage` : `${channel.there}/${channel.capacity} loaded, leaves at ${clockPlus(view.clock, view.bike.next)} · ${channel.cage} in the cage`;
    case 'truck': {
      const truck = view.carriers.find(item => item.loading);
      return truck ? `${truck.name} at D3${truck.remaining !== null ? `, leaves at ${truck.cutoff}` : ''} · ${channel.cage} in the cages` : `No truck at D3 · ${channel.cage} in the cages`;
    }
  }
}

/** The machines among the crew; the ring shows them in the warning tone and the people in the success tone. */
function ScoreTable({ score }: { score: ShiftScore }) {
  return <section className="co-score" aria-label="Score"><h3>Sales <span>{score.total} points</span></h3><table><thead><tr><th>Channel</th><th>Items</th><th>Points</th></tr></thead><tbody>{score.lines.map(line => <tr key={line.id}><td>{line.label}</td><td>{line.count}</td><td data-tone={toneOf(line.points)}>{line.points ? `+${line.points}` : '0'}</td></tr>)}</tbody></table></section>;
}

function Report({ report, onAgain, onNext }: { report: ShiftReport; onAgain(): void; onNext(): void }) {
  return <DataPanel className="co-dialog co-report" title="End of shift" label="End of shift report" description={`${report.level.title} · seed ${report.seed} · ${report.clock}`} slots={{ icon: <Trophy size={18} /> }}>
    <p className="co-total">Score <strong>{report.score.total}</strong></p>
    <ScoreTable score={report.score} />
    <ul className="co-totals">
      <li><strong>{report.unloaded}</strong> pallets unloaded</li><li><strong>{report.putAway}</strong> pallets put away</li>
      <li><strong>{report.replenished}</strong> cartons into pick faces</li><li><strong>{report.restocked}</strong> cartons to the shop</li>
    </ul>
    <div className="co-actions"><button type="button" className="co-primary" onClick={onAgain}><RotateCcw size={14} />Play again</button><button type="button" onClick={onNext}><Boxes size={14} />Next level</button></div>
  </DataPanel>;
}

export function CutoffGame() {
  const [session, setSession] = useState<{ store: SceneStore; game: { current: ShiftGame } } | null>(null);
  // The session owns the store and the game; a new shift swaps the game inside the same holder.
  useEffect(() => {
    const game = { current: createShiftGame({ scenario: 'peak', seed: 1 }) }, store = createStore(game.current);
    setSession({ store, game });
    return () => { game.current.dispose(); store.dispose(); };
  }, []);
  return <main className="hud-page cutoff-page"><SiteHeader />{session ? <DashboardProvider store={session.store}><CutoffViewport game={session.game} /></DashboardProvider> : <p className="ec-preparing">Preparing the shift…</p>}</main>;
}

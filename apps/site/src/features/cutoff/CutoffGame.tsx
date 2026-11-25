'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Bell, Boxes, ChevronLeft, Clock3, Crosshair, Eye, EyeOff, FastForward, Flag, Info, Pause, Play, RotateCcw, Timer, Trophy, Truck } from 'lucide-react';
import { DashboardProvider, NodeHtml, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { ActivityFeed, DataPanel, StatusBadge, type Tone } from '@opsorama/react/ui';
import { DEFAULT_CAMERA_SETTINGS, createSceneStore, type SceneStore } from '@opsorama/core';
import type { ScenePointerEvent, SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import '@opsorama/ui/styles.css';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudDockStatus, HudMetrics, HudZoom, useHudMetricSize } from '../example-hud';
import { runFeedLoop, type LoopFeed } from '../ecommerce/feed-loop';
import { DEPARTMENTS, GOODS_LABELS, SKUS, carrier as carrierOf, skuGoods, type EcommerceScenario, type EcommerceSnapshot } from '../ecommerce/model';
import { DEFAULT_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import type { Move } from '../ecommerce/simulation';

import { QUEUE_LIMIT, SHIFT_LEVELS, SHIFT_SECONDS, createShiftGame, type ActorView, type CarrierStatus, type ShiftDecisions, type ShiftEvent, type ShiftGame, type ShiftNotice, type ShiftReport, type ShiftScore } from './rules';
import { GOODS_COLORS, actorSources, clickedNodes, faceNode, detailOf, eventNode, pickTarget, rackRoom, sourceMarks, targetMarks, type LitMark, type Source } from './menu';
import { FLOAT_SECONDS, lightingAt, moveLabel, playNodes, type Floating } from './scene';

/** Everything the HUD shows, read from the game at most four times a second. */
interface GameView {
  snapshot: EcommerceSnapshot; actors: ActorView[]; score: ShiftScore; events: readonly ShiftEvent[]; decisions: ShiftDecisions; carriers: CarrierStatus[];
  clock: string; time: number; over: boolean; report: ShiftReport;
}
const viewOf = (game: ShiftGame): GameView => ({
  snapshot: game.snapshot(), actors: game.actors(), score: game.score(), events: game.events(), decisions: game.decisions(), carriers: game.carriers(),
  clock: game.clock, time: game.time, over: game.over, report: game.report(),
});
const LEVELS = Object.values(SHIFT_LEVELS);
const SPEEDS = [1, 2, 3] as const;
const LOG_SIZE = 14;
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
const toneOf = (value: number): Tone => value > 0 ? 'success' : value < 0 ? 'critical' : 'neutral';
const minutesLeft = (deadline: number, time: number) => Math.max(0, Math.ceil(deadline - time));
const actorNow = (actor: ActorView) => actor.waiting ?? actor.task ?? (actor.assist ? 'Works by itself' : 'Idle');
type LogEntry = { id: number; time: string; text: string; points?: number };
/** A command being given: the actor, and the source once one is taken; the scene lights its sources, then its targets. */
type Commanding = { actor: string; source: string | null };

function createStore(game: ShiftGame): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: playNodes(game, []) }, { zoom: DEFAULT_ZOOM, selectionStyle: 'glow', camera: { ...DEFAULT_CAMERA_SETTINGS, frameOnSelect: false }, paused: true, lighting: lightingAt(game.level, game.clock) });
}

/**
 * The scene with the game's HUD. The rules run in `rules.ts`; this component only reads them and sends commands. A command
 * takes three clicks: one of the crew (its sources light up), what it should take (its targets light up) and where to bring
 * it. A menu over the actor lists the same sources and targets, its commands and its assist. The left panel sums up the
 * shift, the right one details the selected object.
 */
function CutoffViewport({ game }: { game: { current: ShiftGame } }) {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [view, setView] = useState(() => viewOf(game.current)), [generation, setGeneration] = useState(0);
  const [scenario, setScenario] = useState<EcommerceScenario>(game.current.level.scenario), [seed, setSeed] = useState(game.current.seed);
  const [started, setStarted] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null), [log, setLog] = useState<LogEntry[]>([]);
  const [commanding, setCommanding] = useState<Commanding | null>(null);
  const { metricSize } = useHudMetricSize();
  const selection = scene.selection?.nodeId ?? null;
  const pending = useRef<LogEntry[]>([]), nextLog = useRef(1), floats = useRef<Floating[]>([]);
  const lit = useRef<LitMark[]>([]), litRevision = useRef(0);

  // The scene clock drives the game: pause and speed apply to both.
  useEffect(() => {
    const feed: LoopFeed<GameView> = {
      // While point changes float, every step republishes so they rise.
      get sceneRevision() { return game.current.sceneRevision + litRevision.current * 1e6 + (floats.current.length ? Math.round(game.current.time * 10) : 0); }, get recordsRevision() { return game.current.recordsRevision; },
      advance: seconds => game.current.advance(seconds),
      nodes: () => { const time = game.current.time; floats.current = floats.current.filter(item => time - item.start < FLOAT_SECONDS); return playNodes(game.current, floats.current, lit.current); },
      snapshot: () => viewOf(game.current),
    };
    return runFeedLoop({ feed: () => feed, clock: () => store.getSnapshot().settings, onScene: nodes => store.replace(nodes), onRecords: value => { setView(value); if (pending.current.length) { const entries = pending.current.splice(0); setLog(current => [...entries.reverse(), ...current].slice(0, LOG_SIZE)); } } });
  }, [store, game]);
  // Notices of the current game feed the shift log.
  useEffect(() => game.current.subscribe((notice: ShiftNotice) => {
    const time = game.current.clock, add = (text: string, points?: number) => pending.current.push({ id: nextLog.current++, time, text, ...(points !== undefined ? { points } : {}) });
    if (notice.type === 'scored') { add(notice.text, notice.points); if (notice.at) floats.current.push({ id: nextLog.current, points: notice.points, at: notice.at, start: notice.time }); }
    if (notice.type === 'event-opened') add(`${notice.event.title}: ${notice.event.text}`);
    if (notice.type === 'cutoff') add(`${carrierOf(notice.carrier).name} cut-off: ${notice.missed} ${notice.missed === 1 ? 'order' : 'orders'} missed`);
    if (notice.type === 'move-ended' && notice.outcome === 'refused') add(`${moveLabel(notice.move)}: ${notice.reason}`);
    if (notice.type === 'move-dropped') add(`${moveLabel(notice.move)}: dropped for an event's command`);
    if (notice.type === 'departed') add(`${carrierOf(notice.carrier).name} truck left${notice.sent ? '' : ' at its cut-off'}`);
  }), [game, generation]);
  // Time of day: studio light by day, dusk from 16:00, night light on the night shift.
  const lighting = lightingAt(game.current.level, view.clock);
  useEffect(() => { if (store.getSnapshot().settings.lighting !== lighting) store.configure({ lighting }); }, [store, lighting]);

  // The sources of the commanded actor and the chosen source, read when the game's records change.
  const sources = useMemo(() => commanding ? actorSources(commanding.actor, view.snapshot, (subject, actor) => game.current.options(subject, actor), view.actors.flatMap(actor => actor.queue)) : [], [commanding, view, game]);
  const source = commanding?.source ? sources.find(item => item.node === commanding.source) : undefined;
  // The scene lights the sources of the commanded actor, then the targets of the chosen source.
  const marks = useMemo(() => !commanding ? [] : source ? targetMarks(source, view.snapshot) : sourceMarks(sources), [commanding, source, sources, view]);
  const marksKey = marks.map(mark => `${mark.kind}:${mark.key}:${mark.label}`).join('|');
  useEffect(() => {
    lit.current = marks; litRevision.current++;
    store.replace(playNodes(game.current, floats.current, lit.current));
    // marksKey stands for marks: the scene is published again only when the lights change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey, store, game]);
  // A source that is gone (a pallet taken by someone else, a truck that left) falls back to choosing a source.
  useEffect(() => { if (commanding?.source && !source) setCommanding({ actor: commanding.actor, source: null }); }, [commanding, source]);

  const refresh = () => setView(viewOf(game.current));
  const command = (run: () => void, text: string) => {
    try { run(); setMessage({ text, tone: 'success' }); return true; } catch (failure) { setMessage({ text: failure instanceof Error ? failure.message : String(failure), tone: 'critical' }); return false; } finally { refresh(); }
  };
  const actorOf = (id: string) => view.actors.find(item => item.id === id);
  const show = (node: string) => { const value = renderer.current; if (value && !value.getDiagnostics().disposed) void value.frame(node); };
  const close = () => { setCommanding(null); store.select(null); };
  /** Command one of the crew: its sources light up and its menu opens over it. */
  const commandActor = (id: string) => { setCommanding({ actor: id, source: null }); setMessage(null); store.select(id, 'keyboard'); };
  /** Take a source: its targets light up. */
  const takeSource = (node: string) => { if (!commanding) return; setCommanding({ actor: commanding.actor, source: node }); setMessage(null); };
  /** Queue the move to a target; the actor stays commanded for the next one. */
  const bring = (move: Move) => {
    if (!commanding) return;
    const actor = actorOf(commanding.actor)!;
    if (command(() => game.current.move(actor.id, move), `${actor.label}: ${moveLabel(move)}.`)) setCommanding({ actor: actor.id, source: null });
  };
  // Escape goes back one step: from the targets to the sources, then out of the command.
  const back = useRef(() => {}); back.current = () => {
    if (commanding?.source) setCommanding({ actor: commanding.actor, source: null });
    else if (commanding) close();
    else if (store.getSnapshot().selection) store.select(null);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') back.current(); };
    document.addEventListener('keydown', cancel); return () => document.removeEventListener('keydown', cancel);
  }, []);
  // A click on one of the crew commands it; while it is commanded, a click takes a lit source, then picks a lit target.
  const pointer = useRef<(event: ScenePointerEvent) => void>(() => {}); pointer.current = event => {
    if (event.type !== 'click' || view.over) return;
    const nodes = event.nodeId ? clickedNodes(event.nodeId, event.ancestors, game.current.snapshot()) : [];
    const actor = nodes.find(id => view.actors.some(item => item.id === id));
    if (actor) { event.preventSelection(); commandActor(actor); return; }
    if (!commanding) return;
    event.preventSelection();
    if (!nodes.length) { back.current(); return; }
    const label = actorOf(commanding.actor)?.label ?? 'The actor';
    if (!source) {
      const taken = sources.find(item => nodes.includes(item.node));
      if (taken) takeSource(taken.node); else setMessage({ text: `${label} cannot take that. Click a lit object, or press Escape.`, tone: 'neutral' });
      return;
    }
    const found = pickTarget(source, nodes, game.current.snapshot());
    if (!found) setMessage({ text: `Not a target for ${source.label}. Click a lit target, or press Escape.`, tone: 'neutral' });
    else if ('refused' in found) setMessage({ text: `${found.refused.target}: ${found.refused.reason}`, tone: 'critical' });
    else bring(found.option.move);
  };
  const onPointer = useCallback((event: ScenePointerEvent) => pointer.current(event), []);

  const restart = (level: EcommerceScenario, value: number) => {
    game.current.dispose();
    game.current = createShiftGame({ scenario: level, seed: value });
    floats.current = []; lit.current = [];
    setCommanding(null);
    store.select(null); store.replace(playNodes(game.current, [])); store.configure({ paused: true, lighting: lightingAt(game.current.level, game.current.clock) });
    pending.current = []; setLog([]); setMessage(null); setStarted(false); setScenario(level); setSeed(value); setGeneration(current => current + 1); refresh();
  };
  const start = () => { setStarted(true); store.configure({ paused: false }); };
  const finish = () => { close(); game.current.advance(SHIFT_SECONDS); refresh(); };
  const overview = () => { const value = renderer.current; if (value && !value.getDiagnostics().disposed) value.overview(); close(); };
  // A choice from the panels takes it when it is a lit source of the commanded actor; otherwise it selects and centres it.
  const select = (node: string) => {
    if (commanding && !source && sources.some(item => item.node === node)) { takeSource(node); return; }
    store.select(node, 'keyboard'); show(node);
  };

  const { snapshot, score, decisions, report } = view, paused = scene.settings.paused;
  const next = view.carriers.filter(item => item.remaining !== null).sort((a, b) => a.remaining! - b.remaining!)[0];
  const present = new Set(scene.nodes.map(node => node.id));
  const eventNodes = view.events.map(event => ({ event, node: eventNode(snapshot, event) })).map(item => ({ ...item, node: item.node && present.has(item.node) ? item.node : undefined }));
  // Pallets in staging, which the reach truck puts away: buttons for them help where a click in the scene is hard.
  const staged = useMemo(() => view.snapshot.units.filter(unit => unit.kind === 'pallet' && unit.sku && unit.at === 'On the floor' && game.current.options(unit.id, 'reach-truck').some(choice => [...choice.options.map(option => option.move.kind), ...choice.refused.map(item => item.kind)].includes('put-away'))), [view, game]);
  const detailNode = commanding?.source ?? selection;
  // Options are read when the game's records change, not on every scene frame.
  const detail = useMemo(() => detailNode ? detailOf(detailNode, {
    snapshot: view.snapshot, actors: view.actors, carriers: view.carriers, choices: game.current.options(detailNode),
    count: id => { const node = store.getSnapshot().nodes.find(item => item.id === id); return node && 'count' in node && typeof node.count === 'number' ? node.count : undefined; },
  }) : null, [detailNode, view, game, store]);

  return <section className="co-viewport hud-viewport" aria-label="Cut-off shift game" data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel="none" data-side-panel="events" data-commanding={commanding ? 'true' : undefined}>
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} onPointer={onPointer} /></div>

    {commanding && !view.over && actorOf(commanding.actor) && <NodeHtml nodeId={commanding.actor} className="co-menu-anchor">
      <ActorMenu key={`${commanding.actor}:${commanding.source ?? ''}`} actor={actorOf(commanding.actor)!} game={game.current} view={view} sources={sources} source={source}
        onTake={takeSource} onBring={bring} onBack={() => back.current()} onCommand={(run, text) => command(run, text)} onClose={close} />
    </NodeHtml>}
    {!view.over && eventNodes.filter(item => item.node).map(({ event, node }) => <NodeHtml key={event.id} nodeId={node!} align="below" className="co-event-anchor">
      <EventCard event={event} time={view.time} onAnswer={choice => command(() => game.current.answer(event.id, choice.id), `${event.title}: ${choice.label}.`)} />
    </NodeHtml>)}
    {commanding && <div className="co-picking" role="status" aria-label="Giving a command">
      <Crosshair size={15} /><span><strong>{actorOf(commanding.actor)?.label}:</strong> {source ? `bring ${source.label} to a lit target` : sources.length ? 'click a lit object to take' : 'nothing to take now'} · Escape goes back</span>
      <button type="button" onClick={() => back.current()}>{source ? 'Back' : 'Done'}</button>
    </div>}

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Shift" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Timer size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">GAME / SHIFT LEAD</span><h1>Cut-off</h1></div><span className="hud-clock co-clock" role="timer" aria-label="Shift clock"><strong>{view.clock}</strong></span></div> }}>
        <div className="hud-navigation-control">
          <label htmlFor="co-level">Level</label>
          <select id="co-level" aria-label="Level" value={scenario} onChange={event => restart(event.target.value as EcommerceScenario, seed)}>{LEVELS.map(item => <option key={item.scenario} value={item.scenario}>{item.title}</option>)}</select>
          <label htmlFor="co-seed">Seed</label>
          <input id="co-seed" className="co-seed" aria-label="Seed" type="number" min={1} max={9999} value={seed} onChange={event => setSeed(Math.max(1, Math.min(9999, Math.round(Number(event.target.value) || 1))))} />
          <button type="button" onClick={() => restart(scenario, seed)}><RotateCcw size={13} />New shift</button>
        </div>
      </DataPanel>
      <HudMetrics label="Shift metrics" size={metricSize} metrics={[
        { id: 'score', title: 'Score', value: score.total, tone: toneOf(score.total), comparison: `${report.carriers.reduce((sum, item) => sum + item.onTime, 0)} shipped on time · ${report.carriers.reduce((sum, item) => sum + item.late, 0)} late`, icon: <Trophy size={16} /> },
        { id: 'cutoff', title: 'Next cut-off', value: next ? `${Math.ceil(next.remaining!)} min` : '—', tone: !next ? 'neutral' : next.open && next.remaining! < 45 ? 'critical' : next.open ? 'warning' : 'success', comparison: next ? `${next.name} ${next.cutoff} · ${next.open} ${next.open === 1 ? 'order' : 'orders'} in the building` : 'No cut-off on this shift', icon: <Clock3 size={16} /> },
        { id: 'material', title: 'Pallets put away', value: report.putAway, tone: report.putAway ? 'success' : 'neutral', comparison: `${report.unloaded} unloaded · ${snapshot.staging} in staging · ${snapshot.alerts.length} pick ${snapshot.alerts.length === 1 ? 'face' : 'faces'} low`, icon: <Boxes size={16} /> },
        { id: 'events', title: 'Open events', value: view.events.length, tone: view.events.length ? 'warning' : 'success', comparison: view.events.length ? `Answer within ${minutesLeft(Math.min(...view.events.map(item => item.deadline)), view.time)} min` : `${report.events.length} answered`, icon: <Bell size={16} /> },
      ]} />
    </div>}

    {panelsVisible && <DataPanel className="hud-floating-panel co-summary" title="Shift" label="Shift summary" description="Click one of the crew, then what to take and where to bring it · Escape goes back" density="compact" slots={{ icon: <Flag size={16} /> }}>
      {message && <p className="co-message" role="status" data-tone={message.tone}>{message.text}</p>}
      <section className="co-section" aria-label="Crew"><h3>Crew <span>commanding: {commanding ? actorOf(commanding.actor)?.label : 'none'}</span></h3>
        <div className="co-crew">{view.actors.map(actor => <button key={actor.id} type="button" className="co-portrait" aria-pressed={actor.id === commanding?.actor} aria-label={`${actor.label}: ${actorNow(actor)}`} data-waiting={actor.waiting ? 'true' : undefined} onClick={() => commandActor(actor.id)}>
          <strong>{actor.label}</strong><span>{actorNow(actor)}</span>
          <em>{actor.queue.length}/{QUEUE_LIMIT}{actor.assist ? ' · auto' : ''}</em>
        </button>)}</div>
      </section>
      <section className="co-section" aria-label="Receiving"><h3>Receiving <span>{snapshot.staging} of 6 in staging</span></h3><ul className="co-list">
        {snapshot.docks.filter(dock => dock.direction === 'inbound').map(dock => {
          const late = decisions.late[dock.id];
          return <li key={dock.id}><button type="button" className="co-name" onClick={() => select(`dock:${dock.id}`)}>Dock {dock.id}</button><span><HudDockStatus status={dock.status} />{dock.pallets ? ` ${dock.pallets.total - dock.pallets.done} of ${dock.pallets.total} left` : ''}{late !== undefined ? ` · late${Number.isFinite(late) ? ` for ${minutesLeft(late, view.time)} min` : ''}` : ''}</span></li>;
        })}
      </ul>
        {staged.length > 0 && <div className="co-staged" role="group" aria-label="Pallets in staging">{staged.map(unit => <button key={unit.id} type="button" aria-label={`Pallet ${unit.id.slice(7)} in staging, ${GOODS_LABELS[skuGoods(unit.sku!)]}`} onClick={() => select(unit.id)}><i style={{ background: GOODS_COLORS[skuGoods(unit.sku!)] }} aria-hidden="true" />{unit.id.slice(7)}</button>)}</div>}
        <ul className="co-legend" aria-label="Free rack positions by type of goods">{rackRoom(snapshot).map(item => <li key={item.goods}><i style={{ background: item.color }} aria-hidden="true" /><span>{item.label}</span><strong>{item.free}/{item.total}</strong></li>)}</ul>
      </section>
      <section className="co-section" aria-label="Stock"><h3>Stock</h3><ul className="co-list">
        {snapshot.alerts.length ? snapshot.alerts.map(alert => <li key={alert.sku}><button type="button" className="co-name" onClick={() => select(faceNode(SKUS[alert.sku].pick))}>{SKUS[alert.sku].pick}</button><span>{alert.sku} below minimum · {alert.onHand}/{alert.min}</span></li>) : <li><span>Every pick face at its minimum</span></li>}
        {snapshot.shopOpen && DEPARTMENTS.filter(item => snapshot.shop.facings[item.id] === 0).map(item => <li key={item.id}><button type="button" className="co-name" onClick={() => select(`gondola:${item.id}:0`)}>{item.label}</button><span>Department empty</span></li>)}
      </ul></section>
      <section className="co-section" aria-label="Shipping"><h3>Shipping</h3><ul className="co-list">{view.carriers.map(item => <li key={item.carrier}><strong>{item.name}</strong><span>{item.cutoff}{item.remaining !== null ? ` · ${Math.ceil(item.remaining)} min left` : ' · passed or none'} · {item.open} open</span>
        {item.loading && <button type="button" disabled={decisions.departing} aria-label={`Send the ${item.name} truck now`} onClick={() => command(() => game.current.depart(), `The ${item.name} truck leaves once no cage is on its way.`)}>{decisions.departing ? 'Leaving' : 'Send'}</button>}</li>)}</ul></section>
      <section className="co-section" aria-label="Open events"><h3>Events</h3>{eventNodes.length ? <ul className="co-list">{eventNodes.map(({ event, node }) => <li key={event.id}><strong>{event.title}</strong><span>{minutesLeft(event.deadline, view.time)} min to decide</span>
        {node ? <button type="button" onClick={() => show(node)}>Show</button> : <EventCard event={event} time={view.time} onAnswer={choice => command(() => game.current.answer(event.id, choice.id), `${event.title}: ${choice.label}.`)} />}</li>)}</ul> : <p className="co-empty">No events right now.</p>}</section>
    </DataPanel>}

    {panelsVisible && <DataPanel className="hud-side-panel co-side" title={detail?.title ?? 'Detail'} label="Detail" description={detail?.eyebrow ?? 'Nothing selected'} density="compact" slots={{ icon: <Info size={16} /> }}>
      <section className="co-detail" aria-label="Selected object">{detail
        ? <dl>{detail.color && <div><dt>Color</dt><dd><i className="co-swatch" style={{ background: detail.color }} aria-hidden="true" />type of goods</dd></div>}{detail.lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>
        : <p className="co-empty">{selection ? 'Nothing to tell about this object.' : 'Click one of the crew to give a command, or any truck dock, pallet, rack, pick face, gondola or roll cage for its detail.'}</p>}</section>
      <ScoreTable score={score} />
      <ActivityFeed className="co-log" title="Shift log" label="Shift log" density="compact" items={log.map(entry => ({ id: String(entry.id), timeLabel: entry.time, content: entry.text, ...(entry.points !== undefined ? { meta: <StatusBadge label={signed(entry.points)} tone={toneOf(entry.points)} /> } : {}) }))} />
    </DataPanel>}

    {!started && !view.over && <div className="co-dialog-layer"><DataPanel className="co-dialog" title={SHIFT_LEVELS[scenario].title} label="Shift briefing" description={`${SHIFT_LEVELS[scenario].start} start · seed ${seed} · eight hours in eight minutes`} slots={{ icon: <Flag size={18} /> }}>
      <p>{SHIFT_LEVELS[scenario].description}</p>
      <ul className="co-rules">
        <li>Receive, put away, replenish, restock and ship: the forklift, reach truck, replenisher, shelf filler and dispatcher move material only on your commands, unless they work by themselves.</li>
        <li>Give a command in three clicks: one of the crew (what it can take lights up), the pallet, truck, pick face or roll cage to take (where it can go lights up), and the target. The menu over the crew member lists the same choices. Escape goes back.</li>
        <li>Each of the crew holds three commands; unloading, filling a pick face and restocking repeat until done. Pallets go only into racks of their type.</li>
        <li>Ship before each carrier&apos;s cut-off; trucks waiting on a dock and empty shop departments cost points. Events open over their object; without an answer the default applies after 45 minutes.</li>
      </ul>
      <button type="button" className="co-primary" onClick={start}><Play size={14} />Start shift</button>
    </DataPanel></div>}
    {view.over && <div className="co-dialog-layer"><Report report={report} onAgain={() => restart(scenario, seed)} onNext={() => restart(LEVELS[(LEVELS.findIndex(item => item.scenario === scenario) + 1) % LEVELS.length].scenario, seed)} /></div>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" aria-pressed={paused} aria-label={paused ? 'Resume shift' : 'Pause shift'} disabled={!started || view.over} onClick={() => store.configure({ paused: !paused })}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Resume' : 'Pause'}</button>
          {SPEEDS.map(value => <button key={value} type="button" aria-pressed={scene.settings.speed === value} aria-label={`Speed ${value}×`} onClick={() => store.configure({ speed: value })}>{value}×</button>)}
          <button type="button" disabled={!started || view.over} onClick={finish}><FastForward size={14} />Finish shift</button>
          <button type="button" onClick={overview}><Crosshair size={14} />Overview</button></div>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button><span>Click one of the crew, what to take, where to bring it · Escape goes back · drag to pan</span></div>
      </DataPanel>
    </div>
  </section>;
}

/** A menu over a scene node: a title, then items that the arrow keys move through; the first item takes the focus. */
function Menu({ title, eyebrow, label, children, onBack }: { title: string; eyebrow: string; label: string; children: ReactNode; onBack?(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true }); }, []);
  const keys = (event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...ref.current!.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')], index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    event.preventDefault();
  };
  return <div ref={ref} className="co-menu" role="menu" aria-label={label} onKeyDown={keys}>
    <header>{onBack && <button type="button" className="co-back" aria-label="Back" onClick={onBack}><ChevronLeft size={14} /></button>}<span><em>{eyebrow}</em><strong>{title}</strong></span></header>
    {children}
  </div>;
}
function MenuItem({ children, hint, onClick, disabled, checked, more }: { children: ReactNode; hint?: string; onClick?(): void; disabled?: boolean; checked?: boolean; more?: boolean }) {
  return <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={checked} aria-disabled={disabled || undefined} aria-haspopup={more ? 'menu' : undefined} className="co-item" onClick={disabled ? undefined : onClick} tabIndex={-1}>
    <span>{children}{more ? '…' : ''}</span>{hint && <small>{hint}</small>}
  </button>;
}

/** Sources the actor's menu lists; the scene lights them all. */
const SOURCES_SHOWN = 8;
/**
 * The menu over the commanded actor: what it does now, its commands with Stop and Cancel, its assist, and the step of the
 * command being given: the sources it can take, or the targets of the chosen source with the refused ones.
 */
function ActorMenu({ actor, game, view, sources, source, onTake, onBring, onBack, onCommand, onClose }: {
  actor: ActorView; game: ShiftGame; view: GameView; sources: readonly Source[]; source: Source | undefined;
  onTake(node: string): void; onBring(move: Move): void; onBack(): void; onCommand(run: () => void, text: string): void; onClose(): void;
}) {
  if (source) return <Menu title={source.label} eyebrow={`${actor.label.toUpperCase()} · BRING IT TO`} label={`Targets for ${source.label}`} onBack={onBack}>
    {source.options.map(option => <MenuItem key={JSON.stringify(option.move)} hint={option.waits ? `Waits: ${option.waits}` : moveLabel(option.move)} onClick={() => onBring(option.move)}>{option.target}</MenuItem>)}
    {source.refused.length > 0 && <ul className="co-refused" aria-label="Refused targets">{source.refused.slice(0, 3).map(item => <li key={item.target}><strong>{item.target}</strong> {item.reason}</li>)}{source.refused.length > 3 && <li>{source.refused.length - 3} more refused</li>}</ul>}
    <p className="co-menu-note">Or click a lit target in the scene.</p>
  </Menu>;
  const loading = actor.role === 'dispatcher' ? view.carriers.find(item => item.loading) : undefined;
  return <Menu title={actor.label} eyebrow={`CREW · ${actor.queue.length} OF ${QUEUE_LIMIT} COMMANDS`} label={`Commands of ${actor.label}`}>
    <p className="co-menu-note">{actorNow(actor)}</p>
    {actor.queue.map((move, index) => index === 0
      ? <MenuItem key={`0:${moveLabel(move)}`} hint={`Now: ${moveLabel(move)}`} onClick={() => onCommand(() => game.stop(actor.id), `${actor.label} stops after the current task.`)}>Stop after this one</MenuItem>
      : <MenuItem key={`${index}:${moveLabel(move)}`} hint={moveLabel(move)} onClick={() => onCommand(() => game.cancelMove(actor.id, index), 'Command cancelled.')}>Cancel command {index}</MenuItem>)}
    <MenuItem checked={actor.assist} hint={actor.assist ? 'Takes the automatic move without a command' : 'Waits for your commands'} onClick={() => onCommand(() => game.assist(actor.id, !actor.assist), `${actor.label} ${actor.assist ? 'waits for your commands' : 'works by itself without a command'}.`)}>Work by yourself</MenuItem>
    {loading && <MenuItem disabled={view.decisions.departing} hint={view.decisions.departing ? 'Leaves once no cage is on its way' : `Otherwise it leaves at ${loading.cutoff}`} onClick={() => onCommand(() => game.depart(), `The ${loading.name} truck leaves once no cage is on its way.`)}>Send the {loading.name} truck now</MenuItem>}
    <p className="co-menu-note">{sources.length ? `Take one of ${sources.length} lit ${sources.length === 1 ? 'object' : 'objects'}:` : 'Nothing to take now.'}</p>
    {sources.slice(0, SOURCES_SHOWN).map(item => <MenuItem key={item.node} more hint={item.options[0] ? `Best: ${item.options[0].target}` : undefined} onClick={() => onTake(item.node)}>{item.label}</MenuItem>)}
    {sources.length > SOURCES_SHOWN && <p className="co-menu-note">{sources.length - SOURCES_SHOWN} more lit in the scene</p>}
    <MenuItem onClick={onClose}>Done</MenuItem>
  </Menu>;
}

/** An open event over the object it concerns, with its countdown and choices. */
function EventCard({ event, time, onAnswer }: { event: ShiftEvent; time: number; onAnswer(choice: ShiftEvent['choices'][number]): void }) {
  return <article className="co-event" aria-label={event.title}>
    <header><strong>{event.title}</strong><span>{minutesLeft(event.deadline, time)} min to decide</span></header>
    <p>{event.text}</p>
    <div className="co-choices">{event.choices.map(choice => <button key={choice.id} type="button" onClick={() => onAnswer(choice)}><strong>{choice.label}</strong><span>{choice.effect}{choice.id === event.fallback ? ' (default)' : ''}</span></button>)}</div>
  </article>;
}

function ScoreTable({ score }: { score: ShiftScore }) {
  const lines = score.lines.filter(line => line.count || line.points);
  return <section className="co-score" aria-label="Score"><h3>Score <span>{score.total}</span></h3>{lines.length ? <table><tbody>{lines.map(line => <tr key={line.id}><td>{line.label}</td><td>{line.count}</td><td data-tone={toneOf(line.points)}>{signed(line.points)}</td></tr>)}</tbody></table> : <p className="co-empty">Nothing scored yet.</p>}</section>;
}

function Report({ report, onAgain, onNext }: { report: ShiftReport; onAgain(): void; onNext(): void }) {
  return <DataPanel className="co-dialog co-report" title="End of shift" label="End of shift report" description={`${report.level.title} · seed ${report.seed} · ${report.clock}`} slots={{ icon: <Trophy size={18} /> }}>
    <p className="co-total">Score <strong>{report.score.total}</strong></p>
    <ul className="co-totals">
      <li><strong>{report.shipped}</strong> orders shipped</li><li><strong>{report.collected}</strong> click &amp; collect</li><li><strong>{report.unloaded}</strong> pallets unloaded</li>
      <li><strong>{report.putAway}</strong> pallets put away</li><li><strong>{report.replenished}</strong> cartons into pick faces</li><li><strong>{report.restocked}</strong> cartons to the shop</li>
    </ul>
    <div className="hud-table"><table><thead><tr><th>Carrier</th><th>Cut-off</th><th>On time</th><th>Late</th><th>Missed</th></tr></thead><tbody>{report.carriers.map(item => <tr key={item.carrier}><td>{item.name}</td><td>{item.cutoff}</td><td>{item.onTime}</td><td>{item.late}</td><td>{item.missed}</td></tr>)}</tbody></table></div>
    <ScoreTable score={report.score} />
    <div className="co-actions"><button type="button" className="co-primary" onClick={onAgain}><RotateCcw size={14} />Play again</button><button type="button" onClick={onNext}><Truck size={14} />Next level</button></div>
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

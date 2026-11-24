'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Clock3, Crosshair, Eye, EyeOff, FastForward, Flag, Pause, Play, RotateCcw, ShoppingCart, Timer, Trophy, Truck, Users } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { ActivityFeed, DataPanel, StatusBadge, type Tone } from '@opsorama/react/ui';
import { createSceneStore, type SceneStore } from '@opsorama/core';
import type { ScenePointerEvent, SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import '@opsorama/ui/styles.css';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudDockStatus, HudMetrics, HudZoom, useHudMetricSize } from '../example-hud';
import { runFeedLoop, type LoopFeed } from '../ecommerce/feed-loop';
import { carrier as carrierOf, type CarrierId, type CheckoutId, type DockId, type EcommerceScenario, type EcommerceSnapshot } from '../ecommerce/model';
import { DEFAULT_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import type { StaffMember, StaffZone } from '../ecommerce/simulation';
import { SHIFT_LEVELS, SHIFT_SECONDS, createShiftGame, type CarrierStatus, type ShiftDecisions, type ShiftEvent, type ShiftGame, type ShiftNotice, type ShiftReport, type ShiftScore } from './rules';
import { FLOAT_SECONDS, ZONE_LABELS, lightingAt, movable, playNodes, zoneAt, type Floating } from './scene';

/** Everything the HUD shows, read from the game at most four times a second. */
interface GameView {
  snapshot: EcommerceSnapshot; staff: StaffMember[]; score: ShiftScore; events: readonly ShiftEvent[]; decisions: ShiftDecisions; carriers: CarrierStatus[];
  clock: string; time: number; over: boolean; report: ShiftReport;
}
const viewOf = (game: ShiftGame): GameView => ({
  snapshot: game.snapshot(), staff: game.staff(), score: game.score(), events: game.events(), decisions: game.decisions(), carriers: game.carriers(),
  clock: game.clock, time: game.time, over: game.over, report: game.report(),
});
const LEVELS = Object.values(SHIFT_LEVELS);
const SPEEDS = [1, 2, 3] as const;
const LOG_SIZE = 14;
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
const toneOf = (value: number): Tone => value > 0 ? 'success' : value < 0 ? 'critical' : 'neutral';
type LogEntry = { id: number; time: string; text: string; points?: number };

function createStore(game: ShiftGame): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: playNodes(game, null, []) }, { zoom: DEFAULT_ZOOM, selectionStyle: 'glow', paused: true, lighting: lightingAt(game.level, game.clock) });
}

/** The scene with the game's HUD. The rules run in `rules.ts`; this component only reads them and sends commands. */
function CutoffViewport({ game }: { game: { current: ShiftGame } }) {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [view, setView] = useState(() => viewOf(game.current)), [generation, setGeneration] = useState(0);
  const [scenario, setScenario] = useState<EcommerceScenario>(game.current.level.scenario), [seed, setSeed] = useState(game.current.seed);
  const [started, setStarted] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null), [log, setLog] = useState<LogEntry[]>([]);
  const { metricSize } = useHudMetricSize();
  const selection = scene.selection?.nodeId ?? null, selected = useRef<string | null>(null);
  const pending = useRef<LogEntry[]>([]), nextLog = useRef(1), floats = useRef<Floating[]>([]);
  const person = view.staff.find(item => item.id === selection);
  const armed = movable(person) ? person! : null;
  selected.current = armed?.id ?? null;

  // The scene clock drives the game: pause and speed apply to both.
  useEffect(() => {
    const feed: LoopFeed<GameView> = {
      // While point changes float, every step republishes so they rise.
      get sceneRevision() { return game.current.sceneRevision + (floats.current.length ? Math.round(game.current.time * 10) : 0); }, get recordsRevision() { return game.current.recordsRevision; },
      advance: seconds => game.current.advance(seconds),
      nodes: () => { const time = game.current.time; floats.current = floats.current.filter(item => time - item.start < FLOAT_SECONDS); return playNodes(game.current, selected.current, floats.current); },
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
  }), [game, generation]);
  // Selecting a person marks the zones they can go to.
  useEffect(() => { store.replace(playNodes(game.current, armed?.id ?? null, floats.current)); }, [store, game, armed?.id]);
  // Time of day: studio light by day, dusk from 16:00, night light on the night shift.
  const lighting = lightingAt(game.current.level, view.clock);
  useEffect(() => { if (store.getSnapshot().settings.lighting !== lighting) store.configure({ lighting }); }, [store, lighting]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape' && selected.current) store.select(null); };
    document.addEventListener('keydown', cancel); return () => document.removeEventListener('keydown', cancel);
  }, [store]);

  const refresh = () => setView(viewOf(game.current));
  const command = (run: () => void, text: string) => {
    try { run(); setMessage({ text, tone: 'success' }); } catch (failure) { setMessage({ text: failure instanceof Error ? failure.message : String(failure), tone: 'critical' }); }
    refresh();
  };
  const send = (target: StaffMember, zone: StaffZone) => { command(() => game.current.assign(target.id, zone), zone === target.zone ? `${target.label} stays in ${ZONE_LABELS[zone].toLowerCase()}.` : `${target.label} goes to ${ZONE_LABELS[zone].toLowerCase()} after the current task.`); store.select(null); };
  // A click on a zone sends the selected person there; a second click on the person cancels.
  const onPointer = useCallback((event: ScenePointerEvent) => {
    if (event.type !== 'click') return;
    const current = store.getSnapshot().selection?.nodeId, target = game.current.staff().find(item => item.id === current && movable(item));
    if (!target) return;
    if (event.nodeId === target.id) { event.preventSelection(); store.select(null); return; }
    const zone = event.nodeId ? zoneAt(event.nodeId) : null;
    if (!zone) return;
    event.preventSelection();
    try { game.current.assign(target.id, zone); setMessage({ text: `${target.label} goes to ${ZONE_LABELS[zone].toLowerCase()} after the current task.`, tone: 'success' }); } catch (failure) { setMessage({ text: failure instanceof Error ? failure.message : String(failure), tone: 'critical' }); }
    store.select(null); setView(viewOf(game.current));
  }, [store, game]);

  const restart = (level: EcommerceScenario, value: number) => {
    game.current.dispose();
    game.current = createShiftGame({ scenario: level, seed: value });
    floats.current = [];
    store.select(null); store.replace(playNodes(game.current, null, [])); store.configure({ paused: true, lighting: lightingAt(game.current.level, game.current.clock) });
    pending.current = []; setLog([]); setMessage(null); setStarted(false); setScenario(level); setSeed(value); setGeneration(current => current + 1); refresh();
  };
  const start = () => { setStarted(true); store.configure({ paused: false }); };
  const finish = () => { game.current.advance(SHIFT_SECONDS); refresh(); };
  const overview = () => { const value = renderer.current; if (value && !value.getDiagnostics().disposed) value.overview(); store.select(null); };
  const { snapshot, score, decisions, report } = view, paused = scene.settings.paused;
  const next = view.carriers.filter(item => item.remaining !== null).sort((a, b) => a.remaining! - b.remaining!)[0];
  const lanesOpen = snapshot.shop.checkouts.filter(item => item.open).length;

  return <section className="co-viewport hud-viewport" aria-label="Cut-off shift game" data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel="none" data-side-panel="events" data-events={view.events.length > 0}>
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} onPointer={onPointer} /></div>

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
        { id: 'shop', title: 'Customers served', value: report.served, tone: report.walkedOut ? 'warning' : snapshot.shopOpen ? 'info' : 'neutral', comparison: snapshot.shopOpen ? `${report.walkedOut} left a queue · ${lanesOpen} of 3 lanes open` : 'Shop closed', icon: <ShoppingCart size={16} /> },
        { id: 'events', title: 'Open events', value: view.events.length, tone: view.events.length ? 'warning' : 'success', comparison: view.events.length ? `Answer within ${Math.max(0, Math.ceil(Math.min(...view.events.map(item => item.deadline)) - view.time))} min` : `${report.events.length} answered`, icon: <Bell size={16} /> },
      ]} />
    </div>}

    {panelsVisible && <DataPanel className="hud-floating-panel co-commands" title="Shift commands" label="Shift commands" description="Select a person, then a zone in the scene · Escape cancels" density="compact" slots={{ icon: <Users size={16} /> }}>
      {message && <p className="co-message" role="status" data-tone={message.tone}>{message.text}</p>}
      <Selected selection={selection} view={view} armed={armed} onSend={send} onCancel={() => store.select(null)} onLane={(lane, open) => command(() => game.current.setCheckout(lane, open), `Checkout ${lane.slice(1)} ${open ? 'opens' : 'closes once its queue is served'}.`)} onUnload={dock => command(() => game.current.unloadTruck(dock), `The forklift may unload dock ${dock}.`)} onPrioritize={carrier => command(() => game.current.prioritize(carrier), `${carrier} orders go first.`)} />
      <section className="co-section" aria-label="Staff"><h3>Staff</h3><ul className="co-list">{view.staff.map(item => {
        const moving = decisions.moving[item.id];
        return <li key={item.id} data-selected={item.id === selection || undefined}><button type="button" className="co-name" aria-label={`Select ${item.label}`} onClick={() => store.select(item.id, 'keyboard')}>{item.label}</button><span>{ZONE_LABELS[item.zone]}{moving ? ` → ${ZONE_LABELS[moving]}` : ''}</span>{movable(item) ? <span className="co-hint">movable</span> : <span className="co-hint">fixed</span>}</li>;
      })}</ul></section>
      <section className="co-section" aria-label="Carriers"><h3>Carriers</h3><ul className="co-list">{view.carriers.map(item => <li key={item.carrier}><strong>{item.name}</strong><span>{item.cutoff}{item.remaining !== null ? ` · ${Math.ceil(item.remaining)} min left` : ' · passed or none'} · {item.open} open</span><button type="button" aria-pressed={decisions.carrier === item.carrier} aria-label={`Put ${item.name} first`} onClick={() => command(() => game.current.prioritize(item.carrier), `${item.name} orders go first.`)}>{decisions.carrier === item.carrier ? 'First' : 'Put first'}</button></li>)}</ul>
        {(decisions.carrier || decisions.orders.length > 0) && <button type="button" className="hud-text-button" onClick={() => command(() => game.current.prioritize(null), 'Priorities cleared.')}>Clear priorities</button>}</section>
      {snapshot.shopOpen && <section className="co-section" aria-label="Checkouts"><h3>Checkouts</h3><ul className="co-list">{snapshot.shop.checkouts.map(lane => {
        const wanted = decisions.lanes[lane.id] ?? lane.open, closing = lane.open && !wanted;
        return <li key={lane.id}><strong>Checkout {lane.id.slice(1)}</strong><span>{lane.open ? closing ? `Closing · queue ${lane.queue}` : `Open · queue ${lane.queue}` : 'Closed'}</span><button type="button" aria-label={`${wanted ? 'Close' : 'Open'} checkout ${lane.id.slice(1)}`} onClick={() => command(() => game.current.setCheckout(lane.id, !wanted), `Checkout ${lane.id.slice(1)} ${wanted ? 'closes once its queue is served' : 'opens'}.`)}>{wanted ? 'Close' : 'Open'}</button></li>;
      })}</ul></section>}
      <section className="co-section" aria-label="Inbound docks"><h3>Inbound docks</h3><ul className="co-list">{snapshot.docks.filter(dock => dock.direction === 'inbound').map(dock => {
        const allowed = decisions.unload.includes(dock.id), late = decisions.late[dock.id];
        return <li key={dock.id}><strong>Dock {dock.id}</strong><span><HudDockStatus status={dock.status} /> {dock.pallets ? `${dock.pallets.done} of ${dock.pallets.total} pallets` : ''}{late !== undefined ? ` · late${Number.isFinite(late) ? ` for ${Math.ceil(late - view.time)} min` : ''}` : ''}</span><button type="button" aria-pressed={allowed} aria-label={`Allow unloading at dock ${dock.id}`} disabled={allowed} onClick={() => command(() => game.current.unloadTruck(dock.id), `The forklift may unload dock ${dock.id}.`)}>{allowed ? 'Allowed' : 'Unload'}</button></li>;
      })}</ul></section>
    </DataPanel>}

    {panelsVisible && <DataPanel className="hud-side-panel co-side" title="Events & score" label="Events and score" density="compact" slots={{ icon: <Bell size={16} /> }}>
      <section className="co-events" aria-label="Open events">{view.events.length ? view.events.map(event => <article key={event.id} className="co-event" aria-label={event.title}>
        <header><strong>{event.title}</strong><span>{Math.max(0, Math.ceil(event.deadline - view.time))} min to decide</span></header>
        <p>{event.text}</p>
        <div className="co-choices">{event.choices.map(choice => <button key={choice.id} type="button" onClick={() => command(() => game.current.answer(event.id, choice.id), `${event.title}: ${choice.label}.`)}><strong>{choice.label}</strong><span>{choice.effect}{choice.id === event.fallback ? ' (default)' : ''}</span></button>)}</div>
      </article>) : <p className="co-empty">No events right now.</p>}</section>
      <ScoreTable score={score} />
      <ActivityFeed className="co-log" title="Shift log" label="Shift log" density="compact" items={log.map(entry => ({ id: String(entry.id), timeLabel: entry.time, content: entry.text, ...(entry.points !== undefined ? { meta: <StatusBadge label={signed(entry.points)} tone={toneOf(entry.points)} /> } : {}) }))} />
    </DataPanel>}

    {!started && !view.over && <div className="co-dialog-layer"><DataPanel className="co-dialog" title={SHIFT_LEVELS[scenario].title} label="Shift briefing" description={`${SHIFT_LEVELS[scenario].start} start · seed ${seed} · eight hours in eight minutes`} slots={{ icon: <Flag size={18} /> }}>
      <p>{SHIFT_LEVELS[scenario].description}</p>
      <ul className="co-rules">
        <li>Ship orders before each carrier&apos;s cut-off, serve the shop and keep its shelves stocked.</li>
        <li>Select a packer, the replenisher or the shelf filler, then click Packing, Forward picking or the Shop floor. They move after their current task.</li>
        <li>Put a carrier first, open or close checkouts and allow trucks to unload in the command panel. Open lanes and waiting trucks cost points.</li>
        <li>Events offer a choice with a trade-off; without an answer the default applies after 45 minutes.</li>
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
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button><span>Select a person, then a zone · Escape cancels · drag to pan</span></div>
      </DataPanel>
    </div>
  </section>;
}

/** What the current selection offers: zones for a person, a lane, a dock or a carrier's cages. */
function Selected({ selection, view, armed, onSend, onCancel, onLane, onUnload, onPrioritize }: {
  selection: string | null; view: GameView; armed: StaffMember | null;
  onSend(person: StaffMember, zone: StaffZone): void; onCancel(): void; onLane(lane: CheckoutId, open: boolean): void; onUnload(dock: DockId): void; onPrioritize(carrier: CarrierId): void;
}) {
  if (!selection) return null;
  const [kind, id = ''] = selection.split(':'), person = view.staff.find(item => item.id === selection);
  let body: ReactNode = null;
  if (armed) body = <><p><strong>{armed.label}</strong> works in {ZONE_LABELS[armed.zone].toLowerCase()}. Click a marked pin, or choose:</p>
    <div className="co-zones">{armed.zones.map(zone => <button key={zone} type="button" aria-pressed={zone === armed.zone} aria-label={`Send ${armed.label} to ${ZONE_LABELS[zone]}`} onClick={() => onSend(armed, zone)}>{ZONE_LABELS[zone]}</button>)}<button type="button" onClick={onCancel}>Cancel</button></div></>;
  else if (person) body = <p><strong>{person.label}</strong> only works in {ZONE_LABELS[person.zone].toLowerCase()}.</p>;
  else if (kind === 'checkout') {
    const lane = view.snapshot.shop.checkouts.find(item => item.id === id), wanted = view.decisions.lanes[id as CheckoutId] ?? lane?.open;
    if (lane && view.snapshot.shopOpen) body = <p><strong>Checkout {id.slice(1)}</strong> · queue {lane.queue} <button type="button" onClick={() => onLane(lane.id, !wanted)}>{wanted ? 'Close' : 'Open'}</button></p>;
  } else if (kind === 'dock' && id !== 'D3') body = <p><strong>Dock {id}</strong> <button type="button" disabled={view.decisions.unload.includes(id as DockId)} onClick={() => onUnload(id as DockId)}>Unload</button></p>;
  else if (kind === 'cage') { const carrier = id.split('-')[0] as CarrierId, status = view.carriers.find(item => item.carrier === carrier); if (status) body = <p><strong>{status.name}</strong> · {status.open} open <button type="button" onClick={() => onPrioritize(carrier)}>Put first</button></p>; }
  return body ? <section className="co-selected" aria-label="Selection">{body}</section> : null;
}

function ScoreTable({ score }: { score: ShiftScore }) {
  const lines = score.lines.filter(line => line.count || line.points);
  return <section className="co-score" aria-label="Score"><h3>Score <span>{score.total}</span></h3>{lines.length ? <table><tbody>{lines.map(line => <tr key={line.id}><td>{line.label}</td><td>{line.count}</td><td data-tone={toneOf(line.points)}>{signed(line.points)}</td></tr>)}</tbody></table> : <p className="co-empty">Nothing scored yet.</p>}</section>;
}

function Report({ report, onAgain, onNext }: { report: ShiftReport; onAgain(): void; onNext(): void }) {
  return <DataPanel className="co-dialog co-report" title="End of shift" label="End of shift report" description={`${report.level.title} · seed ${report.seed} · ${report.clock}`} slots={{ icon: <Trophy size={18} /> }}>
    <p className="co-total">Score <strong>{report.score.total}</strong></p>
    <ul className="co-totals">
      <li><strong>{report.shipped}</strong> orders shipped</li><li><strong>{report.collected}</strong> click &amp; collect</li><li><strong>{report.served}</strong> customers served</li>
      <li><strong>{report.walkedOut}</strong> left a queue</li><li><strong>{report.putAway}</strong> pallets put away</li><li><strong>{report.ranEmpty}</strong> empty departments</li>
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

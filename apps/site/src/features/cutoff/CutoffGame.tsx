'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Boxes, Clock3, Crosshair, Eye, EyeOff, FastForward, Flag, Pause, Play, RotateCcw, Timer, Trophy, Truck, Users } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { ActivityFeed, DataPanel, StatusBadge, type Tone } from '@opsorama/react/ui';
import { createSceneStore, type SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import '@opsorama/ui/styles.css';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudDockStatus, HudMetrics, HudZoom, useHudMetricSize } from '../example-hud';
import { runFeedLoop, type LoopFeed } from '../ecommerce/feed-loop';
import { carrier as carrierOf, type EcommerceScenario, type EcommerceSnapshot } from '../ecommerce/model';
import { DEFAULT_ZOOM, ecommerceControllers } from '../ecommerce/scene';
import type { Move } from '../ecommerce/simulation';
import { SHIFT_LEVELS, SHIFT_SECONDS, createShiftGame, type ActorChoices, type ActorView, type CarrierStatus, type ShiftDecisions, type ShiftEvent, type ShiftGame, type ShiftNotice, type ShiftReport, type ShiftScore } from './rules';
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
type LogEntry = { id: number; time: string; text: string; points?: number };

function createStore(game: ShiftGame): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: playNodes(game, []) }, { zoom: DEFAULT_ZOOM, selectionStyle: 'glow', paused: true, lighting: lightingAt(game.level, game.clock) });
}

/**
 * The scene with the game's HUD. The rules run in `rules.ts`; this component only reads them and sends commands: select an
 * object in the scene, then a move for one of the crew in the crew panel. Context menus over the scene come with the next stage.
 */
function CutoffViewport({ game }: { game: { current: ShiftGame } }) {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [view, setView] = useState(() => viewOf(game.current)), [generation, setGeneration] = useState(0);
  const [scenario, setScenario] = useState<EcommerceScenario>(game.current.level.scenario), [seed, setSeed] = useState(game.current.seed);
  const [started, setStarted] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null), [log, setLog] = useState<LogEntry[]>([]);
  const { metricSize } = useHudMetricSize();
  const selection = scene.selection?.nodeId ?? null;
  const pending = useRef<LogEntry[]>([]), nextLog = useRef(1), floats = useRef<Floating[]>([]);

  // The scene clock drives the game: pause and speed apply to both.
  useEffect(() => {
    const feed: LoopFeed<GameView> = {
      // While point changes float, every step republishes so they rise.
      get sceneRevision() { return game.current.sceneRevision + (floats.current.length ? Math.round(game.current.time * 10) : 0); }, get recordsRevision() { return game.current.recordsRevision; },
      advance: seconds => game.current.advance(seconds),
      nodes: () => { const time = game.current.time; floats.current = floats.current.filter(item => time - item.start < FLOAT_SECONDS); return playNodes(game.current, floats.current); },
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
    if (notice.type === 'departed') add(`${carrierOf(notice.carrier).name} truck left${notice.sent ? '' : ' at its cut-off'}`);
  }), [game, generation]);
  // Time of day: studio light by day, dusk from 16:00, night light on the night shift.
  const lighting = lightingAt(game.current.level, view.clock);
  useEffect(() => { if (store.getSnapshot().settings.lighting !== lighting) store.configure({ lighting }); }, [store, lighting]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape' && store.getSnapshot().selection) store.select(null); };
    document.addEventListener('keydown', cancel); return () => document.removeEventListener('keydown', cancel);
  }, [store]);

  const refresh = () => setView(viewOf(game.current));
  const command = (run: () => void, text: string) => {
    try { run(); setMessage({ text, tone: 'success' }); } catch (failure) { setMessage({ text: failure instanceof Error ? failure.message : String(failure), tone: 'critical' }); }
    refresh();
  };
  const restart = (level: EcommerceScenario, value: number) => {
    game.current.dispose();
    game.current = createShiftGame({ scenario: level, seed: value });
    floats.current = [];
    store.select(null); store.replace(playNodes(game.current, [])); store.configure({ paused: true, lighting: lightingAt(game.current.level, game.current.clock) });
    pending.current = []; setLog([]); setMessage(null); setStarted(false); setScenario(level); setSeed(value); setGeneration(current => current + 1); refresh();
  };
  const start = () => { setStarted(true); store.configure({ paused: false }); };
  const finish = () => { game.current.advance(SHIFT_SECONDS); refresh(); };
  const overview = () => { const value = renderer.current; if (value && !value.getDiagnostics().disposed) value.overview(); store.select(null); };
  const { snapshot, score, decisions, report } = view, paused = scene.settings.paused;
  const next = view.carriers.filter(item => item.remaining !== null).sort((a, b) => a.remaining! - b.remaining!)[0];
  const choices = selection && !view.over ? game.current.options(selection) : [];

  return <section className="co-viewport hud-viewport" aria-label="Cut-off shift game" data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel="none" data-side-panel="events" data-events={view.events.length > 0}>
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" controllers={ecommerceControllers} wheelZoom onReady={onReady} /></div>

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
        { id: 'events', title: 'Open events', value: view.events.length, tone: view.events.length ? 'warning' : 'success', comparison: view.events.length ? `Answer within ${Math.max(0, Math.ceil(Math.min(...view.events.map(item => item.deadline)) - view.time))} min` : `${report.events.length} answered`, icon: <Bell size={16} /> },
      ]} />
    </div>}

    {panelsVisible && <DataPanel className="hud-floating-panel co-commands" title="Crew" label="Crew commands" description="Select an object in the scene, then a move · Escape clears the selection" density="compact" slots={{ icon: <Users size={16} /> }}>
      {message && <p className="co-message" role="status" data-tone={message.tone}>{message.text}</p>}
      {selection && <Choices selection={selection} choices={choices} onMove={(actor, move) => command(() => game.current.move(actor.id, move), `${actor.label}: ${moveLabel(move)}.`)} />}
      <section className="co-section" aria-label="Actors"><h3>Actors</h3><ul className="co-list co-actors">{view.actors.map(actor => <li key={actor.id} data-selected={actor.id === selection || undefined}>
        <button type="button" className="co-name" aria-label={`Select ${actor.label}`} onClick={() => store.select(actor.id, 'keyboard')}>{actor.label}</button>
        <span>{actor.waiting ?? actor.task ?? (actor.assist ? 'Works by itself' : 'Idle')}</span>
        <button type="button" aria-pressed={actor.assist} aria-label={`Let ${actor.label} work by itself`} onClick={() => command(() => game.current.assist(actor.id, !actor.assist), `${actor.label} ${actor.assist ? 'waits for your commands' : 'works by itself without a command'}.`)}>Auto</button>
        {actor.queue.length > 0 && <ol className="co-queue" aria-label={`Commands of ${actor.label}`}>{actor.queue.map((move, index) => <li key={`${index}:${moveLabel(move)}`}>
          <span>{moveLabel(move)}</span>
          {index === 0
            ? <button type="button" aria-label={`Stop ${actor.label}`} onClick={() => command(() => game.current.stop(actor.id), `${actor.label} stops after the current task.`)}>Stop</button>
            : <button type="button" aria-label={`Cancel command ${index} of ${actor.label}`} onClick={() => command(() => game.current.cancelMove(actor.id, index), 'Command cancelled.')}>Cancel</button>}
        </li>)}</ol>}
      </li>)}</ul></section>
      <section className="co-section" aria-label="Carriers"><h3>Carriers</h3><ul className="co-list">{view.carriers.map(item => <li key={item.carrier}><strong>{item.name}</strong><span>{item.cutoff}{item.remaining !== null ? ` · ${Math.ceil(item.remaining)} min left` : ' · passed or none'} · {item.open} open{item.loading ? ' · loading at D3' : ''}</span>
        {item.loading && <button type="button" disabled={decisions.departing} aria-label={`Send the ${item.name} truck`} onClick={() => command(() => game.current.depart(), `The ${item.name} truck leaves once no cage is on its way.`)}>{decisions.departing ? 'Leaving' : 'Send'}</button>}</li>)}</ul></section>
      <section className="co-section" aria-label="Inbound docks"><h3>Inbound docks</h3><ul className="co-list">{snapshot.docks.filter(dock => dock.direction === 'inbound').map(dock => {
        const late = decisions.late[dock.id];
        return <li key={dock.id}><strong>Dock {dock.id}</strong><span><HudDockStatus status={dock.status} /> {dock.pallets ? `${dock.pallets.done} of ${dock.pallets.total} pallets` : ''}{late !== undefined ? ` · late${Number.isFinite(late) ? ` for ${Math.ceil(late - view.time)} min` : ''}` : ''}</span></li>;
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
        <li>Receive, put away, replenish, restock and ship: the forklift, reach truck, replenisher, shelf filler and dispatcher move material only on your commands, unless their Auto is on.</li>
        <li>Select a truck, pallet, pick face, gondola or roll cage in the scene, then choose a move in the crew panel. Each of the crew holds three commands; unloading, filling a pick face and restocking repeat until done.</li>
        <li>Pallets go only into racks of their type. Ship before each carrier&apos;s cut-off; trucks waiting on a dock and empty shop departments cost points.</li>
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
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button><span>Select an object, then a move · Escape clears · drag to pan</span></div>
      </DataPanel>
    </div>
  </section>;
}

/** The moves the crew can make with the selected object, best target first, and the targets they may not use. */
function Choices({ selection, choices, onMove }: { selection: string; choices: readonly ActorChoices[]; onMove(actor: ActorChoices['actor'], move: Move): void }) {
  let body: ReactNode = <p>No move of material for <strong>{selection}</strong>.</p>;
  if (choices.length) body = choices.map(choice => <div key={choice.actor.id} className="co-choice" role="group" aria-label={`Moves of ${choice.actor.label}`}>
    <p><strong>{choice.actor.label}</strong></p>
    {choice.options.length > 0 && <div className="co-zones">{choice.options.map(option => <button key={JSON.stringify(option.move)} type="button" aria-label={`${choice.actor.label}: ${moveLabel(option.move)} · ${option.target}`} title={option.waits} onClick={() => onMove(choice.actor, option.move)}>{option.target}{option.waits ? ' · waits' : ''}</button>)}</div>}
    {choice.refused.length > 0 && <ul className="co-refused">{choice.refused.slice(0, 3).map(item => <li key={item.target}>{item.target}: {item.reason}</li>)}{choice.refused.length > 3 && <li>{choice.refused.length - 3} more refused</li>}</ul>}
  </div>);
  return <section className="co-selected" aria-label="Selection">{body}</section>;
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

'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentState, AssetNode, BehaviorEvent, RouteViolation, SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { agentNodes, breakCommand, itemNodes, palletJackNode, robotNodes, ROBOT_SPOTS, checkVehicleLaneProposal, createShift, motionPeople, shiftOverlay, shiftSteps } from '../../../examples/motion-data';

type Session = { update(nodes: readonly AssetNode[]): void; store: SceneStore; dispose(): void };
type Runner = ReturnType<typeof createShift>;
const pickers = motionPeople.filter(person => person.id !== 'devon');
const nameOf = (id: string) => motionPeople.find(person => person.id === id)?.name ?? id;
const EVENT_TEXT: Partial<Record<BehaviorEvent['type'], string>> = { arrived: 'arrived at', queued: 'queued for', 'interaction-started': 'started at', 'interaction-ended': 'left', blocked: 'is blocked', yielding: 'gives way to', deadlock: 'is deadlocked with', 'picked-up': 'picked up', 'put-down': 'put down', finished: 'finished' };
const describeEvent = (event: BehaviorEvent) => `${nameOf(event.agent)} ${EVENT_TEXT[event.type]}${event.type === 'picked-up' || event.type === 'put-down' ? ` ${event.items.join(', ')} at ${event.node}` : ''}${event.type === 'arrived' ? ` ${event.point}` : event.type === 'queued' ? ` ${event.node} (#${event.place})` : event.type === 'interaction-started' || event.type === 'interaction-ended' ? ` ${event.slot}${event.type === 'interaction-ended' && event.interrupted ? ' (interrupted)' : ''}` : event.type === 'deadlock' ? ` ${event.agents.filter(id => id !== event.agent).map(nameOf).join(', ')}` : event.type === 'yielding' ? ` ${event.agents.map(nameOf).join(', ') || 'others'}${event.seconds !== undefined ? ` (${event.seconds.toFixed(1)} s)` : ''}` : ''}`;
const PHASE_TEXT: Record<AgentState['phase'], string> = { moving: 'Walking', yielding: 'Giving way', queued: 'Queued', interacting: 'Working', waiting: 'Waiting', idle: 'Idle', blocked: 'Blocked' };
/** Same per-frame cap as the renderer, so the simulation keeps pace with the visual clock at low frame rates. */
const MAX_FRAME_SECONDS = .05;

export function MotionExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [runner, setRunner] = useState<Runner>(() => createShift());
  const agents = useSyncExternalStore(runner.subscribe, runner.getAgents, runner.getAgents);
  const items = useSyncExternalStore(runner.subscribe, runner.getItems, runner.getItems);
  const [robotSpot, setRobotSpot] = useState(0);
  const [selected, setSelected] = useState<string>('alex'), [violations, setViolations] = useState<readonly RouteViolation[]>([]);
  const [motion, setMotion] = useState(true), [paused, setPaused] = useState(false), [speed, setSpeed] = useState(1), [overlay, setOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null), [events, setEvents] = useState<readonly { id: number; event: BehaviorEvent }[]>([]);
  const container = useRef<HTMLDivElement>(null), session = useRef<Session | null>(null), renderer = useRef<SceneRenderer | null>(null);
  // Agents first, so carried parcels find the anchor they attach to.
  // Routes carry the runner time, so a scene mounted again resumes every route where the simulation is.
  const nodes = () => [...agentNodes(agents, runner.time), palletJackNode(runner.time), ...itemNodes(items), ...robotNodes(robotSpot)];
  // Nodes are built when used, so a mount reads the runner time at that moment.
  const latest = useRef(nodes); latest.current = nodes;
  const settings = useRef({ motion, paused, speed }); settings.current = { motion, paused, speed };

  // The host owns the simulation clock: it follows scene speed and pause, and keeps running with motion off.
  useEffect(() => {
    let frame = 0, last = 0;
    const tick = (now: number) => {
      const seconds = last ? Math.min(MAX_FRAME_SECONDS, (now - last) / 1000) : 0; last = now;
      // Like the renderer, skip hidden frames so the simulation never runs ahead of the visuals.
      if (!settings.current.paused && seconds > 0 && !document.hidden) runner.advance(seconds * settings.current.speed);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [runner]);
  // Typed events report what agents did, in simulation-time order; step starts are left out of this log.
  useEffect(() => { let count = 0; setEvents([]); return runner.subscribeEvents(event => { if (event.type !== 'step-started') { const id = count++; setEvents(list => [{ id, event }, ...list].slice(0, 6)); } }); }, [runner]);
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: Session | null = null;
    setError(null);
    const ready = (value: SceneRenderer) => { if (!active) return; renderer.current = value; value.overview(); };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/motion-react')).mountMotionReact : adapter === 'Vue' ? (await import('../../../examples/motion-vue')).mountMotionVue : (await import('../../../examples/motion-javascript')).mountMotionJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current(), ready); view.store.configure(settings.current); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; renderer.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.update(latest.current()); }, [agents, items, robotSpot]);
  useEffect(() => { session.current?.store.configure({ motion, paused, speed }); }, [motion, paused, speed]);
  useEffect(() => { renderer.current?.setOverlay(overlay ? shiftOverlay(runner) : null); }, [overlay, agents, runner]);

  const restart = () => { setRunner(createShift()); setViolations([]); };
  return <section className="adapter-example motion-example" aria-label="Rule-based movement">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface">{mounted ? <div key={adapter} ref={container} style={{ height: 460, position: 'relative' }} /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <div className="motion-controls">
      <label>Picker<select aria-label="Picker" value={selected} onChange={event => setSelected(event.target.value)}>{pickers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <button onClick={() => runner.command(selected, breakCommand)}>Send on a break</button>
      <button onClick={() => runner.assign(selected, shiftSteps, { loop: true })}>Resume shift</button>
      <button onClick={() => setViolations(checkVehicleLaneProposal())}>Propose route via vehicle lane</button>
    </div>
    <div className="motion-controls">
      {/* The host only changes the robot record position; its approach controller drives it there. */}
      <button onClick={() => setRobotSpot(spot => (spot + 1) % ROBOT_SPOTS.length)}>Send delivery robot to {ROBOT_SPOTS[(robotSpot + 1) % ROBOT_SPOTS.length].name}</button>
      <span role="status">Delivery robot target: {ROBOT_SPOTS[robotSpot].name}</span>
    </div>
    <div className="motion-controls">
      <label><input type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} />Motion</label>
      <label><input type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} />Pause</label>
      <label>Speed<select aria-label="Speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[.5, 1, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <label><input type="checkbox" checked={overlay} onChange={event => setOverlay(event.target.checked)} />Show movement graph</label>
      <button onClick={restart}>Restart shift</button>
    </div>
    <table className="motion-agents"><caption>Agents at {runner.time.toFixed(0)} s</caption><thead><tr><th scope="col">Person</th><th scope="col">Task</th><th scope="col">State</th><th scope="col">Place</th><th scope="col">Carrying</th></tr></thead>
      <tbody>{agents.map(agent => <tr key={agent.id}><th scope="row">{nameOf(agent.id)}</th><td>{agent.label ?? '—'}</td><td>{PHASE_TEXT[agent.phase]}{agent.queuePlace ? ` (#${agent.queuePlace} in line)` : ''}</td><td>{agent.slot ?? agent.at}</td><td>{agent.carrying?.join(', ') ?? '—'}</td></tr>)}</tbody>
    </table>
    <div className="motion-events"><strong>Recent events</strong>{events.length ? <ol>{events.map(({ id, event }) => <li key={id}><span>{event.time.toFixed(1)} s</span> {describeEvent(event)}</li>)}</ol> : <p>No events yet.</p>}</div>
    {violations.length > 0 && <div role="alert" className="motion-violations"><strong>Route rejected by the movement rules</strong><ul>{violations.map((violation, index) => <li key={index}>{violation.message}</li>)}</ul></div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

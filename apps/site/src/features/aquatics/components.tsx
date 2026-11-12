'use client';
import Link from 'next/link';
import { AlertTriangle, BookOpen, Droplets, Filter, LifeBuoy, Lock, Pause, Timer, Users, Waves } from 'lucide-react';
import { StatusBadge, type MetricAction } from '@opsorama/react/ui';
import { HUD_STATE_TONE, HudObjectLabel, HudObjectThumbnail, type HudMetric } from '../example-hud';
import { LANE_USE, POOL_LABELS, POST_STATUS, WATER_LIMITS, aquaticsMetrics, bathers, laneNumber, laneState, postState, waterState, type AquaticsSnapshot, type FilterRecord, type LaneSession, type LaneUse, type LifeguardPost, type PoolId, type PostStatus } from './model';

const STATE_TONE = { normal: '#38a88a', busy: '#5088ec', warning: '#dca644', critical: '#df6470', inactive: '#91a0b5' } as const;
const WATER_STATUS = { normal: 'Within limits', busy: 'Within limits', warning: 'Outside limits', critical: 'Far outside limits', inactive: 'No reading' } as const;
const LANE_BADGES = {
  public: { tone: 'info', Icon: Waves }, club: { tone: 'info', Icon: Timer },
  lessons: { tone: 'success', Icon: BookOpen }, closed: { tone: 'neutral', Icon: Lock },
} as const;

export function LaneUseBadge({ use }: { use: LaneUse }) {
  const { tone, Icon } = LANE_BADGES[use];
  return <StatusBadge label={LANE_USE[use].label} tone={tone} icon={<Icon />} />;
}
export function PostStatusBadge({ status, open }: { status: PostStatus; open: boolean }) {
  const value = POST_STATUS[status];
  return <StatusBadge label={open ? value.label : 'Off duty'} tone={open ? HUD_STATE_TONE[value.state] : 'neutral'} icon={open && status === 'break' ? <Pause /> : undefined} />;
}
function WaterBadge({ pool, snapshot }: { pool: PoolId; snapshot: AquaticsSnapshot }) {
  const state = waterState(snapshot.water[pool]);
  return <StatusBadge label={WATER_STATUS[state]} tone={HUD_STATE_TONE[state]} />;
}

export type AquaticsMetricId = 'bathers' | 'lanes' | 'posts' | 'water';
/** Four short panels for the top of the floating HUD. The viewport supplies the detail each one opens. */
export function aquaticsHudMetrics(snapshot: AquaticsSnapshot, actions: Readonly<Record<AquaticsMetricId, MetricAction>>): readonly HudMetric[] {
  const metrics = aquaticsMetrics(snapshot), full = snapshot.lanes.filter(session => session.use !== 'closed' && session.swimmers >= session.capacity).length;
  const postStates = snapshot.posts.map(post => postState(snapshot, post));
  const postTone = postStates.includes('critical') ? 'critical' : postStates.includes('warning') ? 'warning' : undefined;
  const outside = (['main', 'teaching'] as const).filter(pool => { const state = waterState(snapshot.water[pool]); return state === 'warning' || state === 'critical'; });
  const waterTone = outside.some(pool => waterState(snapshot.water[pool]) === 'critical') ? 'critical' : outside.length ? 'warning' : undefined;
  return [
    { id: 'bathers', title: 'In the water', value: metrics.inWater, tone: 'info', visual: { kind: 'capacity', max: metrics.capacity || null }, comparison: metrics.capacity ? `Bather load ${Math.round(metrics.inWater / metrics.capacity * 100)} %` : 'No bathers admitted', action: actions.bathers, icon: <Users size={16} /> },
    { id: 'lanes', title: 'Lanes open', value: metrics.lanesOpen, unit: `/ ${metrics.lanes}`, tone: metrics.lanesOpen ? 'info' : 'neutral', visual: { kind: 'capacity', max: metrics.lanes }, comparison: metrics.lanesOpen ? `${full} full` : 'Pool covered', action: actions.lanes, icon: <Waves size={16} /> },
    { id: 'posts', title: 'Lifeguards on post', value: snapshot.open ? metrics.onPost : 'Off duty', unit: snapshot.open ? `/ ${metrics.posts}` : undefined, tone: postTone ?? (snapshot.open ? 'success' : 'neutral'), comparison: postTone ? 'A post needs cover' : snapshot.open ? 'All pools covered' : 'Centre closed', action: actions.posts, icon: <LifeBuoy size={16} /> },
    { id: 'water', title: 'Water outside limits', value: outside.length, tone: waterTone ?? 'success', comparison: outside.length ? outside.map(pool => POOL_LABELS[pool]).join(' · ') : 'Both pools within limits', action: actions.water, icon: waterTone ? <AlertTriangle size={16} /> : <Droplets size={16} /> },
  ];
}

export function LaneChips({ snapshot, selectedId, onSelect }: { snapshot: AquaticsSnapshot; selectedId?: string; onSelect: (id: string) => void }) {
  return <nav className="aquatics-lanes" aria-label="Pool lanes">{snapshot.lanes.map(session => {
    const use = LANE_USE[session.use], state = laneState(session), full = session.use !== 'closed' && session.swimmers >= session.capacity;
    const summary = session.use === 'closed' ? 'No swimmers' :`${session.swimmers} / ${session.capacity}${full ? ' · full' : ''}${session.alert ? ' · alert' : ''}`;
    return <button key={session.laneId} data-alert={session.alert ? true : undefined} aria-pressed={selectedId === session.laneId} aria-label={`Inspect lane ${laneNumber(session.laneId)}: ${use.label}, ${summary}`} style={{ borderTopColor: use.color }} onClick={() => onSelect(session.laneId)}>
      <HudObjectThumbnail model="starting-block" /><strong>Lane {laneNumber(session.laneId)}</strong><LaneUseBadge use={session.use} />
      {session.use === 'public' && <small>{session.speed} lane</small>}
      <meter min={0} max={Math.max(1, session.capacity)} value={session.swimmers} aria-hidden="true" /><small style={{ color: STATE_TONE[state] }}>{summary}</small></button>;
  })}</nav>;
}

export function LaneInspector({ session }: { session: LaneSession }) {
  return <aside className="aquatics-inspector" aria-label="Lane inspector"><div className="aquatics-eyebrow">25 M POOL / LANE {laneNumber(session.laneId)}</div><h2><Waves size={20} aria-hidden="true" /> Lane {laneNumber(session.laneId)}</h2><LaneUseBadge use={session.use} />
    <dl><dt>Swimmers</dt><dd>{session.use === 'closed' ? '—' : `${session.swimmers} of ${session.capacity}`}</dd><dt>Speed</dt><dd>{session.speed ?? '—'}</dd><dt>Booked until</dt><dd>{session.until ?? '—'}</dd><dt>Shown on the board</dt><dd>{Math.min(4, session.swimmers)} swimmers</dd></dl>
    {session.alert && <p className="aquatics-alert" role="alert">{session.alert}</p>}<p>{session.note}</p>
    <div className="aquatics-host-note">{session.use === 'closed' ?'Bookings and closures come from the timetable.' : 'Up to four swimmers swim on the board; the exact count comes from the host’s lane counter.'} A separate map pin shows the host lane status.</div></aside>;
}

export function WaterInspector({ pool, snapshot }: { pool: PoolId; snapshot: AquaticsSnapshot }) {
  const reading = snapshot.water[pool], state = waterState(reading);
  return <aside className="aquatics-inspector" aria-label="Water inspector"><div className="aquatics-eyebrow">WATER QUALITY / MOCK SENSOR</div><h2><Droplets size={20} aria-hidden="true" /> {POOL_LABELS[pool]}</h2><WaterBadge pool={pool} snapshot={snapshot} />
    <dl><dt>pH</dt><dd>{reading.ph.toFixed(1)} <small>({WATER_LIMITS.ph.join('–')})</small></dd><dt>Free chlorine</dt><dd>{reading.chlorine.toFixed(2)} mg/l <small>({WATER_LIMITS.chlorine.join('–')})</small></dd><dt>Temperature</dt><dd>{reading.temperature.toFixed(1)} °C</dd><dt>Bathers</dt><dd>{bathers(snapshot, pool)}</dd></dl>
    <p>{state === 'normal' ? 'The supplied readings are within the configured limits.' : 'The dosing-station display shows the reading in amber. Check the dosing pumps and canister levels; the host decides whether to close the pool.'}</p>
    <div className="aquatics-host-note">Readings and limits are mock data. The dosing-station display is a surface label fed by the host; the model does not simulate chemistry or dosing.</div></aside>;
}

export function PostInspector({ post, snapshot }: { post: LifeguardPost; snapshot: AquaticsSnapshot }) {
  const state = postState(snapshot, post);
  return <aside className="aquatics-inspector" aria-label="Lifeguard inspector"><div className="aquatics-eyebrow">LIFEGUARD POST / {POOL_LABELS[post.covers].toUpperCase()}</div><h2><LifeBuoy size={20} aria-hidden="true" /> {post.label}</h2><PostStatusBadge status={post.status} open={snapshot.open} />
    <dl><dt>Lifeguard</dt><dd>{snapshot.open ? post.guard ?? '—' : '—'}</dd><dt>Bathers covered</dt><dd>{bathers(snapshot, post.covers)}</dd></dl>
    {state === 'warning' && <p className="aquatics-alert" role="alert">Post empty while {bathers(snapshot, post.covers)} bathers are in the water.</p>}<p>{post.note}</p>
    <div className="aquatics-host-note">Rotas and alerts stay in the host’s staffing system. A separate map pin shows the host post status; a lifeguard sits on the chair while on post.</div></aside>;
}

export function PlantInspector({ snapshot }: { snapshot: AquaticsSnapshot }) {
  return <aside className="aquatics-inspector" aria-label="Plant inspector"><div className="aquatics-eyebrow">PLANT ROOM / MOCK TELEMETRY</div><h2><Filter size={20} aria-hidden="true" /> Filtration</h2>
    {snapshot.filters.map(filter => <FilterCard key={filter.id} filter={filter} />)}
    <div className="aquatics-host-note">Filter pressure and backwash state are host data. Pressure and backwash alerts stay in the host UI; the neutral gauge needle is not a reading.</div></aside>;
}
function FilterCard({ filter }: { filter: FilterRecord }) {
  return <div className="aquatics-card" data-status={filter.status}><div><strong>Filter {filter.id}</strong><StatusBadge label={filter.status === 'running' ? 'Running' : filter.status === 'backwash' ? 'Backwash' : 'Off'} tone={filter.status === 'running' ? 'success' : filter.status === 'backwash' ? 'warning' : 'neutral'} /></div><small>{filter.pressure ? `${filter.pressure.toFixed(1)} bar` : '—'} · {filter.note}</small></div>;
}

export function EmptyInspector({ snapshot }: { snapshot: AquaticsSnapshot }) {
  return <div className="aquatics-inspector"><div className="aquatics-eyebrow">POOL INSPECTOR</div><h2>Select a lane</h2><p>Choose a starting block, a lifeguard chair, a pool, a dosing station or a filter in the scene, or use the Lanes, Water and Lifeguards panels.</p>
    <p>{snapshot.open ? 'Starting-block lamps: green free, blue in use, amber full, red alert, grey closed.' : 'The pool is closed and covered.'}</p></div>;
}

/** Lane-use labels and icons shared with the lane chips. */
export function LaneLegend() {
  return <div className="aquatics-legend" aria-label="Lane use legend">{(Object.keys(LANE_USE) as LaneUse[]).map(use => <LaneUseBadge key={use} use={use} />)}</div>;
}

export function PostStrip({ snapshot, selected, onSelect }: { snapshot: AquaticsSnapshot; selected?: string; onSelect: (id: string) => void }) {
  return <nav className="aquatics-posts" aria-label="Lifeguard posts">{snapshot.posts.map(post => {
    const state = postState(snapshot, post);
    return <button key={post.id} data-alert={state === 'critical' || state === 'warning' || undefined} aria-pressed={selected === post.id} aria-label={`Inspect ${post.label}: ${snapshot.open ? POST_STATUS[post.status].label : 'Off duty'}`} onClick={() => onSelect(post.id)}><HudObjectLabel model="lifeguard-chair"><strong>{post.label}</strong>{snapshot.open && post.guard && <small>{post.guard}</small>}</HudObjectLabel><PostStatusBadge status={post.status} open={snapshot.open} /></button>;
  })}</nav>;
}

export function WaterTable({ snapshot, onSelect }: { snapshot: AquaticsSnapshot; onSelect: (pool: PoolId) => void }) {
  return <div className="hud-table aquatics-table-wrap"><table><thead><tr><th>Pool</th><th>pH</th><th>Free chlorine</th><th>Temperature</th><th>Bathers</th><th>Status</th></tr></thead><tbody>{(['main', 'teaching'] as const).map(pool => {
    const reading = snapshot.water[pool], state = waterState(reading), [phLow, phHigh] = WATER_LIMITS.ph, [clLow, clHigh] = WATER_LIMITS.chlorine;
    return <tr key={pool} data-status={state}><td><button onClick={() => onSelect(pool)} aria-label={`Inspect water in the ${POOL_LABELS[pool]}`}><HudObjectLabel model={pool === 'main' ? 'lap-pool' : 'wading-pool'}>{POOL_LABELS[pool]}</HudObjectLabel></button></td><td className={reading.ph < phLow || reading.ph > phHigh ? 'over' : ''}>{reading.ph.toFixed(1)}</td><td className={reading.chlorine < clLow || reading.chlorine > clHigh ? 'over' : ''}>{reading.chlorine.toFixed(2)} mg/l</td><td>{reading.temperature.toFixed(1)} °C</td><td>{bathers(snapshot, pool)}</td><td><WaterBadge pool={pool} snapshot={snapshot} /></td></tr>;
  })}</tbody></table></div>;
}

export const AQUATICS_CATALOG = [
  ['lap-pool', 'Lap pool', '25 m six-lane pool with ropes, markings and backstroke flags; open or covered.'],
  ['wading-pool', 'Wading pool', 'Round shallow pool with a mushroom fountain.'],
  ['swimmer', 'Swimmer', 'Freestyle stroke or floating, for lanes and leisure water.'],
  ['starting-block', 'Starting block', 'Lane number plate and a status lamp per lane.'],
  ['lifeguard-chair', 'Lifeguard chair', 'Elevated post with canopy and a status flag.'],
  ['pool-ladder', 'Pool ladder', 'Grab rails over the coping, for ladder anchors.'],
  ['sun-lounger', 'Sun lounger', 'Poolside lounger, reclined or flat.'],
  ['deck-shower', 'Deck shower', 'Shower column with running water and a status LED.'],
  ['life-ring-post', 'Life ring post', 'Rescue point with a ring and a sign plate.'],
  ['dosing-station', 'Dosing station', 'Water readings on a display, pumps and canisters.'],
  ['sand-filter', 'Sand filter', 'Filter vessel with valve, pipes and a neutral gauge.'],
] as const;
/** Links to the shared catalog pages of every model in the scene. */
export function AquaticsLibrary() {
  return <section className="aquatics-library" aria-label="Aquatics objects"><h3><Waves size={15} aria-hidden="true" /> {AQUATICS_CATALOG.length} shared aquatics objects</h3>
    <ul>{AQUATICS_CATALOG.map(([asset, name, description]) => <li key={asset}><Link href={`/docs/objects/${asset}`} title={description}>{name}</Link></li>)}</ul></section>;
}

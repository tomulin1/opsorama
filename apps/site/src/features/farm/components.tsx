'use client';
import Link from 'next/link';
import { AlertTriangle, Bird, Cat, ClipboardList, Dog, Droplets, Tractor, Warehouse, Wheat } from 'lucide-react';
import { StatusBadge, type MetricAction } from '@opsorama/react/ui';
import type { VisualState } from '@opsorama/core';
import { HUD_STATE_TONE, HudObjectLabel, HudObjectThumbnail, type HudMetric } from '../example-hud';
import type { HudThumbnailModel } from '../hud-thumbnails';
import {
  FIELDS, PENS, SPECIES, STAGE_LABELS, TASK_STATUS, TROUGH_LIMITS, farmMetrics, fieldOf, fieldRecord, flagNode, flagsOf, penOf, penRecord, penState, troughState,
  type AnimalFlag, type FarmSnapshot, type FarmTask, type FieldId, type PenId,
} from './model';

const STATE_TONE: Readonly<Record<VisualState, string>> = { normal: '#38a88a', busy: '#5088ec', warning: '#dca644', critical: '#df6470', inactive: '#91a0b5' };
const STATE_LABEL: Readonly<Record<VisualState, string>> = { normal: 'OK', busy: 'In hand', warning: 'Needs attention', critical: 'Act now', inactive: 'Empty' };

export function StateBadge({ state, label }: { state: VisualState; label?: string }) {
  return <StatusBadge label={label ?? STATE_LABEL[state]} tone={HUD_STATE_TONE[state]} />;
}
export function TaskBadge({ task }: { task: FarmTask }) {
  const value = TASK_STATUS[task.status];
  return <StatusBadge label={value.label} tone={HUD_STATE_TONE[value.state]} />;
}
const levelText = (level: number) => level <= 0 ? 'Empty' : `${level} %`;

export type FarmMetricId = 'livestock' | 'alerts' | 'troughs' | 'tasks';
/** Four short panels for the top of the floating HUD. The viewport supplies the detail each one opens. */
export function farmHudMetrics(snapshot: FarmSnapshot, actions: Readonly<Record<FarmMetricId, MetricAction>>): readonly HudMetric[] {
  const m = farmMetrics(snapshot);
  return [
    { id: 'livestock', title: 'Livestock', value: m.animals, tone: m.missing ? 'critical' : 'success', visual: { kind: 'capacity', max: m.animals + m.missing }, comparison: m.missing ? `${m.missing} missing at the last count` : 'All animals counted', action: actions.livestock, icon: <Bird size={16} /> },
    { id: 'alerts', title: 'Animal alerts', value: m.alerts, tone: m.critical ? 'critical' : m.alerts ? 'warning' : 'success', comparison: m.critical ? `${m.critical} need action now` : m.alerts ? 'Watch list' : 'No health alerts', action: actions.alerts, icon: <AlertTriangle size={16} /> },
    { id: 'troughs', title: 'Troughs to refill', value: m.refill, tone: m.empty ? 'critical' : m.refill ? 'warning' : 'success', comparison: m.empty ? `${m.empty} empty` : `Below ${TROUGH_LIMITS.low} % counts as low`, action: actions.troughs, icon: <Droplets size={16} /> },
    { id: 'tasks', title: 'Open tasks', value: m.open, tone: m.overdue ? 'warning' : 'info', comparison: m.overdue ? `${m.overdue} overdue` : `${m.ripe} field${m.ripe === 1 ? '' : 's'} ready to harvest`, action: actions.tasks, icon: <ClipboardList size={16} /> },
  ];
}

/** One chip per pen: species, headcount, trough level and state. */
export function PenChips({ snapshot, selected, onSelect }: { snapshot: FarmSnapshot; selected?: PenId; onSelect: (id: PenId) => void }) {
  return <nav className="farm-pens" aria-label="Pens">{PENS.map(pen => {
    const record = penRecord(snapshot, pen.id), state = penState(snapshot, pen.id), alert = state === 'warning' || state === 'critical';
    return <button key={pen.id} data-alert={alert || undefined} aria-pressed={selected === pen.id} aria-label={`Inspect ${pen.label}: ${record.headcount} of ${record.expected} ${SPECIES[pen.species].plural}, trough ${levelText(record.level)}`} style={{ borderTopColor: STATE_TONE[state] }} onClick={() => onSelect(pen.id)}>
      <HudObjectThumbnail model={pen.species} /><strong>{pen.label}</strong><span>{record.headcount}{record.headcount < record.expected ? ` / ${record.expected}` : ''} {SPECIES[pen.species].plural}</span>
      <meter min={0} max={100} low={TROUGH_LIMITS.low} optimum={100} value={record.level} aria-hidden="true" /><small style={{ color: STATE_TONE[troughState(record.level)] }}>{pen.trough.variant === 'water' ? 'Water' : 'Feed'} {levelText(record.level)}</small>
    </button>;
  })}</nav>;
}

export function FieldTable({ snapshot, onSelect }: { snapshot: FarmSnapshot; onSelect: (id: FieldId) => void }) {
  return <div className="hud-table farm-table-wrap"><table><thead><tr><th>Field</th><th>Crop</th><th>Area</th><th>Stage</th><th>Soil moisture</th><th>Next</th></tr></thead><tbody>{FIELDS.map(value => {
    const record = fieldRecord(snapshot, value.id);
    return <tr key={value.id} data-ripe={record.stage === 'ripe' || undefined}><td><button onClick={() => onSelect(value.id)} aria-label={`Inspect ${value.name}`}><HudObjectLabel model="crop-field">{value.name}</HudObjectLabel></button></td><td>{value.crop}</td><td>{value.hectares.toFixed(1)} ha</td><td>{STAGE_LABELS[record.stage]}</td><td>{record.moisture} %</td><td>{record.next}</td></tr>;
  })}</tbody></table></div>;
}

const TASK_MODELS: Readonly<Partial<Record<string, HudThumbnailModel>>> = { coop: 'chicken-coop', field: 'crop-field', silo: 'grain-silo', tractor: 'tractor', trough: 'trough' };
function taskModel(snapshot: FarmSnapshot, node: string): HudThumbnailModel {
  const [kind, id] = node.split(':');
  const penId = kind === 'pin' ? id : kind === 'animal' ? snapshot.flags.find(flag => flag.tag === id)?.pen : undefined;
  return PENS.find(pen => pen.id === penId)?.species ?? TASK_MODELS[kind] ?? 'map-pin';
}

export function TaskList({ snapshot, onSelect }: { snapshot: FarmSnapshot; onSelect: (node: string) => void }) {
  return <ol className="farm-tasks" aria-label="Today's tasks">{snapshot.tasks.map(value => <li key={value.id} data-status={value.status}>
    <button onClick={() => onSelect(value.node)} aria-label={`Show ${value.title} in the scene`}><HudObjectLabel model={taskModel(snapshot, value.node)}><strong>{value.title}</strong><span>{value.due} · {value.who}</span></HudObjectLabel></button><TaskBadge task={value} />
  </li>)}</ol>;
}

export function AlertList({ snapshot, onSelect }: { snapshot: FarmSnapshot; onSelect: (node: string) => void }) {
  const troughs = PENS.filter(pen => troughState(penRecord(snapshot, pen.id).level) !== 'normal');
  if (!snapshot.flags.length && !troughs.length) return <p className="farm-quiet">No animal or trough alerts in this snapshot.</p>;
  return <nav className="farm-alerts" aria-label="Alerts">
    {snapshot.flags.map(flag => <button key={flag.tag} data-severity={flag.severity} onClick={() => onSelect(flagNode(flag))}><HudObjectThumbnail model={penOf(flag.pen).species} /><strong>{flag.tag} · {flag.issue}</strong><span>{penOf(flag.pen).label}{flag.missing ? ' · not in the scene' : ''}</span></button>)}
    {troughs.map(pen => { const level = penRecord(snapshot, pen.id).level; return <button key={pen.id} data-severity={level <= 0 ? 'critical' : 'warning'} onClick={() => onSelect(`trough:${pen.id}`)}><HudObjectThumbnail model="trough" /><strong>{pen.label} {pen.trough.variant} · {levelText(level)}</strong><span>Refill or check the supply</span></button>; })}
  </nav>;
}

function FlagCard({ flag }: { flag: AnimalFlag }) {
  return <div className="farm-card" data-severity={flag.severity}><div><strong>{flag.tag}</strong><span>{flag.issue}</span></div><small>{flag.note}</small></div>;
}

export function PenInspector({ snapshot, id }: { snapshot: FarmSnapshot; id: PenId }) {
  const pen = penOf(id), record = penRecord(snapshot, id), flags = flagsOf(snapshot, id), state = penState(snapshot, id);
  return <aside className="farm-inspector" aria-label="Pen inspector"><div className="farm-eyebrow">PEN / {SPECIES[pen.species].plural.toUpperCase()}</div><h2>{pen.label}</h2><StateBadge state={state} />
    <dl><dt>Headcount</dt><dd>{record.headcount} of {record.expected}</dd><dt>Capacity</dt><dd>{pen.capacity}</dd><dt>{pen.trough.variant === 'water' ? 'Water tank' : 'Feed trough'}</dt><dd>{levelText(record.level)}</dd><dt>Shown in the scene</dt><dd>{Math.min(record.headcount, pen.shown)} animals</dd></dl>
    <p>{record.note}</p>{flags.map(flag => <FlagCard key={flag.tag} flag={flag} />)}
    <div className="farm-host-note">The headcount comes from the host&apos;s herd record; up to {pen.shown} animals are drawn. The pin turns amber or red with the pen state.</div></aside>;
}

export function AnimalInspector({ snapshot, tag }: { snapshot: FarmSnapshot; tag: string }) {
  const flag = snapshot.flags.find(value => value.tag === tag);
  if (!flag) return <EmptyInspector />;
  const pen = penOf(flag.pen);
  return <aside className="farm-inspector" aria-label="Animal inspector"><div className="farm-eyebrow">{SPECIES[pen.species].label.toUpperCase()} / {pen.label.toUpperCase()}</div><h2>{flag.tag}</h2><StateBadge state={flag.severity} label={flag.issue} />
    <p>{flag.note}</p><div className="farm-host-note">A separate marker shows the alert supplied by the host; identification tags stay neutral and the pose is illustrative.</div></aside>;
}

/** An untagged animal stands for its herd: the herd record has no per-animal data, so it shows the pen. */
export function HerdAnimalInspector({ snapshot, id }: { snapshot: FarmSnapshot; id: PenId }) {
  const pen = penOf(id), record = penRecord(snapshot, id), flags = flagsOf(snapshot, id);
  return <aside className="farm-inspector" aria-label="Herd animal inspector"><div className="farm-eyebrow">{SPECIES[pen.species].label.toUpperCase()} / {pen.label.toUpperCase()}</div><h2>{SPECIES[pen.species].label}</h2><StateBadge state="normal" label="No open flag" />
    <dl><dt>Pen</dt><dd>{pen.label}</dd><dt>Headcount</dt><dd>{record.headcount} of {record.expected}</dd><dt>{pen.trough.variant === 'water' ? 'Water tank' : 'Feed trough'}</dt><dd>{levelText(record.level)}</dd><dt>Open flags in the pen</dt><dd>{flags.length}</dd></dl>
    <div className="farm-host-note">Untagged animals stand for the herd; the host&apos;s herd record has no per-animal data. Pose and spot are illustrative.</div></aside>;
}

const YARD_ANIMALS: Readonly<Record<string, { title: string; eyebrow: string; note: string; icon: typeof Dog }>> = {
  dog: { title: 'Yard dog', eyebrow: 'YARD LIFE / DOG', note: 'Patrols the yard on a fixed loop.', icon: Dog },
  cat: { title: 'Farm cat', eyebrow: 'YARD LIFE / CAT', note: 'Rests by the yard.', icon: Cat },
  bird: { title: 'Small bird', eyebrow: 'YARD LIFE / BIRD', note: 'Circles over the fields, 5 to 7 m up.', icon: Bird },
};
/** Yard animals bring the scene to life; the host keeps no record of them. */
export function YardAnimalInspector({ node }: { node: string }) {
  const value = YARD_ANIMALS[node.split(':')[0]];
  if (!value) return <EmptyInspector />;
  const Icon = value.icon;
  return <aside className="farm-inspector" aria-label="Yard animal inspector"><div className="farm-eyebrow">{value.eyebrow}</div><h2><Icon size={20} aria-hidden="true" /> {value.title}</h2><p>{value.note}</p>
    <div className="farm-host-note">Scene life only: no herd, sensor or task record belongs to it.</div></aside>;
}

export function TroughInspector({ snapshot, id }: { snapshot: FarmSnapshot; id: PenId }) {
  const pen = penOf(id), level = penRecord(snapshot, id).level, state = troughState(level);
  return <aside className="farm-inspector" aria-label="Trough inspector"><div className="farm-eyebrow">{pen.trough.variant === 'water' ? 'WATER TANK' : 'FEED TROUGH'} / MOCK LEVEL SENSOR</div><h2>{pen.label}</h2><StateBadge state={state} />
    <dl><dt>Level</dt><dd>{levelText(level)}</dd><dt>Low below</dt><dd>{TROUGH_LIMITS.low} %</dd></dl>
    <p>{state === 'normal' ? 'Level is fine.' : state === 'inactive' ? 'Empty: refill now and check the supply or float valve.' : 'Low: refill on the next round.'}</p>
    <div className="farm-host-note">The lamp shows the state; an empty trough is drawn without water or feed. The model does not encode the level.</div></aside>;
}

export function FieldInspector({ snapshot, id, tractor }: { snapshot: FarmSnapshot; id: FieldId; tractor: boolean }) {
  const value = fieldOf(id), record = fieldRecord(snapshot, id);
  return <aside className="farm-inspector" aria-label="Field inspector"><div className="farm-eyebrow">FIELD / {value.crop.toUpperCase()}</div><h2><Wheat size={20} aria-hidden="true" /> {value.name}</h2><StateBadge state={record.stage === 'ripe' ? 'busy' : 'normal'} label={STAGE_LABELS[record.stage]} />
    <dl><dt>Area</dt><dd>{value.hectares.toFixed(1)} ha</dd><dt>Soil moisture</dt><dd>{record.moisture} %</dd><dt>Next</dt><dd>{record.next}</dd><dt>Tractor</dt><dd>{tractor ? 'Working here' : '—'}</dd></dl>
    <div className="farm-host-note">The field is drawn at a reduced, disclosed size; its area comes from the field record. The stage is a coarse visual season.</div></aside>;
}

export function YardInspector({ snapshot, node }: { snapshot: FarmSnapshot; node: string }) {
  const [kind, id] = node.split(':'), silo = snapshot.silos.find(value => value.id === id);
  if (kind === 'silo' && silo) return <aside className="farm-inspector" aria-label="Silo inspector"><div className="farm-eyebrow">GRAIN STORE / SILO {silo.id}</div><h2><Warehouse size={20} aria-hidden="true" /> Silo {silo.id}</h2><StateBadge state={silo.fill < 10 ? 'warning' : 'normal'} label={`${silo.fill} % full`} /><dl><dt>Grain</dt><dd>{silo.grain}</dd><dt>Fill</dt><dd>{silo.fill} %</dd></dl><div className="farm-host-note">The silo model does not encode a fill level; it comes from the host&apos;s store record.</div></aside>;
  if (kind === 'tractor') return <aside className="farm-inspector" aria-label="Tractor inspector"><div className="farm-eyebrow">MACHINERY / TRACTOR</div><h2><Tractor size={20} aria-hidden="true" /> Tractor</h2><StateBadge state={snapshot.tractor.status === 'working' ? 'busy' : snapshot.tractor.status === 'service' ? 'warning' : 'normal'} label={snapshot.tractor.status} /><dl><dt>Operator</dt><dd>{snapshot.tractor.operator ?? '—'}</dd><dt>Field</dt><dd>{snapshot.tractor.field ? fieldOf(snapshot.tractor.field).name : '—'}</dd></dl><p>{snapshot.tractor.note}</p></aside>;
  if (kind === 'coop') return <aside className="farm-inspector" aria-label="Hen house inspector"><div className="farm-eyebrow">POULTRY / HEN HOUSE</div><h2>Hen house</h2><StateBadge state="normal" label={snapshot.coop.open ? 'Pop hole open' : 'Shut'} /><dl><dt>Eggs collected</dt><dd>{snapshot.coop.eggs}</dd></dl></aside>;
  return <aside className="farm-inspector" aria-label="Barn inspector"><div className="farm-eyebrow">STORAGE / BARN</div><h2><Warehouse size={20} aria-hidden="true" /> Barn</h2><StateBadge state="normal" label={snapshot.barn.open ? 'Doors open' : 'Doors shut'} /><dl><dt>Bales in store</dt><dd>{snapshot.barn.bales}</dd></dl><div className="farm-host-note">The bales beside the barn are decoration; the stock count comes from the host.</div></aside>;
}

export function EmptyInspector() {
  return <div className="farm-inspector"><div className="farm-eyebrow">FARM INSPECTOR</div><h2>Select a pen</h2><p>Choose a pen pin, a trough, an animal, a field or a building in the scene, or use the Pens, Fields, Tasks and Alerts panels.</p><p>Pins and tags: green OK, blue in hand, amber needs attention, red act now. An empty trough is drawn dry with its lamp off.</p></div>;
}

export const FARM_CATALOG = [
  ['cow', 'Cow'], ['horse', 'Horse'], ['sheep', 'Sheep'], ['pig', 'Pig'], ['chicken', 'Chicken'], ['dog', 'Dog'], ['cat', 'Cat'], ['bird', 'Small bird'],
  ['barn', 'Barn'], ['paddock-fence', 'Paddock fence'], ['hay-bale', 'Hay bale'], ['trough', 'Trough'], ['chicken-coop', 'Chicken coop'], ['crop-field', 'Crop field'],
  ['tractor', 'Tractor'], ['grain-silo', 'Grain silo'], ['terrain', 'Terrain'], ['map-pin', 'Map pin'], ['worker', 'Worker'],
] as const;
/** Links to the shared catalog pages of every model in the scene. */
export function FarmLibrary() {
  return <section className="farm-library" aria-label="Farm objects"><h3><Wheat size={15} aria-hidden="true" /> {FARM_CATALOG.length} shared objects in this scene</h3>
    <ul>{FARM_CATALOG.map(([asset, name]) => <li key={asset}><Link href={`/docs/objects/${asset}`}>{name}</Link></li>)}</ul></section>;
}

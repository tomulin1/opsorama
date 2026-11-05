/** Optional presentation primitives. No scene, framework or browser runtime. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'critical';
export type PanelState = 'ready' | 'loading' | 'empty' | 'error';
export type PanelStyle = Readonly<Record<string, string>>;
export interface PanelSlots<T> { header?: T; icon?: T; actions?: T; footer?: T; loading?: T; empty?: T; error?: T; }
export interface DataPanelProps<T> {
  id?: string; className?: string; style?: PanelStyle; label?: string;
  title?: string; description?: string; density?: 'compact' | 'comfortable';
  state?: PanelState; slots?: PanelSlots<T>; children?: T;
  freshness?: { label: string; state: 'fresh' | 'stale' | 'offline' | 'unknown' };
}
/**
 * Purpose of a short panel, not a scale; see docs/decisions/0065-hud-panel-system.md.
 * s (signal, 52 px): title, value, one graphic. m (reading, 84 px): adds one context, delta before comparison.
 * Context a size hides stays readable by assistive technology.
 */
export type MetricSize = 's' | 'm';
/** Host-computed change. The label carries the amount; direction only draws the arrow; tone defaults to neutral. */
export interface MetricDelta { label: string; direction: 'up' | 'down' | 'flat'; tone?: Tone; }
/**
 * Graphic of a sized metric. symbol: tinted icon block. trend: sparkline of finite points, oldest first, with a required
 * accessible label; fewer than two points draw nothing. It replaces the icon at size s and the context at size m.
 * capacity: ring around the icon from the numeric metric value between min (default 0) and max; a non-numeric value or
 * null max draws an empty ring.
 */
export type MetricVisual = { kind: 'symbol' } | { kind: 'trend'; points: readonly number[]; label: string } | { kind: 'capacity'; max: number | null; min?: number };
/** Makes a sized card one button that opens the detail behind it. label is the accessible name; pressed reports that the detail is open. */
export interface MetricAction { label: string; onActivate: () => void; pressed?: boolean; }
export interface MetricCardProps<T> extends Omit<DataPanelProps<T>, 'density'> {
  value: number | string | null; unit?: string; formatValue?: (value: number | string) => string;
  comparison?: T; unknownLabel?: string;
  /** Required. Heights are exact without footer or freshness; description is ignored. */
  size: MetricSize;
  /** Sized cards only. Host-chosen state; default neutral. Warning and critical also color the value. */
  tone?: Tone;
  /** Sized cards only. */
  delta?: MetricDelta;
  /** Sized cards only. Default symbol. */
  visual?: MetricVisual;
  /** Sized cards only, while state is ready. The host owns what opens. */
  action?: MetricAction;
}
export interface StatusBadgeProps<T> { label: string; tone?: Tone; icon?: T; className?: string; }
export interface Field<T> { id: string; label: T; value: T | null; }
export interface FieldListProps<T> { fields: readonly Field<T>[]; unknownLabel?: string; }
export interface EntityInspectorProps<T> extends DataPanelProps<T> { fields?: readonly Field<T>[]; unknownLabel?: string; }
export interface ProcessStep<T> {
  id: string; label: T; description?: T; meta?: T; status?: string; tone?: Tone;
  current?: boolean; disabled?: boolean;
}
export interface ProcessTrackerProps<T> extends DataPanelProps<T> {
  steps: readonly ProcessStep<T>[]; orientation?: 'horizontal' | 'vertical';
  onSelect?: (id: string) => void;
}
export interface ResourceItem<T> { id: string; label: T; description?: T; value?: T; status?: string; tone?: Tone; disabled?: boolean; }
export interface ResourceListProps<T> extends DataPanelProps<T> {
  items: readonly ResourceItem<T>[]; selectedId?: string | null; onSelect?: (id: string) => void;
}
export interface ValueMeterProps {
  label: string; value: number | null; min?: number; max: number | null;
  unit?: string; formatValue?: (value: number) => string; tone?: Tone; unknownLabel?: string;
}
export interface CapacityCardProps<T> extends DataPanelProps<T> { meter: ValueMeterProps; }
export interface ActivityItem<T> { id: string; content: T; timeLabel?: string; dateTime?: string; meta?: T; }
export interface ActivityFeedProps<T> extends DataPanelProps<T> { items: readonly ActivityItem<T>[]; }
export interface ZoomLabels { group: string; zoomIn: string; zoomOut: string; reset: string; slider: string; fps: string; fpsUnit: string; fpsHint: string; }
/** Spoken slider value. multiplier: 1.25×; percent: relative to defaultValue; or a host formatter. */
export type ZoomFormat = 'multiplier' | 'percent' | ((value: number, defaultValue: number) => string);
export interface ZoomControlProps<T> {
  value: number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number; defaultValue?: number;
  /** Native range granularity. Browsers snap to min + k × sliderStep, so the default is 'any'. */
  sliderStep?: number | 'any';
  controls?: 'buttons' | 'slider' | 'both'; orientation?: 'horizontal' | 'vertical';
  /** toolbar: standalone compact bar with its own surface; plain: no surface, for host toolbars. */
  appearance?: 'toolbar' | 'plain';
  /** The control shows no zoom value; format only sets the slider's aria-valuetext. Default multiplier. */
  format?: ZoomFormat;
  /** Host-sampled frames per second after a divider; null shows a placeholder, undefined hides it. */
  fps?: number | null; reset?: boolean; onReset?: () => void; disabled?: boolean;
  caption?: T; icons?: { zoomIn?: T; zoomOut?: T; reset?: T }; labels?: Partial<ZoomLabels>;
  id?: string; className?: string; style?: PanelStyle;
  /** compact: 26 px buttons, the default everywhere. comfortable: 30 px buttons. Coarse pointers keep 44 px targets in both. */
  density?: 'compact' | 'comfortable';
  children?: T;
}

/** Internal presentation tree, also available for custom native renderers. Slots stay opaque. */
export interface PanelElement<T> {
  kind: 'element'; tag: string; key?: string;
  attrs: Readonly<Record<string, string | number | boolean | undefined>>;
  style?: PanelStyle; onClick?: () => void; onInput?: (value: string) => void; children: readonly PanelNode<T>[];
}
export interface PanelContent<T> { kind: 'content'; value: T | string | number | null | undefined; }
export type PanelNode<T> = PanelElement<T> | PanelContent<T>;
type Attrs = PanelElement<never>['attrs'];
const content = <T>(value: PanelContent<T>['value']): PanelContent<T> => ({ kind: 'content', value });
const el = <T>(tag: string, attrs: Attrs, children: readonly PanelNode<T>[] = [], extra: Partial<Pick<PanelElement<T>, 'key' | 'style' | 'onClick' | 'onInput'>> = {}): PanelElement<T> => ({ kind: 'element', tag, attrs, children, ...extra });
const block = <T>(className: string, value: PanelContent<T>['value']) => el<T>('div', { class: className }, [content<T>(value)]);
function ids(items: readonly { id: string }[]) {
  const seen = new Set<string>();
  for (const item of items) { if (!item.id || seen.has(item.id)) throw new Error('Panel item IDs must be nonempty and unique.'); seen.add(item.id); }
}
function finite(value: number | null, name: string) { if (value !== null && !Number.isFinite(value)) throw new Error(`${name} must be finite or null.`); }

export function dataPanel<T>(props: DataPanelProps<T>, body: readonly PanelNode<T>[] = [content<T>(props.children)], rootAttrs: Attrs = {}): PanelElement<T> {
  const state = props.state ?? 'ready', slots = props.slots ?? {};
  const header = slots.header !== undefined ? [content<T>(slots.header)] : [
    slots.icon !== undefined ? el<T>('span', { class: 'dp-icon', 'aria-hidden': true }, [content<T>(slots.icon)]) : null,
    el<T>('div', { class: 'dp-heading' }, [props.title !== undefined ? el<T>('h3', { class: 'dp-title' }, [content<T>(props.title)]) : null, props.description !== undefined ? block<T>('dp-description', props.description) : null].filter(isNode)),
    slots.actions !== undefined ? block<T>('dp-actions', slots.actions) : null,
  ].filter(isNode);
  const message = state === 'loading' ? slots.loading ?? 'Loading…' : state === 'empty' ? slots.empty ?? 'No data.' : slots.error ?? 'Data unavailable.';
  return el<T>('section', { id: props.id, class: `dp-panel ${props.className ?? ''}`.trim(), 'aria-label': props.label ?? props.title, 'aria-busy': state === 'loading' ? true : undefined, 'data-density': props.density ?? 'comfortable', 'data-state': state, ...rootAttrs }, [
    (slots.header !== undefined || props.title !== undefined || props.description !== undefined || slots.icon !== undefined || slots.actions !== undefined) ? el<T>('header', { class: 'dp-header' }, header, { key: 'header' }) : null,
    el<T>('div', { class: 'dp-body' }, state === 'ready' ? body : [el<T>('div', { class: 'dp-state', role: state === 'error' ? 'alert' : 'status' }, [content<T>(message)])], { key: 'body' }),
    props.freshness ? el<T>('div', { class: 'dp-freshness', 'data-freshness': props.freshness.state }, [content<T>(props.freshness.label)], { key: 'freshness' }) : null,
    slots.footer !== undefined ? el<T>('footer', { class: 'dp-footer' }, [content<T>(slots.footer)], { key: 'footer' }) : null,
  ].filter(isNode), { style: props.style });
}
function isNode<T>(value: T | null): value is T { return value !== null; }

export function statusBadge<T>(props: StatusBadgeProps<T>): PanelElement<T> {
  return el<T>('span', { class: `dp-badge ${props.className ?? ''}`.trim(), 'data-tone': props.tone ?? 'neutral' }, [props.icon !== undefined ? el<T>('span', { 'aria-hidden': true }, [content<T>(props.icon)]) : null, content<T>(props.label)].filter(isNode));
}
const metricText = <T>(props: Pick<MetricCardProps<T>, 'value' | 'formatValue' | 'unknownLabel'>) => {
  if (typeof props.value === 'number') finite(props.value, 'Metric value');
  return props.value === null ? props.unknownLabel ?? 'Unknown' : props.formatValue ? props.formatValue(props.value) : String(props.value);
};
const DELTA_ARROWS = { up: '↑', down: '↓', flat: '→' } as const;
const metricDelta = <T>(delta: MetricDelta, className: string) => el<T>('span', { class: `dp-badge dp-delta ${className}`.trim(), 'data-tone': delta.tone ?? 'neutral' }, [el<T>('span', { 'aria-hidden': true }, [content<T>(DELTA_ARROWS[delta.direction])]), content<T>(delta.label)]);
/** A fixed 100 × 30 box stretched by CSS; the stroke keeps its width through non-scaling-stroke. */
function sparkline<T>(visual: Extract<MetricVisual, { kind: 'trend' }>): PanelElement<T> {
  const low = Math.min(...visual.points), span = Math.max(...visual.points) - low, last = visual.points.length - 1;
  const line = visual.points.map((point, index) => `${index ? 'L' : 'M'}${(index / last * 100).toFixed(2)} ${(span ? 28 - (point - low) / span * 26 : 15).toFixed(2)}`).join(' ');
  return el<T>('svg', { class: 'dp-spark', viewBox: '0 0 100 30', preserveAspectRatio: 'none', role: 'img', 'aria-label': visual.label }, [el<T>('path', { class: 'dp-spark-area', d: `${line} L100 30 L0 30 Z` }), el<T>('path', { class: 'dp-spark-line', d: line })]);
}
/** Layout of a sized MetricCard. */
function metricContent<T>(props: Pick<MetricCardProps<T>, 'value' | 'unit' | 'formatValue' | 'comparison' | 'unknownLabel' | 'tone' | 'delta' | 'visual' | 'title'> & { icon?: T }, size: MetricSize, heading: readonly PanelNode<T>[], children?: T): PanelNode<T>[] {
  const text = metricText(props), visual = props.visual ?? { kind: 'symbol' };
  if (visual.kind === 'trend') visual.points.forEach(point => finite(point, 'Metric trend point'));
  const trend = visual.kind === 'trend' && visual.points.length >= 2 ? visual : null;
  // Delta outranks comparison; a sparkline takes the context space.
  const showsContext = size === 'm' && !trend;
  const shownDelta = showsContext && props.delta !== undefined, shownComparison = showsContext && props.delta === undefined;
  const main = el<T>('div', { class: 'dp-metric-main' }, [
    ...heading,
    el<T>('div', { class: 'dp-metric-value' }, [content<T>(text), props.unit ? el<T>('span', { class: 'dp-unit' }, [content<T>(props.unit)]) : null].filter(isNode)),
    props.delta !== undefined ? metricDelta<T>(props.delta, shownDelta ? '' : 'dp-sr-only') : null,
    props.comparison !== undefined ? block<T>(shownComparison ? 'dp-comparison' : 'dp-comparison dp-sr-only', props.comparison) : null,
    children !== undefined ? content<T>(children) : null,
  ].filter(isNode));
  const icon = props.icon !== undefined ? el<T>('span', { class: 'dp-metric-symbol', 'aria-hidden': true }, [content<T>(props.icon)]) : null;
  if (visual.kind === 'capacity') {
    const meter = meterState({ label: props.title ?? '', value: typeof props.value === 'number' ? props.value : null, min: visual.min, max: visual.max, unit: props.unit, formatValue: props.formatValue, unknownLabel: props.unknownLabel });
    const arc = meter.ratio > 0 ? [el<T>('circle', { class: 'dp-ring-value', cx: 50, cy: 50, r: 43, pathLength: 100 }, [], { style: { strokeDasharray: `${(meter.ratio * 100).toFixed(2)} 100` } })] : [];
    return [el<T>('div', { class: 'dp-ring', role: meter.known ? 'meter' : undefined, 'aria-label': meter.known ? props.title : undefined, 'aria-valuemin': meter.known ? meter.min : undefined, 'aria-valuemax': meter.known ? meter.max! : undefined, 'aria-valuenow': meter.clamped, 'aria-valuetext': meter.known ? meter.text : undefined }, [
      el<T>('svg', { viewBox: '0 0 100 100', 'aria-hidden': true }, [el<T>('circle', { class: 'dp-ring-track', cx: 50, cy: 50, r: 43 }), ...arc]),
      ...(icon ? [icon] : []),
    ]), main];
  }
  if (trend) return [...(size !== 's' && icon ? [icon] : []), main, sparkline<T>(trend)];
  return [...(icon ? [icon] : []), main];
}
const metricAttrs = (size: MetricSize, tone: Tone | undefined, visual: MetricVisual | undefined) => ({ 'data-size': size, 'data-tone': tone ?? 'neutral', 'data-visual': visual?.kind ?? 'symbol' });
export function metricCard<T>(props: MetricCardProps<T>): PanelElement<T> {
  const size = props.size;
  if (size === undefined) throw new Error('MetricCard needs a size. Set size to s or m.');
  const slots = props.slots ?? {}, title = props.title !== undefined ? el<T>('h3', { class: 'dp-title' }, [content<T>(props.title)]) : null;
  const heading = slots.header !== undefined ? [content<T>(slots.header)] : [title, slots.actions !== undefined ? block<T>('dp-actions', slots.actions) : null].filter(isNode);
  // A stretched sibling: headings and meters cannot live inside a button.
  const action = props.action ? [el<T>('button', { type: 'button', class: 'dp-metric-action', 'aria-label': props.action.label, 'aria-pressed': props.action.pressed }, [], { key: 'action', onClick: props.action.onActivate })] : [];
  const body = [el<T>('div', { class: 'dp-metric-layout' }, [...metricContent<T>({ ...props, icon: slots.icon }, size, heading.length ? [el<T>('div', { class: 'dp-metric-heading' }, heading)] : [], props.children), ...action])];
  // Only ready content uses this layout; state placeholders keep the ordinary header.
  const panel = (props.state ?? 'ready') === 'ready' ? { ...props, title: undefined, description: undefined, slots: { ...slots, header: undefined, icon: undefined, actions: undefined } } : props;
  return dataPanel<T>({ ...panel, label: props.label ?? props.title, className: `dp-metric ${props.className ?? ''}`.trim() }, body, metricAttrs(size, props.tone, props.visual));
}
export function fieldList<T>(props: FieldListProps<T>): PanelElement<T> {
  ids(props.fields);
  return el<T>('dl', { class: 'dp-fields' }, props.fields.map(field => el<T>('div', { class: 'dp-field' }, [el<T>('dt', {}, [content<T>(field.label)]), el<T>('dd', {}, [content<T>(field.value === null ? props.unknownLabel ?? 'Unknown' : field.value)])], { key: field.id })));
}
export function entityInspector<T>(props: EntityInspectorProps<T>): PanelElement<T> {
  return dataPanel(props, [fieldList<T>({ fields: props.fields ?? [], unknownLabel: props.unknownLabel }), content<T>(props.children)]);
}
export function processTracker<T>(props: ProcessTrackerProps<T>): PanelElement<T> {
  ids(props.steps);
  return dataPanel(props, [el<T>('ol', { class: 'dp-process', 'data-orientation': props.orientation ?? 'horizontal' }, props.steps.map((step, index) => {
    const children = [el<T>('span', { class: 'dp-step-index', 'aria-hidden': true }, [content<T>(index + 1)]), el<T>('div', { class: 'dp-item-main' }, [block<T>('dp-item-label', step.label), step.description !== undefined ? block<T>('dp-description', step.description) : null, step.meta !== undefined ? block<T>('dp-meta', step.meta) : null].filter(isNode)), step.status !== undefined ? statusBadge<T>({ label: step.status, tone: step.tone }) : null].filter(isNode);
    return el<T>('li', { class: 'dp-step', 'aria-current': step.current ? 'step' : undefined, 'data-current': step.current ?? false }, [props.onSelect ? el<T>('button', { type: 'button', class: 'dp-item', disabled: step.disabled }, children, { onClick: () => { if (!step.disabled) props.onSelect?.(step.id); } }) : el<T>('div', { class: 'dp-item' }, children)], { key: step.id });
  })), content<T>(props.children)]);
}
export function resourceList<T>(props: ResourceListProps<T>): PanelElement<T> {
  ids(props.items);
  return dataPanel(props, [el<T>('ul', { class: 'dp-list' }, props.items.map(item => {
    const children = [el<T>('div', { class: 'dp-item-main' }, [block<T>('dp-item-label', item.label), item.description !== undefined ? block<T>('dp-description', item.description) : null].filter(isNode)), item.value !== undefined ? block<T>('dp-item-value', item.value) : null, item.status !== undefined ? statusBadge<T>({ label: item.status, tone: item.tone }) : null].filter(isNode);
    return el<T>('li', {}, [props.onSelect ? el<T>('button', { type: 'button', class: 'dp-item', disabled: item.disabled, 'aria-pressed': props.selectedId === item.id }, children, { onClick: () => { if (!item.disabled) props.onSelect?.(item.id); } }) : el<T>('div', { class: 'dp-item' }, children)], { key: item.id });
  })), content<T>(props.children)]);
}
function meterState(props: ValueMeterProps) {
  const min = props.min ?? 0;
  finite(min, 'Minimum'); finite(props.max, 'Maximum'); finite(props.value, 'Value');
  if (props.max !== null && props.max < min) throw new Error('Maximum must be at least minimum.');
  const format = props.formatValue ?? String, suffix = props.unit ? ` ${props.unit}` : '';
  const known = props.value !== null && props.max !== null && props.max > min;
  const range = known && props.value! < min ? 'underflow' : known && props.value! > props.max! ? 'overflow' : 'within';
  const exact = props.value === null ? props.unknownLabel ?? 'Unknown' : `${format(props.value)}${suffix}`;
  const limits = props.max === null || props.max === min ? props.unknownLabel ?? 'Unknown' : `${min === 0 ? '' : `${format(min)}–`}${format(props.max)}${suffix}`;
  const text = `${exact} / ${limits}${range === 'underflow' ? ' (below range)' : range === 'overflow' ? ' (above range)' : ''}`;
  const clamped = known ? Math.min(props.max!, Math.max(min, props.value!)) : undefined;
  const span = known ? props.max! - min : 0;
  // Halving first avoids overflowing the difference between finite extreme endpoints.
  const ratio = known ? Number.isFinite(span) ? (clamped! - min) / span : (clamped! / 2 - min / 2) / (props.max! / 2 - min / 2) : 0;
  return { min, max: props.max, known, range, text, clamped, ratio };
}
export function valueMeter<T = never>(props: ValueMeterProps): PanelElement<T> {
  const { min, known, range, text, clamped, ratio } = meterState(props);
  return el<T>('div', { class: 'dp-meter', 'data-tone': props.tone ?? 'info', 'data-range': known ? range : 'unknown' }, [
    el<T>('div', { class: 'dp-meter-reading' }, [content<T>(props.label), el<T>('span', {}, [content<T>(text)])]),
    el<T>('div', { class: 'dp-meter-track', role: known ? 'meter' : undefined, 'aria-label': props.label, 'aria-valuemin': known ? min : undefined, 'aria-valuemax': known ? props.max! : undefined, 'aria-valuenow': clamped, 'aria-valuetext': known ? text : undefined }, [el<T>('span', { class: 'dp-meter-fill' }, [], { style: { width: `${ratio * 100}%` } })]),
  ]);
}
export function capacityCard<T>(props: CapacityCardProps<T>): PanelElement<T> { return dataPanel(props, [valueMeter<T>(props.meter), content<T>(props.children)]); }
export function activityFeed<T>(props: ActivityFeedProps<T>): PanelElement<T> {
  ids(props.items);
  return dataPanel(props, [el<T>('ol', { class: 'dp-list dp-feed' }, props.items.map(item => el<T>('li', { class: 'dp-event' }, [item.timeLabel !== undefined ? el<T>('time', { datetime: item.dateTime, class: 'dp-meta' }, [content<T>(item.timeLabel)]) : null, block<T>('dp-event-content', item.content), item.meta !== undefined ? block<T>('dp-meta', item.meta) : null].filter(isNode), { key: item.id }))), content<T>(props.children)]);
}

/** Defaults match the scene zoom range validated by @opsorama/core. */
export const ZOOM_DEFAULTS: Readonly<{ min: number; max: number; step: number; defaultValue: number }> = Object.freeze({ min: .65, max: 5, step: .1, defaultValue: 1 });
const ZOOM_LABELS: Readonly<ZoomLabels> = Object.freeze({ group: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset zoom', slider: 'Zoom level', fps: 'Scene FPS', fpsUnit: 'FPS', fpsHint: 'Rendered scene frames per second, averaged over the latest sample. This is not GPU execution timing.' });
// Rounding removes binary drift such as 1.05 + 0.2 = 1.2500000000000002.
const settle = (value: number) => Math.round(value * 1e4) / 1e4;
/** Clamped, drift-free zoom after adding delta. */
export function stepZoom(value: number, delta: number, range: { min: number; max: number } = ZOOM_DEFAULTS): number {
  return Math.min(range.max, Math.max(range.min, settle(value + delta)));
}
export function formatZoom(value: number, format: ZoomFormat = 'multiplier', defaultValue = ZOOM_DEFAULTS.defaultValue): string {
  return typeof format === 'function' ? format(value, defaultValue) : format === 'percent' ? `${Math.round(value / defaultValue * 100)}%` : `${value.toFixed(2)}×`;
}
const ICON_PARTS: Readonly<Record<'in' | 'out' | 'reset', readonly Attrs[]>> = {
  out: [{ tag: 'circle', cx: 11, cy: 11, r: 7 }, { tag: 'path', d: 'm20 20-4-4M8 11h6' }],
  in: [{ tag: 'circle', cx: 11, cy: 11, r: 7 }, { tag: 'path', d: 'm20 20-4-4M8 11h6M11 8v6' }],
  reset: [{ tag: 'path', d: 'M3 12a9 9 0 1 0 2.7-6.4L3 8' }, { tag: 'path', d: 'M3 3v5h5' }],
};
/** Built-in stroke icons; hosts replace them through icons. */
function zoomIcon<T>(kind: 'in' | 'out' | 'reset'): PanelElement<T> {
  const size = kind === 'reset' ? 15 : 16;
  return el<T>('svg', { class: 'zc-icon', xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'aria-hidden': true },
    ICON_PARTS[kind].map(({ tag, ...attrs }) => el<T>(String(tag), attrs)), { style: { strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' } });
}
export function zoomControl<T>(props: ZoomControlProps<T>): PanelElement<T> {
  const { min = ZOOM_DEFAULTS.min, max = ZOOM_DEFAULTS.max, step = ZOOM_DEFAULTS.step } = props;
  const defaultValue = props.defaultValue ?? Math.min(max, Math.max(min, ZOOM_DEFAULTS.defaultValue));
  for (const [name, number] of [['Zoom value', props.value], ['Minimum', min], ['Maximum', max], ['Step', step], ['Default zoom', defaultValue]] as const) finite(number, name);
  if (!(min > 0) || max <= min) throw new Error('Zoom range must be positive with maximum above minimum.');
  if (!(step > 0)) throw new Error('Zoom step must be positive.');
  const sliderStep = props.sliderStep ?? 'any';
  if (sliderStep !== 'any' && !(Number.isFinite(sliderStep) && sliderStep > 0)) throw new Error('Slider step must be positive or any.');
  if (defaultValue < min || defaultValue > max) throw new Error('Default zoom must be within the range.');
  if (props.fps != null && !(Number.isFinite(props.fps) && props.fps >= 0)) throw new Error('FPS must be a finite non-negative number or null.');
  const labels = { ...ZOOM_LABELS, ...props.labels }, icons = props.icons ?? {}, controls = props.controls ?? 'buttons';
  const vertical = props.orientation === 'vertical', appearance = props.appearance ?? 'toolbar', disabled = props.disabled ?? false;
  const change = (next: number) => { if (!disabled && next !== props.value) props.onChange(next); };
  const button = (key: 'in' | 'out' | 'reset', label: string, icon: T | undefined, off: boolean, onClick: () => void) =>
    el<T>('button', { type: 'button', class: `zc-button zc-${key}`, 'aria-label': label, title: label, disabled: off }, [icon !== undefined ? content<T>(icon) : zoomIcon<T>(key)], { key, onClick: () => { if (!off) onClick(); } });
  const buttons = controls !== 'slider';
  const zoomIn = buttons ? button('in', labels.zoomIn, icons.zoomIn, disabled || props.value >= max, () => change(stepZoom(props.value, step, { min, max }))) : null;
  const zoomOut = buttons ? button('out', labels.zoomOut, icons.zoomOut, disabled || props.value <= min, () => change(stepZoom(props.value, -step, { min, max }))) : null;
  const slider = controls !== 'buttons' ? el<T>('input', { type: 'range', class: 'zc-slider', min, max, step: sliderStep, value: Math.min(max, Math.max(min, props.value)), 'aria-label': labels.slider, 'aria-valuetext': formatZoom(props.value, props.format, defaultValue), disabled }, [], { key: 'slider', onInput: value => change(stepZoom(Number(value), 0, { min, max })) }) : null;
  const reset = props.reset ? button('reset', labels.reset, icons.reset, disabled, () => props.onReset ? props.onReset() : change(defaultValue)) : null;
  const caption = props.caption !== undefined ? el<T>('span', { class: 'zc-caption' }, [content<T>(props.caption)], { key: 'caption' }) : null;
  return el<T>('div', { id: props.id, class: `zc-control ${props.className ?? ''}`.trim(), role: 'group', 'aria-label': labels.group, 'data-orientation': vertical ? 'vertical' : 'horizontal', 'data-appearance': appearance, 'data-density': props.density ?? 'compact' }, [
    caption, ...(vertical ? [zoomIn, slider, zoomOut] : [zoomOut, slider, zoomIn]), reset,
    // FPS and host content such as extra view buttons follow a divider in the toolbar.
    (props.fps !== undefined || props.children !== undefined) && appearance === 'toolbar' ? el<T>('span', { class: 'zc-separator', 'aria-hidden': true }, [], { key: 'separator' }) : null,
    props.fps !== undefined ? el<T>('span', { class: 'zc-fps', title: labels.fpsHint }, [el<T>('output', { 'aria-label': labels.fps, 'aria-live': 'off' }, [content<T>(props.fps === null ? '—' : Math.round(props.fps))]), el<T>('span', { class: 'zc-fps-unit', 'aria-hidden': true }, [content<T>(labels.fpsUnit)])], { key: 'fps' }) : null,
    props.children !== undefined ? content<T>(props.children) : null,
  ].filter(isNode), { style: props.style });
}

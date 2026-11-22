import { validateMaterialOverrides, type MaterialOverrides } from './palette';
import { validateAttachments, validateNodeTransfer, type Attachment, type NodeTransfer } from './attachment';
export * from './attachment';
export * from './carry';
export * from './palette';
import { validateCountInput, type CountLayout } from './asset-count';
import { validateFootprint, type Footprint } from './footprint';
import { validateInterior } from './interior';
export * from './marker';
import { validateMarker, type MarkerFields } from './marker';
export * from './footprint';
export * from './interior';
import { cloneNodeRoute, validateNodeRoute, type NodeRoute } from './route';
import { cloneNodeController, validateNodeController, type NodeController } from './controller';
import { isNodeVisible, NODE_VIEWS, validateParents, type NodeView } from './containment';
export * from './containment';
export * from './asset-count';
export * from './route';
export * from './controller';
export * from './descriptor';
export * from './navigation';
export * from './interaction';
export * from './item-policy';
export * from './behavior';
export * from './overlay';
export * from './placement';
export type Vec3 = readonly [number, number, number];
/** Optional host visual alert. Model-native support is opt-in; neutral geometry ignores it. */
export type VisualState = 'normal' | 'busy' | 'warning' | 'critical' | 'inactive';
interface NodeBase { id: string; /** Containing asset: the node uses its local coordinates and shows only while that asset's `view` is not `'closed'`. Any asset can be a parent; missing parents remain dormant. See `validateParents`. */ parentId?: string; attachment?: Attachment; entityId?: string; label?: string; labelMode?: 'always' | 'active'; position?: Vec3; rotation?: Vec3; scale?: Vec3; state?: VisualState; selectable?: boolean; }
export interface GroundNode extends NodeBase { kind: 'ground'; size: readonly [number, number]; color?: string; /** Declares this node's footprint an indoor area: nodes whose pivot lies inside it, and the area itself, neither cast nor receive shadows. Default false. See `interiorAreas`. */ interior?: boolean; }
export interface ZoneNode extends NodeBase { kind: 'zone'; size: readonly [number, number]; color?: string; /** Declares this node's footprint an indoor area: nodes whose pivot lies inside it, and the area itself, neither cast nor receive shadows. Default false. See `interiorAreas`. */ interior?: boolean; }
/**
 * Model-specific options of an asset node, keyed by option name. Core only requires plain JSON-like data (objects, arrays,
 * strings, finite numbers, booleans and null) and deep-freezes it in the store; which asset accepts which option, and the option's
 * value rules, belong to the asset's factory (`AssetFactory.validate` in `@opsorama/three`). A model package declares its
 * typed options by augmenting this interface (`declare module '@opsorama/core' { interface AssetOptions { ... } }`), as
 * `@opsorama/objects` does for its catalog. Custom assets may use any keys.
 */
export interface AssetOptions { readonly [key: string]: unknown }
export interface AssetNode extends NodeBase { kind: 'asset'; asset: string; /** Sized surface assets with an explicit `footprint` only: declares that footprint an indoor area, like `GroundNode.interior`. Default false. */ interior?: boolean; /** Disable built-in model animation only; scene/reduced-motion gates always win. */ localMotion?: boolean; /** Animate a change of `attachment` or `parentId` from the previous world pose, e.g. an item handed over; see `NodeTransfer`. */ transfer?: NodeTransfer; materials?: MaterialOverrides; /** Container view for the nodes whose `parentId` names this asset: `'closed'` (default) hides them, `'peek'` and `'open'` show them. Models may change their look with it (the building lowers its walls). Set it with `setNodeView`. */ view?: NodeView; /** Opt-in mouse preview: hovering the model's container bounds (`userData.containerBounds` set by its factory) peeks it after 160 ms and closes the peek after 280 ms outside. Hosts must still provide an explicit open/close control. Default false. */ peekOnHover?: boolean; /** Model-specific options as plain JSON-like data, validated by the asset's factory; see `AssetOptions`. A change rebuilds the model. */ options?: AssetOptions; color?: string; variant?: string; count?: number; multiplier?: number; countLayout?: CountLayout; /** Sized surface assets only (floor, terrain, sidewalk): width × depth in metres. */ footprint?: Footprint; /** Visual route that owns the root transform while present. */ route?: NodeRoute; /** Per-frame controller that owns the root position and heading; exclusive with `route`. */ controller?: NodeController; }
export interface PathNode extends NodeBase { kind: 'path'; points: readonly Vec3[]; color?: string; }
/** A projected HTML marker without geometry; see `MarkerFields`. `label` is required. */
export interface MarkerNode extends NodeBase, MarkerFields { kind: 'marker'; label: string; }
export type SceneNode = GroundNode | ZoneNode | AssetNode | PathNode | MarkerNode;
export interface SceneDefinition { schemaVersion: 1; nodes: readonly SceneNode[]; }
export interface Selection { nodeId: string; entityId?: string; origin: 'pointer' | 'keyboard' | 'api'; }
/** `corners`: floor brackets around the model footprint, hidden where objects cover them. `glow`: colored tint over the model. */
export const SELECTION_STYLES = Object.freeze(['corners', 'glow'] as const);
export type SelectionStyle = typeof SELECTION_STYLES[number];
export interface SceneSettings { theme: 'light' | 'midnight'; labels: boolean; grid: boolean; shadows: boolean; motion: boolean; paused: boolean; speed: number; zoom: number; /** How the selected and hovered node are marked. */ selectionStyle: SelectionStyle; palette?: MaterialOverrides; }
export const DEFAULT_SETTINGS: Readonly<SceneSettings> = Object.freeze({ theme: 'light', labels: true, grid: false, shadows: true, motion: true, paused: false, speed: 1, zoom: 1, selectionStyle: 'corners', palette: Object.freeze({}) });
/** Bounds validated for SceneSettings.zoom. Host controls may use a narrower range. */
export const ZOOM_RANGE: Readonly<{ min: number; max: number }> = Object.freeze({ min: .65, max: 5 });
export const SETTING_DEFINITIONS = {
  palette: { type: 'MaterialOverrides', description: 'Semantic colors for assets that declare palette support; replacing the map resets omitted roles to theme defaults.' },
  theme: { type: "'light' | 'midnight'", description: 'Canvas palette and environment lighting.' },
  labels: { type: 'boolean', description: 'Show selectable HTML labels projected onto the scene.' },
  grid: { type: 'boolean', description: 'Show a ground grid in world units.' },
  shadows: { type: 'boolean', description: 'Enable the directional-light shadow pass. Narrow or contained parts do not cast, and indoor nodes (inside a building or on an interior area) neither cast nor receive.' },
  motion: { type: 'boolean', description: 'Interpolate target positions and run asset animations. Disabled for reduced motion.' },
  paused: { type: 'boolean', description: 'Freeze interpolation and asset animation without discarding target updates.' },
  speed: { type: 'number (0.25–3)', description: 'Multiplier for interpolation and asset animation; does not change business-event time.' },
  zoom: { type: 'number (0.65–5)', description: 'Orthographic camera zoom multiplier.' },
  selectionStyle: { type: "'corners' | 'glow'", description: 'How the selected and hovered node are marked: floor brackets around the model footprint, hidden where objects cover them, or a colored tint over the model.' },
} as const satisfies Record<keyof SceneSettings, { type: string; description: string }>;
export interface SceneSnapshot { nodes: readonly SceneNode[]; selection: Selection | null; settings: Readonly<SceneSettings>; revision: number; }
/** Options of `createSceneStore`. */
export interface SceneStoreOptions {
  /**
   * Validates each asset node before the store accepts it: in the initial definition, `replace` and `upsert`. It throws an
   * actionable error to reject the node. Use `assetValidator(registry)` from `@opsorama/three` to apply the same factory
   * rules as the renderer (unknown asset names and each factory's `validate`). Default: none, so model-specific options are
   * checked only when the renderer builds the node.
   */
  validateAsset?: (node: AssetNode) => void;
}
export interface SceneStore {
  getSnapshot(): SceneSnapshot;
  subscribe(listener: () => void): () => void;
  upsert(node: SceneNode): void;
  remove(id: string): void;
  replace(nodes: readonly SceneNode[]): void;
  select(id: string | null, origin?: Selection['origin']): void;
  configure(settings: Partial<SceneSettings>): void;
  dispose(): void;
}
/** Deep copy and freeze of plain JSON-like data (objects and arrays); other values are returned as they are. */
function freezeJson<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson)) as T;
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)]))) as T;
  return value;
}
const JSON_LIKE = 'options must be plain JSON-like data (objects, arrays, strings, finite numbers, booleans, null)';
/** Throws unless `value` is plain JSON-like data: null, strings, finite numbers, booleans, arrays and plain objects (undefined properties are allowed). */
function validateJsonLike(value: unknown, path: string, seen: Set<object>): void {
  // JSON has no NaN or Infinity: both serialize as null, and the renderer compares serialized options to decide rebuilds.
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`${path} is ${value}; ${JSON_LIKE}.`); return; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value !== 'object') throw new Error(`${path} is a ${typeof value}; ${JSON_LIKE}.`);
  if (seen.has(value)) throw new Error(`${path} refers to itself; ${JSON_LIKE} without cycles.`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error(`${path} is a ${prototype?.constructor?.name ?? 'class'} instance; ${JSON_LIKE}.`);
  seen.add(value);
  for (const [key, item] of Object.entries(value)) if (item !== undefined || Array.isArray(value)) validateJsonLike(item, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, seen);
  seen.delete(value);
}
function cloneNode(node: SceneNode): SceneNode {
  node = { ...node, ...(node.attachment ? { attachment: Object.freeze({ ...node.attachment }) } : {}) };
  const transform = { ...node, ...(node.kind === 'asset' && node.transfer ? { transfer: Object.freeze({ ...node.transfer }) } : {}), ...(node.kind === 'asset' && node.materials ? { materials: Object.freeze({ ...node.materials }) } : {}), ...(node.kind === 'asset' && node.options ? { options: freezeJson(node.options) } : {}), position: node.position && Object.freeze([...node.position]) as Vec3, rotation: node.rotation && Object.freeze([...node.rotation]) as Vec3, scale: node.scale && Object.freeze([...node.scale]) as Vec3 };
  if (node.kind === 'marker') return Object.freeze({ ...transform, ...(typeof node.icon === 'object' ? { icon: Object.freeze({ paths: Object.freeze([...node.icon.paths]) }) } : {}) }) as MarkerNode;
  if (node.kind === 'path') return Object.freeze({ ...transform, kind: 'path', points: Object.freeze(node.points.map(p => Object.freeze([...p]) as Vec3)) }) as PathNode;
  if (node.kind === 'ground' || node.kind === 'zone') return Object.freeze({ ...transform, size: Object.freeze([...node.size]) }) as GroundNode | ZoneNode;
  return Object.freeze({ ...transform, ...(node.footprint ? { footprint: Object.freeze([...node.footprint]) as Footprint } : {}), ...(node.route ? { route: cloneNodeRoute(node.route) } : {}), ...(node.controller ? { controller: cloneNodeController(node.controller) } : {}) }) as AssetNode;
}
/**
 * Validates one node's generic fields and throws an actionable error. Asset `options` must be a plain JSON-like object. With
 * `validateAsset` (see `SceneStoreOptions`), asset nodes are also checked by that function (model-specific options, accepted assets).
 */
export function validateNode(node: SceneNode, { validateAsset }: SceneStoreOptions = {}): void {
  if (node.attachment && (!node.attachment.nodeId?.trim() || node.attachment.anchor !== undefined && !node.attachment.anchor.trim())) throw new Error('Attachments require a parent ID and a nonempty anchor name when supplied.');
  if (!['ground', 'zone', 'asset', 'path', 'marker'].includes(node.kind)) throw new Error(`Unknown scene node kind: ${node.kind}.`);
  if (!node.id.trim()) throw new Error('Scene node ID must not be empty.');
  if (node.parentId !== undefined && (typeof node.parentId !== 'string' || !node.parentId.trim() || node.parentId === node.id)) throw new Error(`Invalid parent ID for ${node.id}: use the nonempty ID of another asset node.`);
  if (node.labelMode !== undefined && !['always', 'active'].includes(node.labelMode)) throw new Error(`Invalid label mode for ${node.id}.`);
  for (const value of [node.position, node.rotation, node.scale]) if (value && (value.length !== 3 || !value.every(Number.isFinite))) throw new Error(`Invalid transform for ${node.id}.`);
  if (node.kind === 'path' && (node.points.length < 2 || node.points.some(p => p.length !== 3 || !p.every(Number.isFinite)))) throw new Error(`Path ${node.id} requires at least two finite points.`);
  if ((node.kind === 'ground' || node.kind === 'zone') && (node.size.length !== 2 || node.size.some(n => !Number.isFinite(n) || n <= 0))) throw new Error(`Invalid size for ${node.id}.`);
  validateInterior(node);
  if (node.kind === 'marker') validateMarker(node);
  if (node.kind !== 'asset' && 'route' in node && (node as { route?: unknown }).route !== undefined) throw new Error(`Only asset nodes can follow a route (${node.id}).`);
  if (node.kind !== 'asset' && 'controller' in node && (node as { controller?: unknown }).controller !== undefined) throw new Error(`Only asset nodes can have a controller (${node.id}).`);
  if (node.kind === 'asset' && !node.asset.trim()) throw new Error(`Missing asset for ${node.id}.`);
  if (node.kind === 'asset' && node.variant !== undefined && typeof node.variant !== 'string') throw new Error(`Invalid asset variant for ${node.id}.`);
  if (node.kind === 'asset') {
    if (node.localMotion !== undefined && typeof node.localMotion !== 'boolean') throw new Error('localMotion must be boolean.');
    if (node.materials !== undefined) validateMaterialOverrides(node.materials);
    if (node.options !== undefined) {
      if (typeof node.options !== 'object' || node.options === null || Array.isArray(node.options)) throw new Error(`Options of ${node.id} must be an object keyed by option name, e.g. { building: { type: 'warehouse' } }.`);
      validateJsonLike(node.options, `${node.id}.options`, new Set());
    }
    if (node.view !== undefined && !NODE_VIEWS.includes(node.view)) throw new Error(`Invalid view for ${node.id}: ${String(node.view)}. Use ${NODE_VIEWS.join(', ')}.`);
    if (node.peekOnHover !== undefined && typeof node.peekOnHover !== 'boolean') throw new Error(`peekOnHover of ${node.id} must be boolean.`);
    if (node.countLayout !== undefined && !['compact', 'reserved'].includes(node.countLayout)) throw new Error(`Invalid count layout for ${node.id}.`);
    if (node.footprint !== undefined) validateFootprint(node.footprint);
    if (node.route !== undefined) validateNodeRoute(node.route);
    if (node.transfer !== undefined) validateNodeTransfer(node.transfer);
    if (node.controller !== undefined) validateNodeController(node.controller);
    if (node.route !== undefined && node.controller !== undefined) throw new Error(`Asset ${node.id} cannot have both a route and a controller.`);
    validateCountInput(node);
    validateAsset?.(node);
  }
}
function validateSettings(settings: SceneSettings) {
  if (settings.palette !== undefined) validateMaterialOverrides(settings.palette);
  if (!['light', 'midnight'].includes(settings.theme)) throw new Error('Unknown scene theme.');
  if (!SELECTION_STYLES.includes(settings.selectionStyle)) throw new Error(`Unknown selection style: ${settings.selectionStyle}. Use ${SELECTION_STYLES.join(', ')}.`);
  for (const key of ['labels', 'grid', 'shadows', 'motion', 'paused'] as const) if (typeof settings[key] !== 'boolean') throw new Error(`Setting ${key} must be boolean.`);
  for (const [key, min, max] of [['speed', .25, 3], ['zoom', ZOOM_RANGE.min, ZOOM_RANGE.max]] as const) if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(`Setting ${key} must be between ${min} and ${max}.`);
}
function selectionFor(node: SceneNode, origin: Selection['origin']): Selection {
  return Object.freeze({ nodeId: node.id, entityId: node.entityId, origin });
}
export function createSceneStore(definition: SceneDefinition = { schemaVersion: 1, nodes: [] }, initialSettings: Partial<SceneSettings> = {}, storeOptions: SceneStoreOptions = {}): SceneStore {
  if (definition.schemaVersion !== 1) throw new Error('Unsupported scene schema version.');
  const listeners = new Set<() => void>(); let disposed = false;
  const checked = (nodes: readonly SceneNode[]) => { validateParents(nodes); validateAttachments(nodes); const ids = new Set<string>(); return Object.freeze(nodes.map(node => { validateNode(node, storeOptions); if (ids.has(node.id)) throw new Error(`Duplicate scene node ID: ${node.id}.`); ids.add(node.id); return cloneNode(node); })); };
  if (initialSettings.palette !== undefined) validateMaterialOverrides(initialSettings.palette);
  const settings = { ...DEFAULT_SETTINGS, ...initialSettings, ...(initialSettings.palette ? { palette: Object.freeze({ ...initialSettings.palette }) } : {}) }; validateSettings(settings);
  let snapshot: SceneSnapshot = Object.freeze({ nodes: checked(definition.nodes), selection: null, settings: Object.freeze(settings), revision: 0 });
  const commit = (patch: Partial<SceneSnapshot>) => { if (disposed) throw new Error('Scene store has been disposed.'); const next = { ...snapshot, ...patch }; const selected = next.selection && next.nodes.find(node => node.id === next.selection!.nodeId); if (selected && !isNodeVisible(selected, next.nodes)) next.selection = null; snapshot = Object.freeze({ ...next, revision: snapshot.revision + 1 }); listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: fn => { if (disposed) throw new Error('Scene store has been disposed.'); listeners.add(fn); return () => { listeners.delete(fn); }; },
    upsert: node => { validateNode(node, storeOptions); const index = snapshot.nodes.findIndex(n => n.id === node.id); const nodes = [...snapshot.nodes]; const next = cloneNode(node); if (index < 0) nodes.push(next); else nodes[index] = next; validateParents(nodes); validateAttachments(nodes); commit({ nodes: Object.freeze(nodes), selection: snapshot.selection?.nodeId === node.id ? selectionFor(next, snapshot.selection.origin) : snapshot.selection }); },
    remove: id => { if (!snapshot.nodes.some(n => n.id === id)) return; const removed = new Set([id]); let changed = true; while (changed) { changed = false; for (const node of snapshot.nodes) if ((node.parentId || node.attachment?.nodeId) && removed.has((node.parentId ?? node.attachment?.nodeId)!) && !removed.has(node.id)) { removed.add(node.id); changed = true; } } commit({ nodes: Object.freeze(snapshot.nodes.filter(n => !removed.has(n.id))), selection: snapshot.selection && removed.has(snapshot.selection.nodeId) ? null : snapshot.selection }); },
    replace: nodes => { const next = checked(nodes); const selected = snapshot.selection && next.find(n => n.id === snapshot.selection!.nodeId); commit({ nodes: next, selection: selected && snapshot.selection ? selectionFor(selected, snapshot.selection.origin) : null }); },
    select: (id, origin = 'api') => { const node = id ? snapshot.nodes.find(n => n.id === id) : null; if (id && !node) throw new Error(`Unknown scene node: ${id}.`); commit({ selection: node ? selectionFor(node, origin) : null }); },
    configure: patch => { const next = { ...snapshot.settings, ...patch }; validateSettings(next); commit({ settings: Object.freeze({ ...next, ...(next.palette ? { palette: Object.freeze({ ...next.palette }) } : {}) }) }); },
    dispose: () => { disposed = true; listeners.clear(); },
  };
}

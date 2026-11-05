import { validateMaterialOverrides, type MaterialOverrides } from './palette';
import { validateContents, type ContainerContents } from './contents';
import { isPersonAsset, PERSON_ASSETS, validatePersonOptions, type PersonOptions } from './person';
import { validateAttachments, validateNodeTransfer, type Attachment, type NodeTransfer } from './attachment';
export * from './contents';
export * from './attachment';
export * from './carry';
export * from './palette';
import { validateCountInput, type CountLayout } from './asset-count';
import { validateSurfaceLabel, type SurfaceLabel } from './surface-label';
import { resolveMeasurement, type Measurement } from './measurement';
import { validateDisplay, type DisplayReading } from './display';
import { validateFootprint, type Footprint } from './footprint';
import { validateInterior } from './interior';
export * from './marker';
import { validateMarker, type MarkerFields } from './marker';
export * from './operating';
import { validateOperatingProperties } from './operating';
export * from './forks';
import { validateForkMotion, type ForkMotion } from './forks';
export * from './footprint';
export * from './interior';
export * from './display';
import { cloneNodeRoute, validateNodeRoute, type NodeRoute } from './route';
import { cloneNodeController, validateNodeController, type NodeController } from './controller';
import { isBuilding, isInteriorVisible, validateBuilding, validateBuildingParents, type BuildingOptions } from './building';
export * from './building';
export * from './person';
export * from './measurement';
export * from './surface-label';
export * from './asset-count';
export * from './route';
export * from './controller';
export * from './descriptor';
export * from './navigation';
export * from './interaction';
export * from './handling';
export * from './handling-state';
export * from './move-mode';
export * from './behavior';
export * from './overlay';
export * from './placement';
export type Vec3 = readonly [number, number, number];
/** Optional host visual alert. Model-native support is opt-in; neutral geometry ignores it. */
export type VisualState = 'normal' | 'busy' | 'warning' | 'critical' | 'inactive';
interface NodeBase { id: string; /** Local coordinates inside a building. Missing parents remain dormant. */ parentId?: string; attachment?: Attachment; entityId?: string; label?: string; labelMode?: 'always' | 'active'; position?: Vec3; rotation?: Vec3; scale?: Vec3; state?: VisualState; selectable?: boolean; }
export interface GroundNode extends NodeBase { kind: 'ground'; size: readonly [number, number]; color?: string; /** Declares this node's footprint an indoor area: nodes whose pivot lies inside it, and the area itself, neither cast nor receive shadows. Default false. See `interiorAreas`. */ interior?: boolean; }
export interface ZoneNode extends NodeBase { kind: 'zone'; size: readonly [number, number]; color?: string; /** Declares this node's footprint an indoor area: nodes whose pivot lies inside it, and the area itself, neither cast nor receive shadows. Default false. See `interiorAreas`. */ interior?: boolean; }
export interface AssetNode extends NodeBase { kind: 'asset'; asset: string; /** heated-pass, espresso-machine and pizza-oven: visible heat glow, steam or fire, default true. Independent of alerts and motion. */ heatEnabled?: boolean; /** deck-shower only: visible water, default true. Scene motion gates still control droplets. */ waterRunning?: boolean; /** trough only: finite fill fraction 0–1, default 1; zero removes contents. */ fillLevel?: number; /** Sized surface assets with an explicit `footprint` only: declares that footprint an indoor area, like `GroundNode.interior`. Default false. */ interior?: boolean; /** Disable built-in model animation only; scene/reduced-motion gates always win. */ localMotion?: boolean; /** forklift and reach-truck only: fork height and reach, set by the host. Default: travel height, not reached out. See `ForkMotion`. */ forks?: ForkMotion; /** Animate a change of `attachment` or `parentId` from the previous world pose, e.g. an item handed over; see `NodeTransfer`. */ transfer?: NodeTransfer; contents?: ContainerContents; materials?: MaterialOverrides; building?: BuildingOptions; /** Person assets only (`PERSON_ASSETS`): body silhouette and hairstyle. */ person?: PersonOptions; color?: string; variant?: string; count?: number; multiplier?: number; countLayout?: CountLayout; surfaceLabel?: SurfaceLabel; measurement?: Measurement; display?: DisplayReading; /** Sized surface assets only (floor, terrain, sidewalk): width × depth in metres. */ footprint?: Footprint; /** Visual route that owns the root transform while present. */ route?: NodeRoute; /** Per-frame controller that owns the root position and heading; exclusive with `route`. */ controller?: NodeController; }
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
  shadows: { type: 'boolean', description: 'Enable the directional-light shadow pass. Narrow or contained parts do not cast, and indoor nodes (inside a building or on an interior area) neither cast nor receive (ADR 0049).' },
  motion: { type: 'boolean', description: 'Interpolate target positions and run asset animations. Disabled for reduced motion.' },
  paused: { type: 'boolean', description: 'Freeze interpolation and asset animation without discarding target updates.' },
  speed: { type: 'number (0.25–3)', description: 'Multiplier for interpolation and asset animation; does not change business-event time.' },
  zoom: { type: 'number (0.65–5)', description: 'Orthographic camera zoom multiplier.' },
  selectionStyle: { type: "'corners' | 'glow'", description: 'How the selected and hovered node are marked: floor brackets around the model footprint, hidden where objects cover them, or a colored tint over the model.' },
} as const satisfies Record<keyof SceneSettings, { type: string; description: string }>;
export interface SceneSnapshot { nodes: readonly SceneNode[]; selection: Selection | null; settings: Readonly<SceneSettings>; revision: number; }
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
function cloneNode(node: SceneNode): SceneNode {
  node = { ...node, ...(node.attachment ? { attachment: Object.freeze({ ...node.attachment }) } : {}), ...(node.kind === 'asset' && node.contents ? { contents: Object.freeze({ lines: Object.freeze(node.contents.lines.map(line => Object.freeze({ ...line }))) }) } : {}) };
  const transform = { ...node, ...(node.kind === 'asset' && node.transfer ? { transfer: Object.freeze({ ...node.transfer }) } : {}), ...(node.kind === 'asset' && node.forks ? { forks: Object.freeze({ ...node.forks, ...(node.forks.moves ? { moves: Object.freeze(node.forks.moves.map(move => Object.freeze({ ...move }))) } : {}) }) } : {}), ...(node.kind === 'asset' && node.materials ? { materials: Object.freeze({ ...node.materials }) } : {}), ...(node.kind === 'asset' && node.person ? { person: Object.freeze({ ...node.person }) } : {}), ...(node.kind === 'asset' && node.building ? { building: Object.freeze({ ...node.building, ...(node.building.size ? { size: Object.freeze([...node.building.size]) as Vec3 } : {}), ...(node.building.colors ? { colors: Object.freeze({ ...node.building.colors }) } : {}) }) } : {}), position: node.position && Object.freeze([...node.position]) as Vec3, rotation: node.rotation && Object.freeze([...node.rotation]) as Vec3, scale: node.scale && Object.freeze([...node.scale]) as Vec3 };
  if (node.kind === 'marker') return Object.freeze({ ...transform, ...(typeof node.icon === 'object' ? { icon: Object.freeze({ paths: Object.freeze([...node.icon.paths]) }) } : {}) }) as MarkerNode;
  if (node.kind === 'path') return Object.freeze({ ...transform, kind: 'path', points: Object.freeze(node.points.map(p => Object.freeze([...p]) as Vec3)) }) as PathNode;
  if (node.kind === 'ground' || node.kind === 'zone') return Object.freeze({ ...transform, size: Object.freeze([...node.size]) }) as GroundNode | ZoneNode;
  return Object.freeze({ ...transform, ...(node.display ? { display: Object.freeze({ ...node.display }) } : {}), ...(node.footprint ? { footprint: Object.freeze([...node.footprint]) as Footprint } : {}), ...(node.surfaceLabel ? { surfaceLabel: Object.freeze({ ...node.surfaceLabel }) } : {}), ...(node.measurement ? { measurement: Object.freeze({ ...node.measurement, ...(node.measurement.bands ? { bands: Object.freeze(node.measurement.bands.map(band => Object.freeze({ ...band }))) } : {}) }) } : {}), ...(node.route ? { route: cloneNodeRoute(node.route) } : {}), ...(node.controller ? { controller: cloneNodeController(node.controller) } : {}) }) as AssetNode;
}
export function validateNode(node: SceneNode): void {
  if (node.attachment && (!node.attachment.nodeId?.trim() || node.attachment.anchor !== undefined && !node.attachment.anchor.trim())) throw new Error('Attachments require a parent ID and a nonempty anchor name when supplied.');
  if (!['ground', 'zone', 'asset', 'path', 'marker'].includes(node.kind)) throw new Error(`Unknown scene node kind: ${node.kind}.`);
  if (!node.id.trim()) throw new Error('Scene node ID must not be empty.');
  if (node.parentId !== undefined && (typeof node.parentId !== 'string' || !node.parentId.trim() || node.parentId === node.id)) throw new Error('Invalid building parent ID.');
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
    validateOperatingProperties(node);
    if (node.forks !== undefined) validateForkMotion(node.asset, node.forks);
    if (node.localMotion !== undefined && typeof node.localMotion !== 'boolean') throw new Error('localMotion must be boolean.');
    if (node.contents !== undefined) {
      validateContents(node.contents);
      if (!['parcel', 'shopping-cart'].includes(node.asset)) throw new Error('Contents currently support parcel and shopping-cart.');
      if (node.count !== undefined || node.multiplier !== undefined) throw new Error('Contents are independent of counted compositions; omit count/multiplier.');
    }
    if (node.materials !== undefined) validateMaterialOverrides(node.materials);
    if (node.person !== undefined) {
      if (!isPersonAsset(node.asset)) throw new Error(`Person options require a person asset (${PERSON_ASSETS.join(', ')}); ${node.id} is ${node.asset}.`);
      validatePersonOptions(node.person);
    }
    if (node.display !== undefined) {
      validateDisplay(node.display);
      if (node.count !== undefined || node.multiplier !== undefined || node.measurement !== undefined || node.surfaceLabel !== undefined) throw new Error('Display readings cannot be combined with counts, measurements or surface labels.');
    }
    if (node.building !== undefined && !isBuilding(node)) throw new Error('Building options require the building asset.');
    if (isBuilding(node)) {
      validateBuilding(node.building ?? {});
      if (node.variant !== undefined || node.count !== undefined || node.multiplier !== undefined || node.measurement !== undefined || node.surfaceLabel !== undefined || node.footprint !== undefined) throw new Error('Building does not support variants, counts, measurements, surface labels or footprints; use building.size.');
    }
    if (node.countLayout !== undefined && !['compact', 'reserved'].includes(node.countLayout)) throw new Error(`Invalid count layout for ${node.id}.`);
    if (node.measurement !== undefined) {
      resolveMeasurement(node.measurement);
      if (node.count !== undefined || node.multiplier !== undefined) throw new Error('Measurement cannot be combined with count or multiplier.');
    }
    if (node.surfaceLabel !== undefined) validateSurfaceLabel(node.surfaceLabel);
    if (node.footprint !== undefined) validateFootprint(node.footprint);
    if (node.route !== undefined) validateNodeRoute(node.route);
    if (node.transfer !== undefined) validateNodeTransfer(node.transfer);
    if (node.controller !== undefined) validateNodeController(node.controller);
    if (node.route !== undefined && node.controller !== undefined) throw new Error(`Asset ${node.id} cannot have both a route and a controller.`);
    validateCountInput(node);
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
export function createSceneStore(definition: SceneDefinition = { schemaVersion: 1, nodes: [] }, initialSettings: Partial<SceneSettings> = {}): SceneStore {
  if (definition.schemaVersion !== 1) throw new Error('Unsupported scene schema version.');
  const listeners = new Set<() => void>(); let disposed = false;
  const checked = (nodes: readonly SceneNode[]) => { validateBuildingParents(nodes); validateAttachments(nodes); const ids = new Set<string>(); return Object.freeze(nodes.map(node => { validateNode(node); if (ids.has(node.id)) throw new Error(`Duplicate scene node ID: ${node.id}.`); ids.add(node.id); return cloneNode(node); })); };
  if (initialSettings.palette !== undefined) validateMaterialOverrides(initialSettings.palette);
  const settings = { ...DEFAULT_SETTINGS, ...initialSettings, ...(initialSettings.palette ? { palette: Object.freeze({ ...initialSettings.palette }) } : {}) }; validateSettings(settings);
  let snapshot: SceneSnapshot = Object.freeze({ nodes: checked(definition.nodes), selection: null, settings: Object.freeze(settings), revision: 0 });
  const commit = (patch: Partial<SceneSnapshot>) => { if (disposed) throw new Error('Scene store has been disposed.'); const next = { ...snapshot, ...patch }; const selected = next.selection && next.nodes.find(node => node.id === next.selection!.nodeId); if (selected && !isInteriorVisible(selected, next.nodes)) next.selection = null; snapshot = Object.freeze({ ...next, revision: snapshot.revision + 1 }); listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: fn => { if (disposed) throw new Error('Scene store has been disposed.'); listeners.add(fn); return () => { listeners.delete(fn); }; },
    upsert: node => { validateNode(node); const index = snapshot.nodes.findIndex(n => n.id === node.id); const nodes = [...snapshot.nodes]; const next = cloneNode(node); if (index < 0) nodes.push(next); else nodes[index] = next; validateBuildingParents(nodes); validateAttachments(nodes); commit({ nodes: Object.freeze(nodes), selection: snapshot.selection?.nodeId === node.id ? selectionFor(next, snapshot.selection.origin) : snapshot.selection }); },
    remove: id => { if (!snapshot.nodes.some(n => n.id === id)) return; const removed = new Set([id]); let changed = true; while (changed) { changed = false; for (const node of snapshot.nodes) if ((node.parentId || node.attachment?.nodeId) && removed.has((node.parentId ?? node.attachment?.nodeId)!) && !removed.has(node.id)) { removed.add(node.id); changed = true; } } commit({ nodes: Object.freeze(snapshot.nodes.filter(n => !removed.has(n.id))), selection: snapshot.selection && removed.has(snapshot.selection.nodeId) ? null : snapshot.selection }); },
    replace: nodes => { const next = checked(nodes); const selected = snapshot.selection && next.find(n => n.id === snapshot.selection!.nodeId); commit({ nodes: next, selection: selected && snapshot.selection ? selectionFor(selected, snapshot.selection.origin) : null }); },
    select: (id, origin = 'api') => { const node = id ? snapshot.nodes.find(n => n.id === id) : null; if (id && !node) throw new Error(`Unknown scene node: ${id}.`); commit({ selection: node ? selectionFor(node, origin) : null }); },
    configure: patch => { const next = { ...snapshot.settings, ...patch }; validateSettings(next); commit({ settings: Object.freeze({ ...next, ...(next.palette ? { palette: Object.freeze({ ...next.palette }) } : {}) }) }); },
    dispose: () => { disposed = true; listeners.clear(); },
  };
}

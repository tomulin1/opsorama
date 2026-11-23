import { validateMaterialOverrides, type MaterialOverrides } from './palette';
export * from './attachment';
export * from './carry';
export * from './palette';
import type { CountLayout } from './asset-count';
import type { Footprint } from './footprint';
export * from './marker';
import type { MarkerFields } from './marker';
export * from './footprint';
export * from './interior';
import { cloneNodeRoute } from './route';
import { cloneNodeController } from './controller';
import type { NodeBase } from './node-base';
import { isMotionNode, type GroupNode, type ImageNode, type LineNode, type MotionFields, type ShapeNode, type TextNode } from './shapes';
export * from './shapes';
import { isNodeVisible, type NodeView } from './containment';
import { attachmentProblems, nodeListProblems, nodeProblems, parentProblems, validateScene } from './validate-scene';
import { pointer, throwOnErrors } from './scene-problems';
export { SCENE_RULES, SceneValidationError, type SceneProblem, type SceneRule } from './scene-problems';
export { validateScene } from './validate-scene';
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
export * from './camera';
import { DEFAULT_CAMERA_SETTINGS, validateCameraSettings, ZOOM_RANGE, type CameraSettings } from './camera';
/** `[x, y, z]`: metres for positions (Y is up), radians for Euler rotations, factors for scale. */
export type Vec3 = readonly [number, number, number];
/** Optional host visual alert. Model-native support is opt-in; neutral geometry ignores it. */
export type VisualState = 'normal' | 'busy' | 'warning' | 'critical' | 'inactive';
/**
 * Metres, greater than 0.
 * @exclusiveMinimum 0
 */
type PositiveMetres = number;
/*
 * JSDoc tags such as @minimum, @maximum, @minLength, @pattern and @asType on these types are copied into the scene JSON
 * Schema (pnpm schema:generate). They must state the same limits as the checks in validate-scene.ts.
 */
/** A shadow-receiving platform under the scene. */
export interface GroundNode extends NodeBase {
  kind: 'ground';
  /** Width (x) and depth (z) in metres, both greater than 0. */
  size: readonly [width: PositiveMetres, depth: PositiveMetres];
  /** Surface color, a CSS color. Default #e7eef8. */
  color?: string;
  /** Declares this node's footprint an indoor area: nodes whose pivot lies inside it, and the area itself, neither cast nor receive shadows. Default false. See `interiorAreas`. */
  interior?: boolean;
}
/** An outlined area for a physical location or a process stage. */
export interface ZoneNode extends NodeBase {
  kind: 'zone';
  /** Width (x) and depth (z) in metres, both greater than 0. */
  size: readonly [width: PositiveMetres, depth: PositiveMetres];
  /** Surface color, a CSS color. Default #dce9f6. */
  color?: string;
  /** Declares this node's footprint an indoor area: nodes whose pivot lies inside it, and the area itself, neither cast nor receive shadows. Default false. See `interiorAreas`. */
  interior?: boolean;
}
/**
 * Model-specific options of an asset node, keyed by option name. Core only requires plain JSON-like data (objects, arrays,
 * strings, finite numbers, booleans and null) and deep-freezes it in the store; which asset accepts which option, and the option's
 * value rules, belong to the asset's factory (`AssetFactory.validate` in `@opsorama/three`). A model package declares its
 * typed options by augmenting this interface (`declare module '@opsorama/core' { interface AssetOptions { ... } }`), as
 * `@opsorama/objects` does for its catalog. Custom assets may use any keys.
 */
export interface AssetOptions { readonly [key: string]: unknown }
/** A model from the renderer's asset registry, such as a catalog object from `@opsorama/objects`. */
export interface AssetNode extends NodeBase, MotionFields {
  kind: 'asset';
  /**
   * Name of a model in the renderer's asset registry.
   * @minLength 1
   * @pattern \S
   */
  asset: string;
  /** Sized surface assets with an explicit `footprint` only: declares that footprint an indoor area, like `GroundNode.interior`. Default false. */
  interior?: boolean;
  /** Disable built-in model animation only; scene/reduced-motion gates always win. */
  localMotion?: boolean;
  /** Per-instance semantic colors for models that declare palette support, keyed by material role. */
  materials?: MaterialOverrides;
  /** Container view for the nodes whose `parentId` names this asset: `'closed'` (default) hides them, `'peek'` and `'open'` show them. Models may change their look with it (the building lowers its walls). Set it with `setNodeView`. */
  view?: NodeView;
  /** Opt-in mouse preview: hovering the model's container bounds (`userData.containerBounds` set by its factory) peeks it after 160 ms and closes the peek after 280 ms outside. Hosts must still provide an explicit open/close control. Default false. */
  peekOnHover?: boolean;
  /** Model-specific options as plain JSON-like data, validated by the asset's factory; see `AssetOptions`. A change rebuilds the model. */
  options?: AssetOptions;
  /** Optional material color override, a CSS color, for factories that support it. */
  color?: string;
  /** Factory-specific variant name; the model's descriptor lists its variants. */
  variant?: string;
  /**
   * Visible quantity for countable models, within the model's declared range or variants. Default: the model's default.
   * @asType integer
   * @minimum 0
   */
  count?: number;
  /**
   * Disclosed symbolic factor: the represented total is count × multiplier. Adds no geometry. Default 1.
   * @asType integer
   * @minimum 1
   */
  multiplier?: number;
  /** `compact` or `reserved` (keep maximum-capacity slots) for models that support count layouts. */
  countLayout?: CountLayout;
  /** Sized surface assets only (floor, terrain, sidewalk): width × depth in metres. */
  footprint?: Footprint;
}
/** A low-profile visual route with a dashed center line. */
export interface PathNode extends NodeBase {
  kind: 'path';
  /**
   * World-space points in metres, at least two.
   * @minItems 2
   */
  points: readonly Vec3[];
  /** Route color, a CSS color. Default #a9bcd4. */
  color?: string;
}
/** A projected HTML marker without geometry; see `MarkerFields`. `label` is required. */
export interface MarkerNode extends NodeBase, MarkerFields {
  kind: 'marker';
  /**
   * Card title and accessible name, 1–120 characters.
   * @minLength 1
   * @maxLength 120
   * @pattern \S
   */
  label: string;
}
/** One visual node of a scene; `kind` selects its fields. */
export type SceneNode = GroundNode | ZoneNode | AssetNode | PathNode | MarkerNode | ShapeNode | LineNode | GroupNode | TextNode | ImageNode;
/**
 * A scene file: visual nodes only. Settings, camera and host data are not part of it. Check one with `validateScene`, or
 * against the published JSON Schema `@opsorama/core/scene-definition.schema.json`.
 */
export interface SceneDefinition {
  /** Format version; 1 is the only version. */
  schemaVersion: 1;
  /** Every node of the scene. IDs must be unique. */
  nodes: readonly SceneNode[];
}
export interface Selection { nodeId: string; entityId?: string; origin: 'pointer' | 'keyboard' | 'api'; }
/** `corners`: floor brackets around the model footprint, hidden where objects cover them. `glow`: colored tint over the model. */
export const SELECTION_STYLES = Object.freeze(['corners', 'glow'] as const);
export type SelectionStyle = typeof SELECTION_STYLES[number];
/**
 * Lighting presets: `studio` (the default, even and bright), `daylight` (a high, warm sun and a blue sky), `overcast`
 * (soft light, faint shadows), `dusk` (a low orange sun) and `night` (dim blue light). Each preset sets the ambient and
 * sun light, the exposure, the background and the sky and fog colors, with a variant per theme.
 */
export const LIGHTING_PRESETS = Object.freeze(['studio', 'daylight', 'overcast', 'dusk', 'night'] as const);
export type LightingPreset = typeof LIGHTING_PRESETS[number];
/**
 * Rendering quality: `high` (the default: pixel ratio up to 2, 2048 px soft shadows), `balanced` (up to 1.5, 1024 px) and
 * `low` (1, 512 px hard-edged shadows) for large scenes and weak devices. Quality never changes what the scene shows.
 */
export const QUALITY_LEVELS = Object.freeze(['high', 'balanced', 'low'] as const);
export type QualityLevel = typeof QUALITY_LEVELS[number];
export interface SceneSettings { theme: 'light' | 'midnight'; labels: boolean; grid: boolean; shadows: boolean; motion: boolean; paused: boolean; speed: number; /** Zoom multiplier of both projections, within `ZOOM_RANGE`. */ zoom: number; /** How the selected and hovered node are marked. */ selectionStyle: SelectionStyle; /** Lighting preset: light colors, exposure, background, sky and fog colors. */ lighting: LightingPreset; /** A sky gradient instead of the flat background. */ sky: boolean; /** Distance fog in the background color. */ fog: boolean; /** Rendering quality profile. */ quality: QualityLevel; palette?: MaterialOverrides; /** Projection, controls, overview direction and framing; see `CameraSettings`. Replacing it resets omitted fields to `DEFAULT_CAMERA_SETTINGS`. */ camera: CameraSettings; }
/**
 * Settings accepted by `createSceneStore` and `SceneStore.configure`: any subset of `SceneSettings`, where `camera` may also be
 * partial. A given `camera` replaces the current one, and its omitted fields take their `DEFAULT_CAMERA_SETTINGS` values.
 */
export type SceneSettingsPatch = Partial<Omit<SceneSettings, 'camera'>> & { camera?: Partial<CameraSettings> };
export const DEFAULT_SETTINGS: Readonly<SceneSettings> = Object.freeze({ theme: 'light', labels: true, grid: false, shadows: true, motion: true, paused: false, speed: 1, zoom: 1, selectionStyle: 'corners', lighting: 'studio', sky: false, fog: false, quality: 'high', palette: Object.freeze({}), camera: DEFAULT_CAMERA_SETTINGS });
export const SETTING_DEFINITIONS = {
  palette: { type: 'MaterialOverrides', description: 'Semantic colors for assets that declare palette support; replacing the map resets omitted roles to theme defaults.' },
  theme: { type: "'light' | 'midnight'", description: 'Canvas palette and environment lighting.' },
  labels: { type: 'boolean', description: 'Show selectable HTML labels projected onto the scene.' },
  grid: { type: 'boolean', description: 'Show a ground grid in world units.' },
  shadows: { type: 'boolean', description: 'Enable the directional-light shadow pass. Narrow or contained parts do not cast, and indoor nodes (inside a building or on an interior area) neither cast nor receive.' },
  motion: { type: 'boolean', description: 'Interpolate target positions and run asset animations. Disabled for reduced motion.' },
  paused: { type: 'boolean', description: 'Freeze interpolation and asset animation without discarding target updates.' },
  speed: { type: 'number (0.25–3)', description: 'Multiplier for interpolation and asset animation; does not change business-event time.' },
  zoom: { type: 'number (0.65–5)', description: 'Camera zoom multiplier for both projections: the orthographic zoom, or the perspective distance divided by it.' },
  selectionStyle: { type: "'corners' | 'glow'", description: 'How the selected and hovered node are marked: floor brackets around the model footprint, hidden where objects cover them, or a colored tint over the model.' },
  lighting: { type: "'studio' | 'daylight' | 'overcast' | 'dusk' | 'night'", description: 'Lighting preset: ambient and sun light, exposure, background, and the sky and fog colors, each with a light and a midnight variant. studio is the default look.' },
  sky: { type: 'boolean', description: 'Draw a sky gradient from the lighting preset behind the scene instead of the flat background color.' },
  fog: { type: 'boolean', description: 'Fade distant parts of the scene into the background (or horizon) color; the fog follows the camera distance.' },
  quality: { type: "'high' | 'balanced' | 'low'", description: 'Rendering quality: the highest canvas pixel ratio (2, 1.5, 1) and the shadow map (2048 px soft, 1024 px soft, 512 px hard). Lower quality is for large scenes and weak devices; it never changes what the scene shows.' },
  camera: { type: 'CameraSettings', description: "Camera: projection ('orthographic' or 'perspective'), controls ('pan' or 'none'), fov (degrees 20–75, perspective only), yaw and pitch (overview direction in radians), overview ('ground' or 'bounds') and frameOnSelect. Replacing it resets omitted fields to DEFAULT_CAMERA_SETTINGS." },
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
  /** Validates and merges settings; a given `camera` replaces the current one (omitted fields take their defaults). */
  configure(settings: SceneSettingsPatch): void;
  dispose(): void;
}
/** Deep copy and freeze of plain JSON-like data (objects and arrays); other values are returned as they are. */
function freezeJson<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson)) as T;
  if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)]))) as T;
  return value;
}
function cloneNode(node: SceneNode): SceneNode {
  node = { ...node, ...(node.attachment ? { attachment: Object.freeze({ ...node.attachment }) } : {}) };
  const motion = isMotionNode(node) ? { ...(node.transfer ? { transfer: Object.freeze({ ...node.transfer }) } : {}), ...(node.route ? { route: cloneNodeRoute(node.route) } : {}), ...(node.controller ? { controller: cloneNodeController(node.controller) } : {}) } : {};
  const transform = { ...node, ...motion, ...(node.kind === 'asset' && node.materials ? { materials: Object.freeze({ ...node.materials }) } : {}), ...(node.kind === 'asset' && node.options ? { options: freezeJson(node.options) } : {}), position: node.position && Object.freeze([...node.position]) as Vec3, rotation: node.rotation && Object.freeze([...node.rotation]) as Vec3, scale: node.scale && Object.freeze([...node.scale]) as Vec3 };
  if (node.kind === 'marker') return Object.freeze({ ...transform, ...(typeof node.icon === 'object' ? { icon: Object.freeze({ paths: Object.freeze([...node.icon.paths]) }) } : {}) }) as MarkerNode;
  if (node.kind === 'path' || node.kind === 'line') return Object.freeze({ ...transform, points: Object.freeze(node.points.map(p => Object.freeze([...p]) as Vec3)) }) as PathNode | LineNode;
  if (node.kind === 'ground' || node.kind === 'zone') return Object.freeze({ ...transform, size: Object.freeze([...node.size]) }) as GroundNode | ZoneNode;
  if (node.kind === 'shape') return Object.freeze({ ...transform, shape: Object.freeze(node.shape.type === 'box' ? { ...node.shape, size: Object.freeze([...node.shape.size]) } : { ...node.shape }) }) as ShapeNode;
  if (node.kind === 'group') return Object.freeze(transform) as GroupNode;
  if (node.kind === 'text') return Object.freeze(transform) as TextNode;
  if (node.kind === 'image') return Object.freeze({ ...transform, size: Object.freeze([...node.size]) }) as ImageNode;
  return Object.freeze({ ...transform, ...(node.footprint ? { footprint: Object.freeze([...node.footprint]) as Footprint } : {}) }) as AssetNode;
}
/**
 * Validates one node on its own and throws `SceneValidationError` (message: the first error) when it has an error. It checks
 * the node's generic fields; relations to other nodes (unique IDs, parents, attachments) need the whole scene, see
 * `validateScene`. Asset `options` must be a plain JSON-like object. With `validateAsset` (see `SceneStoreOptions`), asset
 * nodes are also checked by that function (model-specific options, accepted assets). Problem paths are relative to the node
 * (`/route/speed`). Warnings, such as unknown keys, never throw.
 */
export function validateNode(node: SceneNode, options: SceneStoreOptions = {}): void {
  throwOnErrors(nodeProblems(node, '', options));
}
function validateSettings(settings: SceneSettings) {
  if (settings.palette !== undefined) validateMaterialOverrides(settings.palette);
  if (!['light', 'midnight'].includes(settings.theme)) throw new Error('Unknown scene theme.');
  if (!SELECTION_STYLES.includes(settings.selectionStyle)) throw new Error(`Unknown selection style: ${settings.selectionStyle}. Use ${SELECTION_STYLES.join(', ')}.`);
  if (!LIGHTING_PRESETS.includes(settings.lighting)) throw new Error(`Unknown lighting preset: ${String(settings.lighting)}. Use ${LIGHTING_PRESETS.join(', ')}.`);
  if (!QUALITY_LEVELS.includes(settings.quality)) throw new Error(`Unknown quality level: ${String(settings.quality)}. Use ${QUALITY_LEVELS.join(', ')}.`);
  for (const key of ['labels', 'grid', 'shadows', 'motion', 'paused', 'sky', 'fog'] as const) if (typeof settings[key] !== 'boolean') throw new Error(`Setting ${key} must be boolean.`);
  for (const [key, min, max] of [['speed', .25, 3], ['zoom', ZOOM_RANGE.min, ZOOM_RANGE.max]] as const) if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new Error(`Setting ${key} must be between ${min} and ${max}.`);
  validateCameraSettings(settings.camera);
}
/** Merges a settings patch: a given `palette` or `camera` replaces the current one; camera fields it omits take their defaults. */
function mergeSettings(current: Readonly<SceneSettings>, patch: SceneSettingsPatch): SceneSettings {
  if (patch.camera !== undefined && (typeof patch.camera !== "object" || patch.camera === null || Array.isArray(patch.camera))) throw new Error("Setting camera must be an object such as { projection: 'perspective' }; omitted fields use DEFAULT_CAMERA_SETTINGS.");
  const next: SceneSettings = { ...current, ...patch, camera: patch.camera ? { ...DEFAULT_CAMERA_SETTINGS, ...Object.fromEntries(Object.entries(patch.camera).filter(([, value]) => value !== undefined)) } : current.camera };
  validateSettings(next);
  return { ...next, ...(next.palette ? { palette: Object.freeze({ ...next.palette }) } : {}), camera: next.camera === current.camera && Object.isFrozen(current.camera) ? current.camera : Object.freeze({ ...next.camera }) };
}
function selectionFor(node: SceneNode, origin: Selection['origin']): Selection {
  return Object.freeze({ nodeId: node.id, entityId: node.entityId, origin });
}
/**
 * Creates the scene store. The initial definition, `replace` and `upsert` run the checks of `validateScene` and throw
 * `SceneValidationError` (message: the first error, `problems`: every problem) without changing the store; invalid
 * settings throw an `Error`.
 */
export function createSceneStore(definition: SceneDefinition = { schemaVersion: 1, nodes: [] }, initialSettings: SceneSettingsPatch = {}, storeOptions: SceneStoreOptions = {}): SceneStore {
  throwOnErrors(validateScene(definition, storeOptions));
  const listeners = new Set<() => void>(); let disposed = false;
  const checked = (nodes: readonly SceneNode[]) => { throwOnErrors(Array.isArray(nodes) ? nodeListProblems(nodes, '/nodes', storeOptions) : validateScene({ schemaVersion: 1, nodes }, storeOptions)); return Object.freeze(nodes.map(cloneNode)); };
  if (initialSettings.palette !== undefined) validateMaterialOverrides(initialSettings.palette);
  const settings = mergeSettings(DEFAULT_SETTINGS, initialSettings);
  let snapshot: SceneSnapshot = Object.freeze({ nodes: Object.freeze(definition.nodes.map(cloneNode)), selection: null, settings: Object.freeze(settings), revision: 0 });
  const commit = (patch: Partial<SceneSnapshot>) => { if (disposed) throw new Error('Scene store has been disposed.'); const next = { ...snapshot, ...patch }; const selected = next.selection && next.nodes.find(node => node.id === next.selection!.nodeId); if (selected && !isNodeVisible(selected, next.nodes)) next.selection = null; snapshot = Object.freeze({ ...next, revision: snapshot.revision + 1 }); listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => snapshot,
    subscribe: fn => { if (disposed) throw new Error('Scene store has been disposed.'); listeners.add(fn); return () => { listeners.delete(fn); }; },
    upsert: node => {
      const found = snapshot.nodes.findIndex(n => n.id === node?.id), index = found < 0 ? snapshot.nodes.length : found, at = pointer('/nodes', index);
      throwOnErrors(nodeProblems(node, at, storeOptions));
      const nodes = [...snapshot.nodes]; const next = cloneNode(node); nodes[index] = next;
      throwOnErrors([...parentProblems(nodes, '/nodes'), ...attachmentProblems(nodes, '/nodes')]);
      commit({ nodes: Object.freeze(nodes), selection: snapshot.selection?.nodeId === node.id ? selectionFor(next, snapshot.selection.origin) : snapshot.selection }); },
    remove: id => { if (!snapshot.nodes.some(n => n.id === id)) return; const removed = new Set([id]); let changed = true; while (changed) { changed = false; for (const node of snapshot.nodes) if ((node.parentId || node.attachment?.nodeId) && removed.has((node.parentId ?? node.attachment?.nodeId)!) && !removed.has(node.id)) { removed.add(node.id); changed = true; } } commit({ nodes: Object.freeze(snapshot.nodes.filter(n => !removed.has(n.id))), selection: snapshot.selection && removed.has(snapshot.selection.nodeId) ? null : snapshot.selection }); },
    replace: nodes => { const next = checked(nodes); const selected = snapshot.selection && next.find(n => n.id === snapshot.selection!.nodeId); commit({ nodes: next, selection: selected && snapshot.selection ? selectionFor(selected, snapshot.selection.origin) : null }); },
    select: (id, origin = 'api') => { const node = id ? snapshot.nodes.find(n => n.id === id) : null; if (id && !node) throw new Error(`Unknown scene node: ${id}.`); commit({ selection: node ? selectionFor(node, origin) : null }); },
    configure: patch => { commit({ settings: Object.freeze(mergeSettings(snapshot.settings, patch)) }); },
    dispose: () => { disposed = true; listeners.clear(); },
  };
}

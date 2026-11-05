import type { AssetNode, SceneNode, SceneStore, Vec3 } from './index';

export interface BuildingPalette { wall: string; roof: string; floor: string; trim: string; }
export const BUILDING_TYPES = Object.freeze(['generic', 'warehouse', 'distribution-center', 'workshop', 'office', 'retail', 'storage-shed'] as const);
export type BuildingType = typeof BUILDING_TYPES[number];
export const BUILDING_TYPE_LABELS: Readonly<Record<BuildingType, string>> = Object.freeze({ generic: 'Generic building', warehouse: 'Warehouse', 'distribution-center': 'Distribution center', workshop: 'Workshop', office: 'Office', retail: 'Retail unit', 'storage-shed': 'Storage shed' });
export interface BuildingOptions {
  /** Exterior style; changing it preserves dimensions, local contents and identities. */
  type?: BuildingType;
  /** Exterior width, height and depth in metres; base-center pivot, front +z. */
  size?: Vec3;
  view?: 'closed' | 'peek' | 'open';
  /** Front cutaway retains far (-x/-z) walls for a readable isometric interior. */
  cutaway?: 'low-walls' | 'front';
  /** Opt-in mouse preview. Hosts must still provide an explicit open/close control. */
  peekOnHover?: boolean;
  colors?: Partial<BuildingPalette>;
}
export const BUILDING_SIZE: Vec3 = Object.freeze([8, 3.6, 6]);
export const BUILDING_PALETTES: Readonly<Record<'light' | 'midnight', Readonly<BuildingPalette>>> = Object.freeze({
  light: Object.freeze({ wall: '#dfe7f1', roof: '#536b8b', floor: '#c5d2df', trim: '#8fa4bd' }),
  midnight: Object.freeze({ wall: '#536579', roof: '#30435f', floor: '#71839a', trim: '#9bb1cc' }),
});
export function validateBuilding(options: BuildingOptions): void {
  if (options.type !== undefined && !BUILDING_TYPES.includes(options.type)) throw new Error('Unknown building type.');
  const size = options.size ?? BUILDING_SIZE;
  if (size.length !== 3 || size.some(value => !Number.isFinite(value) || value < 2 || value > 100)) throw new Error('Building dimensions must be between 2 and 100 metres.');
  if (options.view !== undefined && !['closed', 'peek', 'open'].includes(options.view)) throw new Error('Invalid building view.');
  if (options.cutaway !== undefined && !['low-walls', 'front'].includes(options.cutaway)) throw new Error('Invalid building cutaway.');
  if (options.peekOnHover !== undefined && typeof options.peekOnHover !== 'boolean') throw new Error('Building peekOnHover must be boolean.');
  if (options.colors && Object.entries(options.colors).some(([role, color]) => !['wall', 'roof', 'floor', 'trim'].includes(role) || typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color))) throw new Error('Building colors must be six-digit hex palette overrides.');
}
export function isBuilding(node: SceneNode | undefined): node is AssetNode & { asset: 'building' } {
  return node?.kind === 'asset' && node.asset === 'building';
}
export function setBuildingView(store: SceneStore, id: string, view: NonNullable<BuildingOptions['view']>): void {
  const node = store.getSnapshot().nodes.find(node => node.id === id);
  if (!isBuilding(node)) throw new Error(`Unknown building: ${id}.`);
  store.upsert({ ...node, building: { ...node.building, view } });
}
/** Missing parents are dormant (supports declarative registration order). Cycles and non-building parents are errors. */
export function validateBuildingParents(nodes: readonly SceneNode[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    const seen = new Set([node.id]); let parentId = node.parentId;
    while (parentId !== undefined) {
      if (seen.has(parentId)) throw new Error(`Building parent cycle at ${node.id}.`);
      seen.add(parentId); const parent = byId.get(parentId);
      if (!parent) break;
      if (!isBuilding(parent)) throw new Error(`Parent ${parentId} must be a building.`);
      parentId = parent.parentId;
    }
  }
}
export function isInteriorVisible(node: SceneNode, nodes: readonly SceneNode[], byId?: ReadonlyMap<string, SceneNode>): boolean {
  let current = node; let parentId = node.attachment?.nodeId ?? node.parentId; const seen = new Set([node.id]);
  while (parentId !== undefined) {
    if (seen.has(parentId)) return false;
    seen.add(parentId); const parent = byId ? byId.get(parentId) : nodes.find(candidate => candidate.id === parentId);
    if (!parent || !current.attachment && (!isBuilding(parent) || (parent.building?.view ?? 'closed') === 'closed')) return false;
    current = parent; parentId = parent.attachment?.nodeId ?? parent.parentId;
  }
  return true;
}
/**
 * Whether a node sits inside a building container: it declares `parentId`, or it is attached
 * (carried) by a node that does. Attachments inherit their carrier's placement, so an object
 * attached to a building itself stays outside unless that building is nested in another one.
 * The renderer uses this for the indoor shadow policy; it does not depend on the building view.
 */
export function isInsideBuilding(node: SceneNode, byId: ReadonlyMap<string, SceneNode>): boolean {
  let current: SceneNode | undefined = node; const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.parentId !== undefined) return true;
    seen.add(current.id); current = current.attachment ? byId.get(current.attachment.nodeId) : undefined;
  }
  return false;
}
export type BuildingLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type BuildingInteriorLoader = (signal: AbortSignal) => Promise<readonly SceneNode[]>;
/** Load once on opening. Cached data survives closing; the renderer releases hidden GPU resources. */
export function bindBuildingInterior(store: SceneStore, id: string, load: BuildingInteriorLoader, onState?: (state: BuildingLoadState, error?: Error) => void): () => void {
  let disposed = false, loaded = false, controller: AbortController | undefined;
  let wasOpen = false; const owned = new Set<string>();
  const sync = () => {
    if (disposed) return;
    const nodes = store.getSnapshot().nodes, node = nodes.find(candidate => candidate.id === id);
    const open = isBuilding(node) && (node.building?.view ?? 'closed') !== 'closed' && isInteriorVisible(node, nodes);
    if (!open) {
      wasOpen = false;
      if (controller) { controller.abort(); controller = undefined; onState?.('idle'); }
      // Removing the container invalidates its cached contents as well.
      if (!node) loaded = false;
      return;
    }
    if (wasOpen || loaded || controller) return;
    wasOpen = true; const request = new AbortController(); controller = request; onState?.('loading');
    void Promise.resolve().then(() => request.signal.aborted ? [] : load(request.signal)).then(contents => {
      if (disposed || request.signal.aborted || controller !== request) return;
      const current = store.getSnapshot().nodes;
      if (contents.some(child => child.id === id || current.some(existing => existing.id === child.id))) throw new Error('Building interior IDs must be unique within the scene.');
      if (contents.some(child => child.parentId !== undefined && child.parentId !== id)) throw new Error('Loaded contents must be direct children of the building.');
      const children = contents.map(child => ({ ...child, parentId: id }));
      store.replace([...current, ...children]);
      children.forEach(child => owned.add(child.id)); loaded = true; controller = undefined; onState?.('ready');
    }).catch(error => {
      if (disposed || request.signal.aborted || controller !== request) return;
      controller = undefined; onState?.('error', error instanceof Error ? error : new Error(String(error)));
    });
  };
  const unsubscribe = store.subscribe(sync); sync();
  return () => {
    if (disposed) return;
    disposed = true; unsubscribe(); controller?.abort(); controller = undefined;
    // Removing owned containers also removes their descendants from separate nested bindings.
    owned.forEach(childId => store.remove(childId));
  };
}

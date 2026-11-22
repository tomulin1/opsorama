import type { SceneNode, SceneStore } from './index';

/**
 * Generic containment. Any asset node can contain other nodes: a child names it with `parentId` and uses
 * the container's local coordinates. The container's `AssetNode.view` decides whether its children show:
 * `'closed'` (default) hides them, `'peek'` and `'open'` show them. Models decide what a view looks like
 * (a building lowers its walls, for example); core only decides visibility.
 */
export const NODE_VIEWS = Object.freeze(['closed', 'peek', 'open'] as const);
/** Container view of an asset; see `AssetNode.view`. Default `'closed'`. */
export type NodeView = typeof NODE_VIEWS[number];

/** The effective view of a node: its `view` for assets, `'closed'` for every other kind and for missing nodes. */
export function nodeView(node: SceneNode | undefined): NodeView {
  return node?.kind === 'asset' ? node.view ?? 'closed' : 'closed';
}

/**
 * Set the view of the asset `id` with `store.upsert`. Immediate and static: there is no transition, also with
 * motion disabled or paused. Throws when `id` is missing or is not an asset node.
 */
export function setNodeView(store: SceneStore, id: string, view: NodeView): void {
  const node = store.getSnapshot().nodes.find(candidate => candidate.id === id);
  if (!node) throw new Error(`Unknown scene node: ${id}. Add the node before setting its view.`);
  if (node.kind !== 'asset') throw new Error(`Node ${id} is a ${node.kind} node; only asset nodes have a view.`);
  store.upsert({ ...node, view });
}

/**
 * Validate the `parentId` graph. A parent must be an asset node and the chain must not form a cycle. Missing parents
 * are dormant, not errors, so nodes can be registered in any order: a child of a missing parent is hidden until the
 * parent appears. The scene store runs this on `replace` and `upsert`.
 */
export function validateParents(nodes: readonly SceneNode[]): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    const seen = new Set([node.id]); let parentId = node.parentId;
    while (parentId !== undefined) {
      if (seen.has(parentId)) throw new Error(`Parent cycle at ${node.id}: ${parentId} is its own ancestor. Remove one parentId from the cycle.`);
      seen.add(parentId); const parent = byId.get(parentId);
      if (!parent) break;
      if (parent.kind !== 'asset') throw new Error(`Parent ${parentId} of ${node.id} must be an asset node; it is a ${parent.kind} node. Only assets can contain children.`);
      parentId = parent.parentId;
    }
  }
}

/**
 * Whether a node is visible in the scene. A node is visible when every container on its chain shows its children:
 * each `parentId` must resolve to an asset whose view is not `'closed'`. An attached node (`attachment`) follows its
 * carrier and is visible while the carrier is. Missing parents and cycles make a node invisible. Pass `byId` to avoid
 * a linear search per step when checking many nodes.
 */
export function isNodeVisible(node: SceneNode, nodes: readonly SceneNode[], byId?: ReadonlyMap<string, SceneNode>): boolean {
  let current = node; let parentId = node.attachment?.nodeId ?? node.parentId; const seen = new Set([node.id]);
  while (parentId !== undefined) {
    if (seen.has(parentId)) return false;
    seen.add(parentId); const parent = byId ? byId.get(parentId) : nodes.find(candidate => candidate.id === parentId);
    if (!parent || !current.attachment && nodeView(parent) === 'closed') return false;
    current = parent; parentId = parent.attachment?.nodeId ?? parent.parentId;
  }
  return true;
}

/**
 * Whether a node sits inside a container: it declares `parentId`, or it is attached (carried) by a node that does.
 * Attachments inherit their carrier's placement, so an object attached to a top-level container stays outside unless
 * that container is itself contained. The renderer uses this for the indoor shadow policy; it does not depend on the view.
 */
export function isContained(node: SceneNode, byId: ReadonlyMap<string, SceneNode>): boolean {
  let current: SceneNode | undefined = node; const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.parentId !== undefined) return true;
    seen.add(current.id); current = current.attachment ? byId.get(current.attachment.nodeId) : undefined;
  }
  return false;
}

/** Lifecycle of a `bindChildren` load: `idle` until the container opens, then `loading`, then `ready` or `error`. */
export type ChildrenLoadState = 'idle' | 'loading' | 'ready' | 'error';
/**
 * Loads the children of a container. Receives an `AbortSignal` that aborts when the container closes before the load
 * finishes, and returns direct child nodes in the container's local coordinates (their `parentId` is set to the container).
 */
export type ChildrenLoader = (signal: AbortSignal) => Promise<readonly SceneNode[]>;

/**
 * Load the children of the asset `id` once, when it first becomes visibly open (view `'peek'` or `'open'`, and every
 * ancestor open too). Closing before the load finishes aborts it and reports `idle`; the next opening retries. Loaded
 * children stay in the store after closing (the renderer releases hidden GPU resources); removing the container
 * invalidates the cache. Loaded IDs must be unique in the scene, and loaded nodes must be direct children. Returns an
 * unbind function that aborts a pending load and removes the children this binding added.
 */
export function bindChildren(store: SceneStore, id: string, load: ChildrenLoader, onState?: (state: ChildrenLoadState, error?: Error) => void): () => void {
  let disposed = false, loaded = false, controller: AbortController | undefined;
  let wasOpen = false; const owned = new Set<string>();
  const sync = () => {
    if (disposed) return;
    const nodes = store.getSnapshot().nodes, node = nodes.find(candidate => candidate.id === id);
    const open = node?.kind === 'asset' && nodeView(node) !== 'closed' && isNodeVisible(node, nodes);
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
      if (contents.some(child => child.id === id || current.some(existing => existing.id === child.id))) throw new Error(`Loaded children of ${id} must have IDs that are unique within the scene.`);
      if (contents.some(child => child.parentId !== undefined && child.parentId !== id)) throw new Error(`Loaded children of ${id} must be its direct children; omit parentId or set it to ${id}.`);
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


import { createSceneStore, type SceneDefinition, type SceneNode, type SceneSettings, type SceneStore, type Vec3 } from '@opsorama/core';
import type { ScenePointerEvent, SceneRenderer } from '@opsorama/three';

/** A small yard for the context menu example: positions are illustrative, no records are inferred. */
const PATROL: readonly Vec3[] = [[-9, 0, 3.5], [9, 0, 3.5], [9, 0, -1], [-9, 0, -1], [-9, 0, 3.5]];
export const nodeHtmlDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'yard', kind: 'ground', position: [0, 0, 0], size: [28, 16], color: '#e4ebf2' },
  { id: 'storage-zone', kind: 'zone', position: [4, 0, -5], size: [16, 5], label: 'STORAGE', color: '#dfefe6' },
  { id: 'rack', kind: 'asset', asset: 'pallet-rack', position: [2, 0, -5.6], label: 'Pallet rack R01', selectable: true },
  { id: 'pallet', kind: 'asset', asset: 'pallet', position: [9, 0, -5], label: 'Pallet 4471', selectable: true, count: 9 },
  { id: 'forklift', kind: 'asset', asset: 'forklift', position: PATROL[0], label: 'Forklift', selectable: true, route: { points: PATROL, speed: 2.2, loop: true, profile: { acceleration: 1.4, turnRate: 2.4 } } },
] };

/** Nodes that open a context menu when clicked. */
export const MENU_NODES: readonly string[] = ['forklift', 'rack', 'pallet'];
/** Class of the menu box every adapter renders over the clicked node. */
export const NODE_MENU_CLASS = 'node-menu';

/** The store of one mount. Shadows off keeps the example light; motion stays on so the forklift drives. */
export const makeNodeHtmlStore = (settings: Partial<SceneSettings> = {}): SceneStore => createSceneStore(nodeHtmlDefinition, { shadows: false, ...settings });

/** One entry of a node's context menu. */
export interface NodeMenuAction { id: 'flag' | 'frame' | 'follow' | 'close'; label: string }
/** What a node's menu shows: its name, a status line and the actions. */
export interface NodeMenu { title: string; status: string; actions: readonly NodeMenuAction[] }

/** The menu of a node, read from the store; null for a node without one. */
export function nodeMenu(store: SceneStore, nodeId: string): NodeMenu | null {
  const node = store.getSnapshot().nodes.find(item => item.id === nodeId);
  if (!node || node.kind !== 'asset' || !MENU_NODES.includes(nodeId)) return null;
  const flagged = node.state === 'warning', moving = Boolean(node.route);
  return {
    title: node.label ?? nodeId,
    status: `${flagged ? 'Problem reported' : 'No problem reported'}${moving ? ' · on patrol' : ''}`,
    actions: [
      { id: 'flag', label: flagged ? 'Clear the problem' : 'Report a problem' },
      moving ? { id: 'follow', label: 'Follow with the camera' } : { id: 'frame', label: 'Centre the view on it' },
      { id: 'close', label: 'Close' },
    ],
  };
}

/**
 * Runs a menu action: toggles the node's `warning` state in the store, or moves the camera through the renderer API.
 * Returns whether the menu stays open.
 */
export function runMenuAction(store: SceneStore, renderer: SceneRenderer | null, nodeId: string, action: NodeMenuAction['id']): boolean {
  const node = store.getSnapshot().nodes.find(item => item.id === nodeId);
  if (!node) return false;
  if (action === 'flag') { store.upsert({ ...node, state: node.state === 'warning' ? undefined : 'warning' } as SceneNode); return true; }
  if (action === 'frame') void renderer?.frame(nodeId);
  if (action === 'follow') void renderer?.followNode(nodeId);
  return false;
}

/**
 * The menu a click opens: a node with a menu opens (or, clicked again, closes) its menu and keeps the default selection
 * and framing away with `preventSelection()`; any other click closes it. Returns the node whose menu is open next.
 */
export function menuAfterClick(event: ScenePointerEvent, open: string | null): string | null {
  if (event.type !== 'click') return open;
  if (event.nodeId && MENU_NODES.includes(event.nodeId)) { event.preventSelection(); return open === event.nodeId ? null : event.nodeId; }
  return null;
}

/** Everything a mount needs: the store the page configures, and the disposal of the scene and store. */
export interface NodeHtmlSession { store: SceneStore; dispose(): void }
/** Callbacks from a mount to the page. */
export interface NodeHtmlCallbacks { ready(renderer: SceneRenderer): void }

/** Copyable snippet of a context menu over a node in each adapter. */
export function nodeHtmlSnippet(framework: 'react' | 'vue' | 'javascript'): string {
  if (framework === 'javascript') return `const menu = document.createElement('div');
menu.className = 'node-menu';
menu.innerHTML = '<strong>Forklift</strong><button type="button">Report a problem</button>';

let attached: NodeHtmlHandle | null = null;
const renderer = createSceneRenderer(container, store, {
  assets: catalogAssets,
  onPointer: event => {
    if (event.type !== 'click') return;
    attached?.remove(); attached = null;
    if (event.nodeId === 'forklift') {
      event.preventSelection(); // the menu replaces selection and framing
      attached = renderer.attachHtml('forklift', menu, { align: 'above' });
    }
  },
});`;
  if (framework === 'react') return `function Scene() {
  const [open, setOpen] = useState<string | null>(null);
  const onPointer = (event: ScenePointerEvent) => {
    if (event.type !== 'click') return;
    if (event.nodeId === 'forklift') { event.preventSelection(); setOpen('forklift'); } else setOpen(null);
  };
  return <SceneCanvas assets={catalogAssets} onPointer={onPointer}>
    {open && <NodeHtml nodeId={open} align="above" className="node-menu">
      <strong>Forklift</strong>
      <button type="button" onClick={() => setOpen(null)}>Close</button>
    </NodeHtml>}
  </SceneCanvas>;
}`;
  return `const open = ref<string | null>(null);
const onPointer = (event: ScenePointerEvent) => {
  if (event.type !== 'click') return;
  if (event.nodeId === 'forklift') { event.preventSelection(); open.value = 'forklift'; } else open.value = null;
};

h(SceneCanvas, { assets: catalogAssets, onPointer }, {
  default: () => open.value && h(NodeHtml, { nodeId: open.value, align: 'above', class: 'node-menu' }, {
    default: () => [h('strong', 'Forklift'), h('button', { type: 'button', onClick: () => { open.value = null; } }, 'Close')],
  }),
});`;
}

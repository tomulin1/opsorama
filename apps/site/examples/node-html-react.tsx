import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SceneSettings } from '@opsorama/core';
import { DashboardProvider, NodeHtml, SceneCanvas, useScene, useSceneRenderer, useSceneStore } from '@opsorama/react';
import type { ScenePointerEvent } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { makeNodeHtmlStore, menuAfterClick, NODE_MENU_CLASS, nodeMenu, runMenuAction, type NodeHtmlCallbacks, type NodeHtmlSession } from './node-html-data';

/** The menu over the open node; it re-renders with the store, so the status line follows the node. */
function NodeMenuContent({ nodeId, close }: { nodeId: string; close(): void }) {
  const store = useSceneStore(), renderer = useSceneRenderer();
  useScene();
  const menu = nodeMenu(store, nodeId);
  if (!menu) return null;
  return <NodeHtml nodeId={nodeId} className={NODE_MENU_CLASS}>
    <div role="group" aria-label={`${menu.title} actions`}>
      <strong>{menu.title}</strong><span>{menu.status}</span>
      {menu.actions.map(action => <button key={action.id} type="button" onClick={() => { if (!runMenuAction(store, renderer, nodeId, action.id)) close(); }}>{action.label}</button>)}
    </div>
  </NodeHtml>;
}

function NodeHtmlScene({ callbacks }: { callbacks: NodeHtmlCallbacks }) {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  // The click decides at once whether the default selection is prevented, so the next menu is computed outside the updater.
  const onPointer = (event: ScenePointerEvent) => { if (event.type === 'click') setOpen(menuAfterClick(event, open)); };
  return <SceneCanvas assets={catalogAssets} wheelZoom onPointer={onPointer} style={{ height: 420 }} onReady={callbacks.ready}>
    {open && <NodeMenuContent nodeId={open} close={() => setOpen(null)} />}
  </SceneCanvas>;
}

/** React: `NodeHtml` renders the menu through a portal into an element the renderer keeps over the node. */
export function mountNodeHtmlReact(container: HTMLElement, settings: Partial<SceneSettings>, callbacks: NodeHtmlCallbacks): NodeHtmlSession {
  const store = makeNodeHtmlStore(settings), root = createRoot(container);
  root.render(<DashboardProvider store={store}><NodeHtmlScene callbacks={callbacks} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}

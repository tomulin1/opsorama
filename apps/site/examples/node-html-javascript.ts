import type { SceneSettings } from '@opsorama/core';
import { createSceneRenderer, type NodeHtmlHandle } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { makeNodeHtmlStore, menuAfterClick, NODE_MENU_CLASS, nodeMenu, runMenuAction, type NodeHtmlCallbacks, type NodeHtmlSession } from './node-html-data';

/** Plain JavaScript: one menu element, attached with `renderer.attachHtml` to the clicked node and removed when it closes. */
export function mountNodeHtmlJavaScript(container: HTMLElement, settings: Partial<SceneSettings>, callbacks: NodeHtmlCallbacks): NodeHtmlSession {
  const store = makeNodeHtmlStore(settings), element = document.createElement('div');
  element.className = NODE_MENU_CLASS;
  let open: string | null = null, handle: NodeHtmlHandle | null = null;
  function render() {
    const menu = open ? nodeMenu(store, open) : null;
    if (!open || !menu) { open = null; handle?.remove(); handle = null; return; }
    const group = document.createElement('div'), title = document.createElement('strong'), status = document.createElement('span');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', `${menu.title} actions`);
    title.textContent = menu.title; status.textContent = menu.status;
    const buttons = menu.actions.map(action => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label;
      button.addEventListener('click', () => { if (open && !runMenuAction(store, renderer, open, action.id)) open = null; render(); });
      return button;
    });
    group.append(title, status, ...buttons); element.replaceChildren(group);
    if (handle?.nodeId !== open) { handle?.remove(); handle = renderer.attachHtml(open, element); }
  }
  const renderer = createSceneRenderer(container, store, {
    assets: catalogAssets, wheelZoom: true,
    onPointer: event => { const next = menuAfterClick(event, open); if (next !== open) { open = next; render(); } },
  });
  // The status line follows the store; Escape closes the menu.
  const unsubscribe = store.subscribe(() => { if (open) render(); });
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && open) { open = null; render(); } };
  window.addEventListener('keydown', escape);
  callbacks.ready(renderer);
  return { store, dispose: () => { window.removeEventListener('keydown', escape); unsubscribe(); handle?.remove(); renderer.dispose(); store.dispose(); } };
}

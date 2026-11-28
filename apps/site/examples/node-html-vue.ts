import { createApp, defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';
import type { SceneSettings } from '@opsorama/core';
import { DashboardProvider, NodeHtml, SceneCanvas, useScene, useSceneRenderer, useSceneStore } from '@opsorama/vue';
import type { ScenePointerEvent } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { makeNodeHtmlStore, menuAfterClick, NODE_MENU_CLASS, nodeMenu, runMenuAction, type NodeHtmlCallbacks, type NodeHtmlSession } from './node-html-data';

/** The menu over the open node; it re-renders with the store, so the status line follows the node. */
const NodeMenuContent = defineComponent({
  name: 'NodeMenuContent',
  props: { nodeId: { type: String, required: true }, close: { type: Function as PropType<() => void>, required: true } },
  setup(props) {
    const store = useSceneStore(), renderer = useSceneRenderer(), snapshot = useScene();
    return () => {
      // Read the snapshot so the menu renders again when the store changes.
      void snapshot.value;
      const menu = nodeMenu(store, props.nodeId);
      if (!menu) return null;
      const buttons = menu.actions.map(action => h('button', { key: action.id, type: 'button', onClick: () => { if (!runMenuAction(store, renderer.value, props.nodeId, action.id)) props.close(); } }, action.label));
      return h(NodeHtml, { nodeId: props.nodeId, class: NODE_MENU_CLASS }, { default: () => [h('div', { role: 'group', 'aria-label': `${menu.title} actions` }, [h('strong', menu.title), h('span', menu.status), ...buttons])] });
    };
  },
});

/** Native Vue: `NodeHtml` teleports the menu into an element the renderer keeps over the node. */
export function mountNodeHtmlVue(container: HTMLElement, settings: Partial<SceneSettings>, callbacks: NodeHtmlCallbacks): NodeHtmlSession {
  const store = makeNodeHtmlStore(settings), open = ref<string | null>(null);
  const onPointer = (event: ScenePointerEvent) => { if (event.type === 'click') open.value = menuAfterClick(event, open.value); };
  const Scene = defineComponent({
    name: 'NodeHtmlScene',
    setup() {
      const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') open.value = null; };
      onMounted(() => window.addEventListener('keydown', escape));
      onUnmounted(() => window.removeEventListener('keydown', escape));
      return () => h(SceneCanvas, { assets: catalogAssets, wheelZoom: true, onPointer, style: { height: '420px' }, onReady: callbacks.ready }, { default: () => open.value ? h(NodeMenuContent, { nodeId: open.value, close: () => { open.value = null; } }) : null });
    },
  });
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(Scene) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}

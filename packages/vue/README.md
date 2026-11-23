# @opsorama/vue

Native Vue 3 adapter for Opsorama with the same scene contract as the React adapter and no React runtime: `DashboardProvider`, `SceneCanvas`, composables (`useScene`, `useSceneStore`, `useSceneZoom`, `useRendererFps`), scene components (`Ground`, `Zone`, `Path`, `Asset`, `Marker`, `EntityLayer`), a headless `EntityInspector` and `NodePreview`, a live 3D copy of one node for a detail panel. `@opsorama/vue/ui` adds the panel components.

## Install

```sh
npm install @opsorama/vue @opsorama/core @opsorama/three @opsorama/objects three vue
```

## Usage

```vue
<script setup lang="ts">
import { createSceneStore } from '@opsorama/core';
import { createAssetRegistry } from '@opsorama/three';
import { workItemsKit } from '@opsorama/objects/work-items';
import { DashboardProvider, SceneCanvas, Ground, Asset } from '@opsorama/vue';

const assets = createAssetRegistry(workItemsKit);
const store = createSceneStore();
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="assets" style="height: 420px">
      <Ground id="floor" :size="[20, 12]" />
      <Asset id="order-1" entity-id="1" asset="parcel" label="#1" :position="[0, 0.08, 1]" />
    </SceneCanvas>
  </DashboardProvider>
</template>
```

`SceneCanvas` creates the renderer on mount and disposes it on unmount; the store belongs to your component.

Touch input stays with the page by default, so an embedded scene never blocks scrolling (a tap still selects). The mount-time `touch-gestures` prop hands touch to the scene: one finger pans, two fingers pinch-zoom around their midpoint (writing `SceneSettings.zoom`), and with `camera.controls: 'orbit'` a two-finger twist or vertical drag turns the view. It sets `touch-action: none` on the canvas; changing the prop remounts the renderer.

```vue
<script setup lang="ts">
import type { SceneStore } from '@opsorama/core';
import { catalogAssets } from '@opsorama/objects';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';

defineProps<{ store: SceneStore }>();
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="catalogAssets" touch-gestures style="height: 100dvh" />
  </DashboardProvider>
</template>
```

Until the first frame `SceneCanvas` shows a loading indicator. The `loading` slot (given `{ state }`) replaces its content, `:loading="false"` turns it off, and `@load` reports progress.

`NodePreview` shows a live copy of one node from the provider's scene in its own canvas, for example the selected node in an inspector. It mirrors the node's state, counts and animation and turns slowly; dragging or the arrow keys turn it by hand. It is 160 px high unless a class or style sizes it. `assets`, `spin` and `max-nodes` remount it when they change; changing `node-id` keeps the canvas. See `createNodePreview` in `@opsorama/three`.

```vue
<script setup lang="ts">
import type { AssetRegistry } from '@opsorama/three';
import { EntityInspector, NodePreview } from '@opsorama/vue';

defineProps<{ assets: AssetRegistry }>();
</script>

<template>
  <EntityInspector v-slot="{ selection }">
    <NodePreview :node-id="selection?.nodeId ?? null" :assets="assets" style="height: 180px" />
  </EntityInspector>
</template>
```

`useSceneRenderer()` returns a read-only shallow ref of the renderer of the provider's `SceneCanvas` (null before it mounts and during server rendering), so any component under the provider can move the camera; `useCameraView()` returns a read-only shallow ref of the current camera view, updated at most once per rendered frame. One provider drives one canvas: a second `SceneCanvas` under the same provider shows an error naming the fix.

```ts
import { defineComponent, h } from 'vue';
import { useCameraView, useSceneRenderer } from '@opsorama/vue';

export const CameraButton = defineComponent({
  props: { nodeId: { type: String, required: true } },
  setup(props) {
    const renderer = useSceneRenderer(), view = useCameraView();
    return () => h('button', { disabled: !renderer.value, onClick: () => void renderer.value?.frame(props.nodeId, { fit: true, transition: { seconds: 1 } }) },
      `Go to ${props.nodeId} (yaw ${view.value ? view.value.yaw.toFixed(2) : '–'})`);
  },
});
```

Following a node and camera paths are renderer methods; call them through `useSceneRenderer()` and keep the returned promise or playback for state and stopping:

```ts
import { defineComponent, h, shallowRef, type PropType } from 'vue';
import type { CameraPath } from '@opsorama/core';
import type { CameraPathPlayback } from '@opsorama/three';
import { useSceneRenderer } from '@opsorama/vue';

export const TourButtons = defineComponent({
  props: { nodeId: { type: String, required: true }, tour: { type: Object as PropType<CameraPath>, required: true } },
  setup(props) {
    const renderer = useSceneRenderer(), playback = shallowRef<CameraPathPlayback | null>(null);
    const play = () => {
      const next = renderer.value?.playCameraPath(props.tour) ?? null;
      playback.value = next; void next?.finished.then(() => { if (playback.value === next) playback.value = null; });
    };
    return () => [
      h('button', { disabled: !renderer.value, onClick: () => void renderer.value?.followNode(props.nodeId, { heading: 'behind' }) }, `Follow ${props.nodeId}`),
      h('button', { disabled: !renderer.value, onClick: play }, 'Play tour'),
      h('button', { disabled: !playback.value, onClick: () => playback.value?.stop() }, 'Stop tour'),
    ];
  },
});
```

`SceneCanvas` emits a validated `pointer` event (`@pointer`, or `onPointer` in a render function; without a listener at mount the renderer does no pointer reporting work, and the first listener bound later remounts it once) and takes `plugins` (mount-time: keep the array stable). `useSceneFrame(listener, options?)` subscribes to the renderer's frame loop under the provider; `options` may be a ref or getter, and it does nothing during server rendering:

```ts
import { defineComponent, h, ref } from 'vue';
import { useSceneFrame } from '@opsorama/vue';

export const Steps = defineComponent({
  setup() {
    const steps = ref(0);
    useSceneFrame(frame => { steps.value = frame.frame; }, { step: 1 / 60 });
    return () => h('output', `${steps.value} steps`);
  },
});
```

```vue
<script setup lang="ts">
import type { ScenePointerEvent } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { SceneCanvas } from '@opsorama/vue';

function onPointer(event: ScenePointerEvent) {
  if (event.type === 'click' && event.nodeId === 'yard') event.preventSelection();
}
</script>

<template>
  <SceneCanvas :assets="catalogAssets" @pointer="onPointer" />
</template>
```

### Shapes, lines and groups

`Group`, `Shape` and `Line` take the node fields as props (`shape`, `opacity`, `width` and `dashed` among them); children of a group name it in `parentId`. A click on a bar that is not selectable selects its group.

```vue
<script setup lang="ts">
import { createSceneStore } from '@opsorama/core';
import { DashboardProvider, Group, Line, SceneCanvas, Shape } from '@opsorama/vue';

const store = createSceneStore();
const assets = {}; // shapes, lines and groups need no models
const values = [42, 65, 30];
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="assets" style="height: 360px" />
    <Group id="series-north" label="North" entity-id="series:north" />
    <Shape v-for="(value, column) in values" :key="column" :id="`bar-${column}`" parent-id="series-north"
      :position="[column * 1.2, 0, 0]" :shape="{ type: 'box', size: [0.8, value / 20, 0.8] }" color="#4f7fd8" />
    <Line id="trend" parent-id="series-north" :width="0.05" dashed
      :points="values.map((value, column) => [column * 1.2, value / 20 + 0.1, 0])" />
  </DashboardProvider>
</template>
```

### Text and images

`SceneText` and `SceneImage` take the node fields as props (`text`, `src`, `billboard`, `align`, and `size` as a number for text or `[width, height]` for images). An image that fails to load is emitted as `error` (its `name` is `IMAGE_LOAD_ERROR`) without covering the scene.

```vue
<script setup lang="ts">
import { createSceneStore } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, SceneImage, SceneText, Shape } from '@opsorama/vue';

const store = createSceneStore();
const assets = {};
const value = 42;
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="assets" style="height: 360px" />
    <Shape id="bar" :shape="{ type: 'box', size: [0.8, value / 20, 0.8] }" />
    <SceneText id="bar-value" :text="String(value)" :position="[0, value / 20 + 0.35, 0]" :size="0.26" billboard />
    <SceneImage id="logo" src="/images/logo.png" :size="[1.6, 1.6]" :position="[3, 0, 0]" billboard />
  </DashboardProvider>
</template>
```

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.

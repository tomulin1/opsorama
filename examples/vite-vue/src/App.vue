<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import Controls from './Controls.vue';
import { assets, createStarterStore } from './scene';

// The component owns its store; SceneCanvas creates and disposes the renderer itself.
const store = createStarterStore();
onBeforeUnmount(() => store.dispose());
</script>

<template>
  <main style="max-width: 960px; margin: 0 auto; padding: 16px">
    <h1 style="font-size: 20px">Opsorama starter · Vue</h1>
    <DashboardProvider :store="store">
      <SceneCanvas :assets="assets" wheel-zoom style="height: 480px; border-radius: 12px; overflow: hidden" />
      <Controls />
    </DashboardProvider>
  </main>
</template>

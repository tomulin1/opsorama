<script setup lang="ts">
// A single-file component using the native Vue adapter; compiled by tests/vue-sfc.test.ts.
import { computed, type PropType } from 'vue';
import type { SceneRenderer } from '@opsorama/three';
import type { SceneStore } from '@opsorama/core';
import { DashboardProvider, EntityLayer, SceneCanvas } from '@opsorama/vue';
import { catalogAssets } from '@opsorama/objects';
import { contractNodes, type ContractSettings } from '../object-contract-data';

const props = defineProps({
  store: { type: Object as PropType<SceneStore>, required: true },
  settings: { type: Object as PropType<ContractSettings>, required: true },
});
const emit = defineEmits<{ ready: [renderer: SceneRenderer] }>();
// The same scene data the React and JavaScript examples use.
const nodes = computed(() => contractNodes(props.settings));
</script>

<template>
  <DashboardProvider :store="store">
    <SceneCanvas :assets="catalogAssets" style="height: 380px" @ready="renderer => emit('ready', renderer)">
      <EntityLayer :nodes="nodes" />
    </SceneCanvas>
  </DashboardProvider>
</template>

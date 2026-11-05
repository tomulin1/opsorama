<script setup lang="ts">
import { useScene, useSceneStore } from '@opsorama/vue';
import { shipOrder } from './scene';

const store = useSceneStore();
const snapshot = useScene();
</script>

<template>
  <p>
    <button type="button" @click="shipOrder(store)">Ship order #1001</button>
    <span> Selected: {{ snapshot.selection?.entityId ?? 'none' }}</span>
  </p>
</template>

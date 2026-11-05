'use client';
import { useState } from 'react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { assets, createStarterStore, shipOrder } from './scene';

function Controls() {
  const store = useSceneStore(), snapshot = useScene();
  return <p><button type="button" onClick={() => shipOrder(store)}>Ship order #1001</button> <span>Selected: {snapshot.selection?.entityId ?? 'none'}</span></p>;
}

/** Client component: the renderer needs the browser. SceneCanvas mounts it after hydration and disposes it on unmount. */
export function Dashboard() {
  const [store] = useState(createStarterStore);
  return (
    <DashboardProvider store={store}>
      <SceneCanvas assets={assets} wheelZoom style={{ height: 480, borderRadius: 12, overflow: 'hidden' }} />
      <Controls />
    </DashboardProvider>
  );
}

import { useState } from 'react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { assets, createStarterStore, shipOrder } from './scene';

function Controls() {
  const store = useSceneStore(), snapshot = useScene();
  return <p><button type="button" onClick={() => shipOrder(store)}>Ship order #1001</button> <span>Selected: {snapshot.selection?.entityId ?? 'none'}</span></p>;
}

export function App() {
  // One store for the lifetime of the page; SceneCanvas creates and disposes the renderer itself.
  const [store] = useState(createStarterStore);
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Opsorama starter · React</h1>
      <DashboardProvider store={store}>
        <SceneCanvas assets={assets} wheelZoom style={{ height: 480, borderRadius: 12, overflow: 'hidden' }} />
        <Controls />
      </DashboardProvider>
    </main>
  );
}

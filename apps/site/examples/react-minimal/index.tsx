'use client';
import { useState } from 'react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { makeExampleStore, moveSample } from '../shared';
import { catalogAssets } from '@opsorama/objects';
function Controls() { const store = useSceneStore(), snapshot = useScene(); return <div className="adapter-example-controls"><button onClick={() => moveSample(store)}>Move order #1001</button><span>Selected: {snapshot.selection?.entityId || 'none'}</span></div>; }
export function ReactExample({ instancing = true }: { instancing?: boolean }) { const [store] = useState(makeExampleStore); return <DashboardProvider store={store}><SceneCanvas assets={catalogAssets} instancing={instancing} style={{ height: 360 }} /><Controls /></DashboardProvider>; }

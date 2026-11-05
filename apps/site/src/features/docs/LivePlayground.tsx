'use client';
import { useState } from 'react';
import { DashboardProvider, SceneCanvas, useRendererFps, useScene, useSceneStore, useSceneZoom } from '@opsorama/react';
import { ZoomControl } from '@opsorama/react/ui';
import type { SceneRenderer } from '@opsorama/renderer-three';
import '@opsorama/ui/styles.css';
import { DEFAULT_SETTINGS } from '@opsorama/core';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { makeExampleStore, moveSample } from '../../../examples/shared';
import { CodeBlock } from './CodeBlock';
/** Keeps the once-per-second FPS update out of the playground form. */
function PlaygroundZoom({ renderer }: { renderer: SceneRenderer | null }) {
  return <ZoomControl className="docs-playground-zoom" {...useSceneZoom()} step={.2} reset caption="Zoom" fps={useRendererFps(renderer)} labels={{ group: 'Playground zoom' }} />;
}
function Controls() {
  const [renderer, setRenderer] = useState<SceneRenderer | null>(null);
  const store = useSceneStore(), snapshot = useScene();
  return <><div className="docs-playground"><div className="docs-playground-scene"><div><span className="docs-live-dot" /><strong>Interactive preview</strong><small>Shared renderer</small></div><SceneCanvas style={{ height: 310, minHeight: 310 }} wheelZoom onReady={setRenderer}><PlaygroundZoom renderer={renderer} /></SceneCanvas><div className="docs-playground-status"><span>Selected: {snapshot.selection?.entityId ? `#${snapshot.selection.entityId}` : 'none'}</span><button onClick={() => moveSample(store)}>Move #1001 →</button></div></div><div className="docs-playground-controls"><h3><SlidersHorizontal size={14} />Configuration</h3><label>Theme<select aria-label="Playground theme" value={snapshot.settings.theme} onChange={e => store.configure({ theme: e.target.value as 'light' | 'midnight' })}><option value="light">Light</option><option value="midnight">Midnight</option></select></label>{(['labels', 'grid', 'shadows', 'motion', 'paused'] as const).map(key => <label className="docs-control-toggle" key={key}>{key[0].toUpperCase() + key.slice(1)}<input aria-label={`Playground ${key}`} type="checkbox" checked={snapshot.settings[key]} onChange={e => store.configure({ [key]: e.target.checked })} /></label>)}<label>Speed<span>{snapshot.settings.speed}×</span><input aria-label="Playground speed" type="range" min=".25" max="3" step=".25" value={snapshot.settings.speed} onChange={e => store.configure({ speed: Number(e.target.value) })} /></label><button className="docs-reset-config" onClick={() => store.configure(DEFAULT_SETTINGS)}><RotateCcw size={12} />Reset defaults</button></div></div><CodeBlock code={`store.configure(${JSON.stringify(snapshot.settings, null, 2)});`} /></>;
}
export function LivePlayground() { const [store] = useState(makeExampleStore); return <DashboardProvider store={store}><Controls /></DashboardProvider>; }

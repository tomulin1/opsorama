'use client';
import { useEffect, useRef, useState } from 'react';
import type { AssetNode, SurfaceLabel } from '@opsorama/core';
import { assetLabelSurfaces, type SceneRenderer } from '@opsorama/renderer-three';
import { ObjectLabelControls } from './ObjectLabelControls';

type Adapter = 'React' | 'Vue' | 'JavaScript';
type Mount = { update: (node: AssetNode) => void; dispose: () => void };

/** Uses native Asset props in React/Vue and store updates in JavaScript. */
export function SurfaceLabelExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [surfaceLabel, setSurfaceLabel] = useState<SurfaceLabel>();
  const [error, setError] = useState(''), [diagnostics, setDiagnostics] = useState({ objects: 0, textures: 0, geometries: 0 });
  const container = useRef<HTMLDivElement>(null), mount = useRef<Mount | undefined>(undefined);
  const node: AssetNode = { id: 'branch', kind: 'asset', asset: 'storefront', selectable: true, label: 'North branch', scale: [1.8, 1.8, 1.8], surfaceLabel };
  const latest = useRef(node); latest.current = node;
  useEffect(() => {
    if (!mounted) return;
    let active = true, session: Mount | undefined, view: SceneRenderer | undefined; setError('');
    const source = adapter === 'React' ? import('../../../examples/counted-react') : adapter === 'Vue' ? import('../../../examples/counted-vue') : import('../../../examples/counted-javascript');
    void source.then(module => {
      if (!active || !container.current) return;
      const ready = (renderer: SceneRenderer) => { if (active) view = renderer; };
      session = 'mountCountedReact' in module ? module.mountCountedReact(container.current, latest.current, ready) : 'mountCountedVue' in module ? module.mountCountedVue(container.current, latest.current, ready) : module.mountCountedJavaScript(container.current, latest.current, ready);
      mount.current = session;
    }).catch(failure => { if (active) setError(String(failure)); });
    const timer = setInterval(() => { if (view) setDiagnostics(view.getDiagnostics()); }, 300);
    return () => { active = false; clearInterval(timer); session?.dispose(); mount.current = undefined; };
  }, [adapter, mounted]);
  useEffect(() => { mount.current?.update(latest.current); }, [surfaceLabel]);
  return <div className="count-example">
    <div className="object-code-tabs" aria-label="Surface label preview adapter">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={adapter === value} onClick={() => setAdapter(value)}>{value}</button>)}<button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount label preview' : 'Mount label preview'}</button></div>
    <div className="count-example-layout"><div>{mounted ? <div ref={container} className="count-example-canvas" data-adapter={adapter} /> : <p>Renderer disposed. The label is retained.</p>}{error && <p role="alert">{error}</p>}<small data-testid="label-diagnostics">{diagnostics.objects} node · {diagnostics.textures} textures · {diagnostics.geometries} geometries</small></div><ObjectLabelControls surface={assetLabelSurfaces.storefront} onChange={setSurfaceLabel} /></div>
  </div>;
}

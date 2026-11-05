'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { validateSurfaceLabel, type AssetNode, type SceneSettings } from '@opsorama/core';
import { catalogObjects, objectNode } from './objects';
import { ObjectDisplayControls } from './ObjectDisplayControls';

const displays = catalogObjects.filter(item => item.category === 'Displays & time');
export function DisplayExample() {
  const [adapter, setAdapter] = useState<'React' | 'Vue' | 'JavaScript'>('React'), [mounted, setMounted] = useState(true);
  const [node, setNode] = useState<AssetNode>(() => ({ ...objectNode(displays[0]), label: displays[0].name, scale: [2.5, 2.5, 2.5], surfaceLabel: { kind: 'text', layout: 'multiline', text: 'Operations\nAll systems ready' } } as AssetNode));
  const [motion, setMotion] = useState(false), [paused, setPaused] = useState(false), [error, setError] = useState<string>();
  const container = useRef<HTMLDivElement>(null), session = useRef<{ update(node: AssetNode): void; configure(settings: Partial<SceneSettings>): void; dispose(): void } | null>(null);
  const latest = useRef({ node, motion, paused }); latest.current = { node, motion, paused };
  const item = useMemo(() => displays.find(item => item.asset === node.asset)!, [node.asset]);
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: typeof session.current = null; setError(undefined);
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/display-react')).mountDisplayReact : adapter === 'Vue' ? (await import('../../../examples/display-vue')).mountDisplayVue : (await import('../../../examples/display-javascript')).mountDisplayJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current.node); view.configure({ motion: latest.current.motion, paused: latest.current.paused }); session.current = view;
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); session.current = null; };
  }, [adapter, mounted]);
  useEffect(() => { session.current?.update(node); }, [node]);
  useEffect(() => { session.current?.configure({ motion, paused }); }, [motion, paused]);
  return <section className="adapter-example" aria-label="Displays and time">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface">{mounted ? <div key={adapter} ref={container} style={{ height: 380, position: 'relative' }} /> : <p>Scene unmounted</p>}</div>
    <div className="indicator-controls">
      <label>Model<select aria-label="Display model" value={node.asset} onChange={event => { const next = displays.find(item => item.asset === event.target.value)!; setNode({ ...objectNode(next), label: next.name, scale: [2.5, 2.5, 2.5], ...(!next.display ? { surfaceLabel: { kind: 'text', layout: 'multiline', text: 'Operations\nAll systems ready' } as const } : {}) } as AssetNode); }}>{displays.map(item => <option key={item.asset} value={item.asset}>{item.name}</option>)}</select></label>
      {item.variants && <label>Variant<select aria-label="Display variant" value={node.variant} onChange={event => setNode({ ...node, variant: event.target.value })}>{item.variants.map(value => <option key={value}>{value}</option>)}</select></label>}
      {node.display ? <ObjectDisplayControls reading={node.display} onChange={display => setNode({ ...node, display })} /> : <label>Screen text<textarea aria-label="Screen text" value={node.surfaceLabel?.kind === 'text' ? node.surfaceLabel.text : ''} maxLength={480} onChange={event => { const surfaceLabel = { kind: 'text', layout: 'multiline', text: event.target.value.trim() ? event.target.value : 'Display' } as const; try { validateSurfaceLabel(surfaceLabel); setNode({ ...node, surfaceLabel }); } catch { /* Keep the last valid artwork. */ } }} /></label>}
      {item.animation === 'local' && <><label>Animation<input aria-label="Scene animation" type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} /></label><label>Pause<input aria-label="Scene paused" type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} /></label></>}
    </div>
    <p>Host inputs stay authoritative. Running demonstrates visual time; supplied values restart the preview on update or remount.</p>{error && <p role="alert">{error}</p>}
  </section>;
}

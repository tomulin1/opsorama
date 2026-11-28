'use client';
import { useEffect, useRef, useState } from 'react';
import type { SceneRenderer } from '@opsorama/three';
import { nodeHtmlSnippet, type NodeHtmlCallbacks, type NodeHtmlSession } from '../../../examples/node-html-data';
import { CodeBlock } from './CodeBlock';

type Adapter = 'React' | 'Vue' | 'JavaScript';
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;

/**
 * Live HTML-over-nodes example: a click on the forklift, the rack or the pallet opens a context menu attached to that node,
 * which follows the forklift on its patrol and the camera. The same scene runs through native React (`NodeHtml` with a
 * portal), Vue (`NodeHtml` with a teleport) and plain JavaScript (`renderer.attachHtml`); unmounting shows the cleanup.
 */
export function NodeHtmlExample() {
  const [adapter, setAdapter] = useState<Adapter>('React'), [mounted, setMounted] = useState(true), [error, setError] = useState<string | null>(null), [loaded, setLoaded] = useState(false);
  const container = useRef<HTMLDivElement>(null), renderer = useRef<SceneRenderer | null>(null);
  useEffect(() => {
    if (!mounted) return;
    let active = true, view: NodeHtmlSession | null = null;
    setError(null); setLoaded(false);
    const callbacks: NodeHtmlCallbacks = { ready: value => { if (!active) return; renderer.current = value; void value.loaded.then(() => { if (active) setLoaded(true); }, () => undefined); } };
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/node-html-react')).mountNodeHtmlReact : adapter === 'Vue' ? (await import('../../../examples/node-html-vue')).mountNodeHtmlVue : (await import('../../../examples/node-html-javascript')).mountNodeHtmlJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, {}, callbacks);
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { active = false; view?.dispose(); renderer.current = null; };
  }, [adapter, mounted]);
  return <section className="adapter-example node-html-example" aria-label="HTML over nodes example">
    <div className="adapter-example-tabs">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button key={name} aria-pressed={adapter === name} className={adapter === name ? 'active' : ''} onClick={() => { setAdapter(name); setMounted(true); }}>{name}</button>)}<button className="adapter-remount" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button></div>
    <div className="adapter-example-surface" data-adapter={adapter}>{mounted ? <div key={adapter} ref={container} className="node-html-canvas" /> : <div className="adapter-example-unmounted">Scene unmounted</div>}</div>
    <p className="node-html-hint"><output className="node-html-load-status">{mounted ? loaded ? 'Scene loaded.' : 'Loading scene.' : 'Scene unmounted.'}</output> Click the forklift, the rack or the pallet to open its menu over it; the menu follows the forklift on its patrol and the camera when you pan or zoom. Clicks and the wheel over the menu stay with the menu. Click the floor or press Escape to close it.</p>
    {error && <p role="alert">{error}</p>}
    <CodeBlock code={nodeHtmlSnippet(frameworks[adapter])} language={adapter === 'React' ? 'tsx' : 'typescript'} />
  </section>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { ReactExample } from '../../../examples/react-minimal';
function NativeExample({ adapter, instancing }: { adapter: 'vue' | 'vanilla'; instancing: boolean }) {
  const container = useRef<HTMLDivElement>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; let cleanup: (() => void) | undefined; const load = async () => { try { const exampleModule = adapter === 'vue' ? await import('../../../examples/vue-minimal') : await import('../../../examples/vanilla-minimal'); if (!active || !container.current) return; cleanup = 'mountVueExample' in exampleModule ? exampleModule.mountVueExample(container.current, instancing) : exampleModule.mountVanillaExample(container.current, instancing); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }; void load(); return () => { active = false; cleanup?.(); }; }, [adapter, instancing]);
  return <div>{error ? <p role="alert">{error}</p> : <div ref={container} />}</div>;
}
export function AdapterExamples() {
  const [adapter, setAdapter] = useState<'react' | 'vue' | 'vanilla'>('react'); const [mounted, setMounted] = useState(true);
  const [instancing, setInstancing] = useState(true);
  return <section className="adapter-example"><div className="adapter-example-tabs">{(['react', 'vue', 'vanilla'] as const).map(value => <button key={value} className={adapter === value ? 'active' : ''} onClick={() => { setAdapter(value); setMounted(true); }}>{value === 'vanilla' ? 'Plain JavaScript' : value === 'vue' ? 'Vue' : 'React'}</button>)}<button className="adapter-remount" onClick={() => setMounted(v => !v)}>{mounted ? 'Unmount scene' : 'Mount scene'}</button><label><input type="checkbox" checked={instancing} onChange={event => setInstancing(event.target.checked)} />Instancing</label></div><div className="adapter-example-surface" data-adapter={adapter}>{mounted ? adapter === 'react' ? <ReactExample instancing={instancing} /> : <NativeExample key={adapter} adapter={adapter} instancing={instancing} /> : <div className="adapter-example-unmounted">Scene disposed. Mount it again to create a fresh renderer.</div>}</div><p>Same scene definition. Same renderer. Native framework lifecycle.</p></section>;
}

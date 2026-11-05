'use client';
import { useEffect, useRef, useState } from 'react';
import { createSceneStore, type SceneDefinition, type SceneNode, type SceneStore, type SelectionStyle } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/renderer-three';

const object = (id: string, label: string, asset: string, position: readonly [number, number, number], extra: Partial<Extract<SceneNode, { kind: 'asset' }>> = {}): SceneNode => ({ id, kind: 'asset', asset, label, labelMode: 'active', position, selectable: true, ...extra });
const parcels = Array.from({ length: 6 }, (_, i) => object(`parcel-${i + 1}`, `Parcel ${i + 1}`, 'parcel', [1.8 + (i % 3) * 1.5, 0, 3 + Math.floor(i / 3) * 1.6]));

/** Sizes from a parcel to a silo, a moving robot and alert states; six equal parcels render as one instanced batch. */
const definition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'floor', kind: 'ground', size: [26, 14] },
  object('container', 'Shipping container', 'shipping-container', [-8.5, 0, -2]),
  object('rack', 'Pallet rack', 'pallet-rack', [-1.5, 0, -4.2]),
  object('silo', 'Grain silo', 'grain-silo', [9, 0, -2.5]),
  object('forklift', 'Forklift', 'forklift', [-3, 0, 1.6]),
  object('worker', 'Worker', 'worker', [-6.5, 0, 3.6]),
  object('cone', 'Traffic cone', 'traffic-cone', [-.5, 0, 4.6]),
  object('machine', 'Machine tool · warning', 'machine-tool', [7.5, 0, 3.8], { state: 'warning' }),
  object('tank', 'Storage tank · critical', 'storage-tank', [3.6, 0, -4.4], { state: 'critical' }),
  object('robot', 'Mobile robot · moving', 'mobile-robot', [1, 0, -.8], { route: { points: [[1, 0, -.8], [6, 0, -.8], [6, 0, 1.6], [1, 0, 1.6], [1, 0, -.8]], speed: 1.1, loop: true } }),
  ...parcels,
] };
const selectable = definition.nodes.filter(node => node.kind === 'asset');
const styles: readonly { value: SelectionStyle; label: string }[] = [{ value: 'corners', label: 'Corner brackets' }, { value: 'glow', label: 'Glow' }];

/** Compares selection styles in one scene; the style is a scene setting, so switching keeps the selection and camera. */
export function SelectionStylesExample() {
  const [style, setStyle] = useState<SelectionStyle>('corners'), [midnight, setMidnight] = useState(false), [motion, setMotion] = useState(true), [selected, setSelected] = useState<string | null>('forklift'), [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null), store = useRef<SceneStore | null>(null);
  useEffect(() => {
    if (!container.current) return;
    const scene = createSceneStore(definition, { zoom: 1.5 });
    const view = createSceneRenderer(container.current, scene, { onSelect: selection => setSelected(selection?.nodeId ?? null), onError: failure => setError(failure.message) });
    store.current = scene; scene.select('forklift', 'api');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { scene.select(null, 'keyboard'); setSelected(null); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); store.current = null; view.dispose(); scene.dispose(); };
  }, []);
  useEffect(() => { store.current?.configure({ selectionStyle: style, theme: midnight ? 'midnight' : 'light', motion }); }, [style, midnight, motion]);
  const choose = (id: string) => { store.current?.select(id, 'keyboard'); setSelected(id); };
  return <section className="datacenter-example" aria-label="Selection styles">
    <div className="adapter-example-tabs">
      {styles.map(entry => <button key={entry.value} aria-pressed={style === entry.value} className={style === entry.value ? 'active' : ''} onClick={() => setStyle(entry.value)}>{entry.label}</button>)}
      <button className="adapter-remount" aria-pressed={midnight} onClick={() => setMidnight(value => !value)}>{midnight ? 'Light theme' : 'Midnight theme'}</button>
      <button aria-pressed={!motion} onClick={() => setMotion(value => !value)}>{motion ? 'Turn motion off' : 'Turn motion on'}</button>
    </div>
    <div className="adapter-example-surface"><div ref={container} className="datacenter-canvas" /></div>
    {error && <p role="alert">{error}</p>}
    <p role="status">Hover an object to preview it, click to select it, press Esc to clear the selection.</p>
    <div className="datacenter-records">{selectable.map(node => <div key={node.id}><button aria-pressed={selected === node.id} onClick={() => choose(node.id)}>{node.label}</button></div>)}</div>
  </section>;
}

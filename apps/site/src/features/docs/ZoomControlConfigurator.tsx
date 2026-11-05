'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { zoomControl } from '@opsorama/ui';
import { defaultZoomConfig, zoomOptions, zoomSnippet, type ZoomConfig, type ZoomSample } from '../../../examples/zoom-control-fixture';
import { CodeBlock } from './CodeBlock';
import '@opsorama/ui/styles.css';
import './zoom-control.css';

type Adapter = 'React' | 'Vue' | 'JavaScript';
type Placement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
interface Session { update(sample: ZoomSample): void; dispose(): void; }
const frameworks = { React: 'react', Vue: 'vue', JavaScript: 'javascript' } as const;

function Choice<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: readonly V[]; onChange(value: V): void }) {
  return <label>{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value as V)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="zoom-config-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>;
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange(value: number): void }) {
  return <label>{label}<input aria-label={label} type="number" step="0.05" value={value} onChange={event => onChange(event.target.valueAsNumber)} /></label>;
}
function Group({ title, children }: { title: string; children: ReactNode }) { return <fieldset><legend>{title}</legend>{children}</fieldset>; }

/** Live ZoomControl configurator. The preview runs the real component through each native adapter. */
export function ZoomControlConfigurator() {
  const [config, setConfig] = useState<ZoomConfig>(defaultZoomConfig), [zoom, setZoom] = useState(defaultZoomConfig.defaultValue);
  const [adapter, setAdapter] = useState<Adapter>('React'), [placement, setPlacement] = useState<Placement>('bottom-right'), [dark, setDark] = useState(false);
  const container = useRef<HTMLDivElement>(null), session = useRef<Session | null>(null);
  const set = <K extends keyof ZoomConfig>(key: K) => (value: ZoomConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  const value = Math.min(config.max, Math.max(config.min, zoom));
  const sample: ZoomSample = { config, value, onChange: setZoom };
  // Validate with the shared builder so an invalid range keeps the last valid preview.
  let error = '';
  try { zoomControl(zoomOptions(sample)); } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  const latest = useRef(sample); if (!error) latest.current = sample;
  useEffect(() => {
    let active = true, view: Session | null = null;
    void (async () => {
      const mount = adapter === 'React' ? (await import('../../../examples/zoom-control-react')).mountZoomControlReact : adapter === 'Vue' ? (await import('../../../examples/zoom-control-vue')).mountZoomControlVue : (await import('../../../examples/zoom-control-javascript')).mountZoomControlJavaScript;
      if (!active || !container.current) return;
      view = mount(container.current, latest.current); session.current = view;
    })();
    return () => { active = false; view?.dispose(); session.current = null; };
  }, [adapter]);
  useEffect(() => { if (!error) session.current?.update(latest.current); });
  return <section className="zoom-configurator" aria-label="ZoomControl configurator">
    <div className="zoom-config-stage" data-placement={placement} style={{ colorScheme: dark ? 'dark' : 'light' }}>
      <span className="zoom-stage-note">Your scene or view · zoom {value.toFixed(2)}×</span>
      <div key={adapter} ref={container} className="zoom-config-slot" />
    </div>
    <div className="zoom-config-bar" role="group" aria-label="Preview adapter">{(['React', 'Vue', 'JavaScript'] as const).map(name => <button type="button" key={name} aria-pressed={adapter === name} onClick={() => setAdapter(name)}>{name}</button>)}
      <button type="button" onClick={() => { setConfig(defaultZoomConfig); setZoom(defaultZoomConfig.defaultValue); }}>Reset settings</button></div>
    {error && <p role="alert" className="zoom-config-error">Invalid settings: {error} The preview keeps the last valid settings.</p>}
    <div className="zoom-config-form">
      <Group title="Layout">
        <Choice label="Orientation" value={config.orientation} options={['horizontal', 'vertical'] as const} onChange={set('orientation')} />
        <Choice label="Appearance" value={config.appearance} options={['toolbar', 'plain'] as const} onChange={set('appearance')} />
        <Choice label="Density" value={config.density} options={['compact', 'comfortable'] as const} onChange={set('density')} />
      </Group>
      <Group title="Content">
        <Choice label="Controls" value={config.controls} options={['buttons', 'slider', 'both'] as const} onChange={set('controls')} />
        <label>Caption<input aria-label="Caption" value={config.caption} placeholder="none" onChange={event => set('caption')(event.target.value)} /></label>
        <Toggle label="Reset button" checked={config.reset} onChange={set('reset')} />
        <Choice label="FPS readout" value={config.fps} options={['off', 'reading', 'unknown'] as const} onChange={set('fps')} />
        <Toggle label="Host content" checked={config.extra} onChange={set('extra')} />
      </Group>
      <Group title="Range">
        <NumberField label="Minimum" value={config.min} onChange={set('min')} />
        <NumberField label="Maximum" value={config.max} onChange={set('max')} />
        <NumberField label="Step" value={config.step} onChange={set('step')} />
        <NumberField label="Default value" value={config.defaultValue} onChange={set('defaultValue')} />
      </Group>
      <Group title="State and preview">
        <Toggle label="Disabled" checked={config.disabled} onChange={set('disabled')} />
        <Toggle label="Dark preview" checked={dark} onChange={setDark} />
        <Choice<Placement> label="Placement" value={placement} options={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']} onChange={setPlacement} />
      </Group>
    </div>
    <p className="zoom-config-hint">The preview has no scene, so the FPS reading is a fixed sample; in your app, useRendererFps or sampleRendererFps measures the mounted renderer. Placement is host layout and is not a component setting. The code below lists only settings that differ from the built-in defaults.</p>
    <CodeBlock code={zoomSnippet(latest.current.config, frameworks[adapter])} language={adapter === 'React' ? 'tsx' : adapter === 'Vue' ? 'vue' : 'js'} />
  </section>;
}

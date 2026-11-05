'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bindBuildingInterior, isPersonAsset, PERSON_FIGURES, PERSON_HAIR_COLORS, resolveFootprint, type PersonFigure, type PersonHairColor, type Footprint, BUILDING_SIZE, BUILDING_TYPE_LABELS, createSceneStore, type DisplayReading, type BuildingType, type BuildingOptions, type Vec3, type SceneStore, type SurfaceLabel, type Measurement, type VisualState, type CountLayout } from '@opsorama/core';
import { type SceneRenderer } from '@opsorama/three';
import { assetCountLayoutDefaults, assetDescriptors, assetLabelSurfaces } from '@opsorama/objects';
import { ArrowLeft, ArrowRight, ArrowUpRight, RotateCcw } from 'lucide-react';
import { ZoomControl } from '@opsorama/react/ui';
import '@opsorama/ui/styles.css';
import { catalogStateLabel, objectNode, objectSnippet, type CatalogObject } from './objects';
import { CodeBlock } from './CodeBlock';
import { ObjectContract } from './ObjectContract';
import { ObjectMovement } from './ObjectMovement';
import { ObjectCompatibility } from './ObjectCompatibility';
import { ObjectCountControls } from './ObjectCountControls';
import { ObjectLabelControls } from './ObjectLabelControls';
import { ObjectMeasurementControls } from './ObjectMeasurementControls';
import { ObjectDisplayControls } from './ObjectDisplayControls';
import { BuildingDimensions } from './BuildingDimensions';
import { SurfaceFootprint } from './SurfaceFootprint';
const measurementVariantLabels: Readonly<Record<string, string>> = { 'vertical-segmented': 'Vertical segments', 'horizontal-segmented': 'Horizontal segments', 'vertical-continuous': 'Vertical fill', 'horizontal-continuous': 'Horizontal fill', full: 'Full', semicircle: 'Semicircle' };
const PREVIEW_ZOOM = { default: 1.25, min: .65, max: 5, step: .1 } as const;

export function ObjectDetails({ item }: { item: CatalogObject }) {
  const [color, setColor] = useState(item.color ?? '#6489d6'), [variant, setVariant] = useState(item.variants?.[0] ?? '');
  const [count, setCount] = useState(item.countDefinition?.default ?? 1), [motion, setMotion] = useState(item.animation === 'local'), [theme, setTheme] = useState<'light' | 'midnight'>('light');
  const [moved, setMoved] = useState(false), [mounted, setMounted] = useState(true), [selected, setSelected] = useState(false), [error, setError] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const [buildingOpen, setBuildingOpen] = useState(false), [figure, setFigure] = useState<PersonFigure>('masculine'), [hair, setHair] = useState<PersonHairColor>('dark');
  const [buildingCutaway, setBuildingCutaway] = useState<NonNullable<BuildingOptions['cutaway']>>('low-walls');
  const [buildingSize, setBuildingSize] = useState<Vec3>(BUILDING_SIZE);
  const [countLayout, setCountLayout] = useState<CountLayout>('reserved');
  const [footprint, setFootprint] = useState<Footprint>(), [colorTouched, setColorTouched] = useState(false);
  const shownColor = item.variantColors && !colorTouched ? item.variantColors[variant] ?? color : color;
  const [surfaceLabel, setSurfaceLabel] = useState<SurfaceLabel>();
  const [state, setState] = useState<VisualState | undefined>(item.states?.[0]);
  const effectiveState = item.states?.find(value => value === state) ?? item.states?.[0];
  const [operationEnabled, setOperationEnabled] = useState(true), [fillLevel, setFillLevel] = useState(1);
  const [direction, setDirection] = useState(0);
  const [zoom, setZoom] = useState<number>(PREVIEW_ZOOM.default);
  const [measurement, setMeasurement] = useState<Readonly<Measurement>>(item.measurement ?? { value: 60, unit: '%' });
  const [display, setDisplay] = useState<DisplayReading | undefined>(item.display);
  const [inputMode, setInputMode] = useState<'measurement' | 'count'>(item.measurement ? 'measurement' : 'count');
  const reading = item.measurement && inputMode === 'measurement' ? measurement : false;
  const labelSurface = item.asset ? assetLabelSurfaces[item.asset] : undefined;
  const [framework, setFramework] = useState<'React' | 'Vue' | 'JavaScript'>('React');
  const canvas = useRef<HTMLDivElement>(null), store = useRef<SceneStore | null>(null), renderer = useRef<SceneRenderer | null>(null), normalization = useRef(1), fit = useRef<((count: number, variant: string | undefined, measurement: Measurement | false, countLayout: CountLayout, building?: BuildingOptions, footprint?: Footprint) => number) | null>(null);
  const config = useMemo(() => ({ display, ...(item.animation === 'local' ? { localMotion: motion } : {}), ...(item.operatingProperty === 'fillLevel' ? { fillLevel } : item.operatingProperty ? { [item.operatingProperty]: operationEnabled } : {}), ...(figure === 'feminine' ? { person: { figure } } : {}), ...(hair === 'dark' ? {} : { materials: { hair: PERSON_HAIR_COLORS[hair] } }), ...(item.asset === 'building' ? { building: { size: buildingSize, view: buildingOpen ? 'open' as const : 'closed' as const, cutaway: buildingCutaway } } : {}), color: item.variantColors ? colorTouched ? color : undefined : item.asset === 'building' && color === item.color ? undefined : item.color ? color : undefined, variant: variant || undefined, footprint, state: effectiveState, rotation: [0, direction * Math.PI / 180, 0] as const, count, countLayout, surfaceLabel, measurement: reading as Measurement | false, x: moved ? 3 : 0 }), [item, motion, operationEnabled, fillLevel, display, figure, hair, buildingOpen, buildingCutaway, buildingSize, color, colorTouched, footprint, variant, effectiveState, direction, count, countLayout, surfaceLabel, reading, moved]);
  const latest = useRef({ config, motion, theme, zoom }); latest.current = { config, motion, theme, zoom };
  useEffect(() => {
    if (!mounted) return;
    const abort = new AbortController(); let view: SceneRenderer | undefined, session: SceneStore | undefined, unsubscribe: (() => void) | undefined, unbind: (() => void) | undefined;
    setError(null); setSelected(false);
    void import('./object-rendering').then(async ({ catalogAssets, previewScale }) => {
      if (abort.signal.aborted || !canvas.current) return;
      const { createSceneRenderer } = await import('@opsorama/three');
      if (abort.signal.aborted || !canvas.current) return;
      fit.current = (count, variant, measurement, countLayout, building, footprint) => previewScale(item, { count, variant, measurement, countLayout, building, footprint });
      const value = latest.current;
      normalization.current = fit.current(value.config.count, value.config.variant, value.config.measurement, value.config.countLayout, value.config.building, value.config.footprint);
      session = createSceneStore({ schemaVersion: 1, nodes: [objectNode(item, { ...value.config, state: value.config.state, scale: normalization.current })] }, { motion: value.motion, theme: value.theme, shadows: false, zoom: value.zoom });
      store.current = session;
      if (item.asset === 'building') unbind = bindBuildingInterior(session, 'catalog-object', async () => [
        { id: 'preview-desk', kind: 'asset', asset: 'desk-pod', position: [-1.5, .12, -.8], label: 'Example desk', selectable: true },
        { id: 'preview-tote', kind: 'asset', asset: 'tote', count: 0, position: [1.8, .12, .8], label: 'Example tote', selectable: true },
      ]);
      unsubscribe = session.subscribe(() => { const snapshot = session?.getSnapshot(); setSelected(!!snapshot?.selection); if (snapshot) setZoom(snapshot.settings.zoom); });
      view = createSceneRenderer(canvas.current, session, { assets: catalogAssets, wheelZoom: true, onError: failure => setError(failure.message) }); renderer.current = view;
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure)); });
    return () => { abort.abort(); unsubscribe?.(); unbind?.(); view?.dispose(); session?.dispose(); store.current = null; renderer.current = null; fit.current = null; };
  }, [item, mounted]);
  useEffect(() => {
    const session = store.current;
    if (session) { normalization.current = fit.current?.(config.count, config.variant, config.measurement, config.countLayout, config.building, config.footprint) ?? normalization.current; session.upsert(objectNode(item, { ...config, state: config.state, scale: normalization.current })); }
  }, [item, config]);
  useEffect(() => { store.current?.configure({ motion, theme }); }, [motion, theme]);
  // The store subscription mirrors zoom, so a write here must reach the store before anything else notifies.
  function changeZoom(value: number) { setZoom(value); store.current?.configure({ zoom: value }); }
  function resetView() { changeZoom(PREVIEW_ZOOM.default); renderer.current?.overview(); }
  function reset() { setOperationEnabled(true); setFillLevel(1); setResetVersion(value => value + 1); setSurfaceLabel(undefined); setDisplay(item.display); setCountLayout('reserved'); setState(item.states?.[0]); setDirection(0); resetView(); setMeasurement(item.measurement ?? { value: 60, unit: '%' }); setInputMode(item.measurement ? 'measurement' : 'count'); setColor(item.color ?? '#6489d6'); setColorTouched(false); setFootprint(undefined); setVariant(item.variants?.[0] ?? ''); setCount(item.countDefinition?.default ?? 1); setMotion(item.animation === 'local'); setTheme('light'); setMoved(false); }
  const node = objectNode(item, config);
  return <section className="object-detail">
    <Link className="object-back" href="/docs/objects"><ArrowLeft size={15} />All objects</Link>
    <>
      <div className="object-preview-layout"><div className="object-preview-world"><div className="object-preview-heading"><span><i />Live model preview</span><span>Drag to pan · scroll to zoom · click to select</span></div>
        <div className="object-preview-viewport">
          {mounted ? <div ref={canvas} className="object-preview-canvas" data-testid="object-preview" /> : <div className="object-preview-unmounted">Preview disposed. Mount it again to continue.</div>}
          <div className="object-view-toolbar" role="toolbar" aria-label="Preview view controls">
            <ZoomControl value={zoom} onChange={changeZoom} min={PREVIEW_ZOOM.min} max={PREVIEW_ZOOM.max} step={PREVIEW_ZOOM.step} defaultValue={PREVIEW_ZOOM.default} reset onReset={resetView} disabled={!mounted || !!error} labels={{ group: 'Zoom', reset: 'Reset view' }}>
              <button type="button" className="zc-button" aria-label="Rotate left" title="Rotate left 90 degrees" disabled={!mounted || !!error} onClick={() => setDirection(value => (value + 270) % 360)}><ArrowLeft size={16} /></button><span className="object-view-direction" aria-label="Object direction">{direction}°</span><button type="button" className="zc-button" aria-label="Rotate right" title="Rotate right 90 degrees" disabled={!mounted || !!error} onClick={() => setDirection(value => (value + 90) % 360)}><ArrowRight size={16} /></button>
            </ZoomControl>
          </div>
        </div>
        {error && <p role="alert" className="object-notice">Preview unavailable: {error}. You can still use the settings and code below.</p>}<div className="object-preview-actions"><span role="status">{selected ? 'Object selected' : 'No selection'}</span><button disabled={!mounted || !!error} onClick={() => store.current?.select('catalog-object', 'keyboard')}>Select object</button><button disabled={!mounted || !!error} onClick={() => setMoved(value => !value)}>Move object</button><button onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount preview' : 'Mount preview'}</button></div></div>
      <aside className="object-settings"><h2>Make it yours</h2><p>Try the settings this definition supports.</p>
        {item.asset === 'building' && <BuildingDimensions key={resetVersion} size={buildingSize} onChange={setBuildingSize} />}
        {item.footprint && <SurfaceFootprint key={`${variant}:${resetVersion}`} definition={item.footprint} value={footprint ?? resolveFootprint({ variant: variant || undefined }, item.footprint)} onChange={setFootprint} />}
        {item.asset === 'building' && <label>Inspect interior<input aria-label="Building open" type="checkbox" checked={buildingOpen} onChange={event => setBuildingOpen(event.target.checked)} /><small>Example desk and tote load on opening.</small></label>}
        {item.asset === 'building' && <label>Cutaway style<select aria-label="Building cutaway" value={buildingCutaway} onChange={event => setBuildingCutaway(event.target.value as typeof buildingCutaway)}><option value="low-walls">Low walls</option><option value="front">Front cutaway</option></select><small>Front cutaway retains far walls when the interior is open.</small></label>}
        {item.color && <label>{item.colorLabel ?? 'Accent / body color'}<div className="object-color-input"><input aria-label="Object color" type="color" value={shownColor} onChange={event => { setColor(event.target.value); setColorTouched(true); }} /><code>{shownColor}</code></div></label>}
        {item.operatingProperty === 'fillLevel' && <label>Fill level<input aria-label="Fill level" type="range" min={0} max={1} step={.05} value={fillLevel} onChange={event => setFillLevel(Number(event.target.value))} /><small>{Math.round(fillLevel * 100)}% · zero is empty</small></label>}
        {item.operatingProperty && item.operatingProperty !== 'fillLevel' && <label>{item.operatingProperty === 'heatEnabled' ? 'Heat enabled' : 'Water running'}<input aria-label={item.operatingProperty === 'heatEnabled' ? 'Heat enabled' : 'Water running'} type="checkbox" checked={operationEnabled} onChange={event => setOperationEnabled(event.target.checked)} /></label>}
        {item.states && <label>State<select aria-label="Object state" value={effectiveState} onChange={event => setState(event.target.value as VisualState)}>{item.states.map(value => <option key={value} value={value}>{catalogStateLabel(item, value)}</option>)}</select></label>}
        {item.measurement && item.countDefinition && <label>Input<select aria-label="Gauge input mode" value={inputMode} onChange={event => { const mode = event.target.value as 'measurement' | 'count'; setInputMode(mode); if (mode === 'count' && !variant.endsWith('segmented')) setVariant('vertical-segmented'); }}><option value="measurement">Measured value</option><option value="count">Segment count</option></select></label>}
        {item.variants && <label>{item.asset === 'building' ? 'Building type' : 'Variant'}<select aria-label={item.asset === 'building' ? 'Building type' : 'Object variant'} value={variant} onChange={event => setVariant(event.target.value)}>{item.variants.filter(value => !(item.measurement && inputMode === 'count') || value.endsWith('segmented')).map(value => <option key={value} value={value}>{item.asset === 'building' ? BUILDING_TYPE_LABELS[value as BuildingType] : item.measurement ? measurementVariantLabels[value] ?? value : value}</option>)}</select></label>}
        {item.asset && isPersonAsset(item.asset) && <label>Figure<select aria-label="Person figure" value={figure} onChange={event => setFigure(event.target.value as PersonFigure)}>{PERSON_FIGURES.map(value => <option key={value} value={value}>{value === 'feminine' ? 'Feminine' : 'Masculine'}</option>)}</select><small>Feminine is a smaller, slimmer build with long hair.</small></label>}
        {item.asset && isPersonAsset(item.asset) && <label>Hair color<select aria-label="Person hair color" value={hair} onChange={event => setHair(event.target.value as PersonHairColor)}>{(Object.keys(PERSON_HAIR_COLORS) as PersonHairColor[]).map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select><small>Presets for materials.hair; any color works.</small></label>}
        {item.measurement && inputMode === 'measurement' && <ObjectMeasurementControls key={`${item.slug}:measurement:${resetVersion}`} measurement={measurement} onChange={setMeasurement} />}
        {display && <ObjectDisplayControls reading={display} onChange={setDisplay} />}
        {item.countDefinition && inputMode === 'count' && <ObjectCountControls key={`${item.slug}:${resetVersion}`} definition={item.countDefinition} count={count} multiplier={1} showMultiplier={false} onChange={nextCount => setCount(nextCount)} />}
        {item.asset && assetCountLayoutDefaults[item.asset] && <label>Count layout<select aria-label="Object count layout" value={countLayout} onChange={event => setCountLayout(event.target.value as CountLayout)}><option value="reserved">Reserve full capacity</option><option value="compact">Compact layout</option></select></label>}
        {labelSurface && <ObjectLabelControls key={`${item.slug}:label:${resetVersion}`} surface={labelSurface} onChange={setSurfaceLabel} />}
        <label>Environment<select aria-label="Preview environment" value={theme} onChange={event => setTheme(event.target.value as 'light' | 'midnight')}><option value="light">Light</option><option value="midnight">Midnight</option></select></label>
        {item.animation === 'local' && <label className="object-toggle">Animation<input aria-label="Object animation" type="checkbox" checked={motion} onChange={event => setMotion(event.target.checked)} /></label>}
        <button className="object-reset" onClick={() => { setFigure('masculine'); setHair('dark'); setBuildingOpen(false); setBuildingCutaway('low-walls'); setBuildingSize(BUILDING_SIZE); reset(); }}><RotateCcw size={14} />Reset settings</button>
      </aside></div>
      {item.animation === 'none' && <p className="object-preview-note">This is a static model. Position changes in this preview are applied directly.</p>}
      <p className="object-preview-note">The model is fitted automatically to the viewer. {item.countDefinition && 'Count fills the reserved capacity; existing parts keep their size. '}Environment changes the canvas, lighting and supported inherited material colors. The object contract below declares palette roles, fixed decoration, placement and anchors.</p>
    </>
    <div className="object-facts"><div><span>AVAILABILITY</span><strong>Built-in definition</strong></div><div><span>DEFINITION</span><code>{item.asset ?? item.primitive ?? 'Scene primitive'}</code></div><div><span>ANIMATION</span><strong>{item.animation === 'local' ? 'Optional local animation' : 'Static model · no animation'}</strong></div></div>
    <div className="object-detail-description"><h2>What this object supports</h2><p>{item.notes}</p>{labelSurface && <p>Text or self-contained SVG artwork attaches to this model: {labelSurface.description} Artwork follows its transform, stays static with motion disabled, and selects the owning node. Floating HTML labels and quantity meanings remain independent. SVG text alternatives are for the host UI and a decoding fallback; provide an accessible HTML record label.</p>}<div>{item.example && <Link href={item.example}>See it in a scene<ArrowUpRight size={14} /></Link>}<Link href={item.guide}>Read the API guide<ArrowUpRight size={14} /></Link></div></div>
    {item.asset && Object.hasOwn(assetDescriptors, item.asset) && <ObjectContract descriptor={assetDescriptors[item.asset]} />}
    {node?.kind === 'asset' && <ObjectMovement node={node} />}
    {item.asset && <ObjectCompatibility asset={item.asset} />}
    {node && <section className="object-usage"><h2>Use this definition</h2><p>Place it inside your own scene. These snippets use the implemented node contract.</p><div className="object-code-tabs" aria-label="Usage framework">{(['React', 'Vue', 'JavaScript'] as const).map(value => <button key={value} aria-pressed={framework === value} onClick={() => setFramework(value)}>{value}</button>)}</div><CodeBlock code={objectSnippet(node, framework)} language={framework === 'React' ? 'tsx' : framework === 'Vue' ? 'vue' : 'typescript'} /><p>Follow the <Link href="/docs/quickstart">quickstart</Link> for provider, container and store setup. The host owns records and commands. Dispose the renderer before the store; each factory currently owns its geometry and materials.</p></section>}
  </section>;
}

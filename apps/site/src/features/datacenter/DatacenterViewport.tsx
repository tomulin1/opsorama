'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Box, Building2, CheckCircle2, CircleAlert, Eye, EyeOff, Info, List, Maximize2, Minimize2, Network, Server, Settings2, Thermometer, X, Zap } from 'lucide-react';
import { DataPanel, EntityInspector, FieldList, ResourceList, StatusBadge, ValueMeter, ZoomControl } from '@opsorama/react/ui';
import { useRendererFps } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { datacenterDefinition, datacenterIncidents, datacenterInletLimit, datacenterRackLoadHistory, datacenterReading, datacenterRecords, datacenterRooms, datacenterState, type DatacenterScenario } from '../../../examples/datacenter-data';
import { HudMetrics, MetricSizeControl, useHudMetricSize, type HudMetric } from '../example-hud';
import '@opsorama/ui/styles.css';

export interface DatacenterViewportProps {
  /** The scene canvas, or null while it is preparing. Its identity stays stable for the life of the page. */
  scene: ReactNode;
  /** Live 3D copy of the inspected equipment, or null while the scene is preparing. */
  preview: ReactNode;
  ports: number; modules: number; motion: boolean; zoom: number;
  scenario: DatacenterScenario; room: string; rackPage: number; selected: string | null; error: string | null;
  rendererRef: RefObject<SceneRenderer | null>;
  onPortsChange(value: number): void; onModulesChange(value: number): void; onMotionChange(value: boolean): void;
  onZoomChange(value: number): void; onZoomReset(): void;
  onScenarioChange(value: DatacenterScenario): void; onFocusRoom(id: string): void; onResetView(): void; onRackPageChange(page: number): void; onSelect(id: string): void;
}

const rackHealth = (state: ReturnType<typeof datacenterState>) => state === 'normal' ? { label: 'Healthy', tone: 'success' } as const : state === 'critical' ? { label: 'Critical', tone: 'critical' } as const : { label: 'Warning', tone: 'warning' } as const;

/** Owns the FPS sample so its once-per-second update re-renders only the zoom bar, not the whole HUD. */
function DatacenterZoom({ zoom, error, rendererRef, onZoomChange, onZoomReset }: DatacenterViewportProps) {
  // Shared sampler: reads completed renderer frames, no second animation loop.
  const fps = useRendererFps(rendererRef, !error);
  return <ZoomControl className="hud-zoom" value={zoom} onChange={onZoomChange} step={.2} reset onReset={onZoomReset} disabled={!!error} caption="Zoom" fps={fps} labels={{ group: 'Camera zoom' }} />;
}

/** Host-owned HUD composition over one scene. Shared panels own presentation; fixture data and commands stay here. */
export function DatacenterViewport(props: DatacenterViewportProps) {
  const { scene, ports, modules, motion, scenario, room, rackPage, selected } = props;
  const [leftPanel, setLeftPanel] = useState<'racks' | 'controls' | 'about' | null>(null);
  const [sidePanel, setSidePanel] = useState<'alerts' | 'inspector' | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  useEffect(() => { if (selected) { setSidePanel('inspector'); setPanelsVisible(true); setLeftPanel(null); } }, [selected]);
  // Escape leaves expanded view wherever focus is, including after a click on the canvas.
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', exit); return () => document.removeEventListener('keydown', exit);
  }, [expanded]);
  const onSelect = (id: string) => { setLeftPanel(null); setSidePanel('inspector'); setPanelsVisible(true); props.onSelect(id); };
  const incidents = scenario === 'incident' ? datacenterIncidents : [];
  const activeIncident = incidents.find(incident => incident.nodeId === selected || `alert-${incident.id}` === selected);
  const record = datacenterRecords.find(record => record.id === (activeIncident?.nodeId ?? selected));
  const reading = record ? datacenterReading(record, scenario) : undefined;
  const selectedNode = datacenterDefinition.nodes.find(node => node.id === selected);
  const name = record?.name ?? selectedNode?.label;
  const selectedRoom = datacenterRooms.find(room => room.id === selected);
  const roomDetails = datacenterRooms.find(value => value.id === room);
  const tableRecords = roomDetails?.kind === 'hall' ? datacenterRecords.filter(record => record.roomId === room) : datacenterRecords;
  const pageRecords = tableRecords.slice(rackPage * 8, rackPage * 8 + 8);
  const peakInlet = Math.max(...datacenterRecords.map(record => datacenterReading(record, scenario).inlet));
  const inletMargin = peakInlet - datacenterInletLimit, inletTone = inletMargin > 0 ? 'critical' : 'success';
  const rackLoad = datacenterRecords.reduce((sum, rack) => sum + rack.power, 0);
  const meanCpu = datacenterRecords.reduce((sum, rack) => sum + rack.load, 0) / datacenterRecords.length;
  const peakRack = datacenterRecords.find(record => datacenterReading(record, scenario).inlet === peakInlet)!;
  const peakInspected = sidePanel === 'inspector' && selected === peakRack.id;
  const metrics: readonly HudMetric[] = [
    { id: 'cpu', title: 'Facility CPU', value: meanCpu, formatValue: value => Number(value).toFixed(0), unit: '%', tone: 'info', visual: { kind: 'capacity', max: 100 }, comparison: `${datacenterRecords.length} racks across four halls`, action: { label: 'Open rack overview for CPU', onActivate: () => toggleLeft('racks'), pressed: leftPanel === 'racks' }, icon: <Server size={16} /> },
    { id: 'load', title: 'Rack load', value: rackLoad, formatValue: value => Number(value).toFixed(1), unit: 'kW', tone: 'info', visual: { kind: 'trend', points: datacenterRackLoadHistory(rackLoad), label: 'Mock rack load over the last 60 minutes' }, comparison: 'Mock readings', action: { label: 'Open rack overview for power', onActivate: () => toggleLeft('racks'), pressed: leftPanel === 'racks' }, icon: <Zap size={16} /> },
    { id: 'inlet', title: 'Peak inlet', value: peakInlet, formatValue: value => Number(value).toFixed(1), unit: '°C', tone: inletTone, delta: { label: `${Math.abs(inletMargin).toFixed(1)} °C ${inletMargin > 0 ? 'over' : 'under'} limit`, direction: inletMargin > 0 ? 'up' : 'down', tone: inletTone }, comparison: scenario === 'incident' ? 'Inlet alert active' : 'Recovered snapshot', action: { label: 'Inspect the rack with the peak inlet', onActivate: () => { if (peakInspected) setSidePanel(null); else onSelect(peakRack.id); }, pressed: peakInspected }, icon: <Thermometer size={16} /> },
    { id: 'alerts', title: 'Open alerts', value: incidents.length, tone: incidents.length ? 'critical' : 'success', comparison: incidents.length ? '1 critical · 2 warning' : 'All recovered', action: { label: 'Open alert queue', onActivate: () => toggleAlerts(), pressed: sidePanel === 'alerts' }, icon: incidents.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} /> },
  ];
  const toggleLeft = (panel: NonNullable<typeof leftPanel>) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); };
  const toggleAlerts = () => { setPanelsVisible(true); setLeftPanel(null); setSidePanel(value => value === 'alerts' ? null : 'alerts'); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const sideHeader = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'alerts'} onClick={() => setSidePanel('alerts')}>Alerts <StatusBadge label={String(incidents.length)} tone={incidents.length ? 'warning' : 'success'} /></button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;
  const selectedTone = activeIncident?.severity ?? (record ? rackHealth(datacenterState(record.id, scenario)).tone : 'info');
  const inspectorHeader = <div>{sideHeader}{name && <div className="dc-equipment"><span className="hud-symbol dp-tone" data-tone={selectedTone}>{record ? <Server size={26} /> : <Box size={26} />}</span><div><h2 className="dc-equipment-name">{name}</h2><p className="dc-equipment-context">{record ? `${datacenterRooms.find(room => room.id === record.roomId)?.name} · ${record.role}` : selectedRoom?.purpose ?? 'Shared catalog equipment'}</p></div></div>}</div>;

  return <section className="datacenter-example dc-viewport hud-viewport" aria-label="Datacenter operations" data-expanded={expanded} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-metric-size={metricSize}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface">{scene}</div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Facility navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Building2 size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 12 / DATACENTER</span><h1>Datacenter operations</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="dc-room">Explore</label><select id="dc-room" aria-label="Focus room" value={room} onChange={event => props.onFocusRoom(event.target.value)}><option value="overview">Whole facility</option><optgroup label="IT halls">{datacenterRooms.filter(room => room.kind === 'hall').map(room => <option key={room.id} value={room.id}>{room.name} · 32 racks</option>)}</optgroup><optgroup label="Support rooms">{datacenterRooms.filter(room => room.kind !== 'hall').map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</optgroup><option value="plant-yard">Outdoor plant yard</option></select><button type="button" onClick={props.onResetView}>Reset view</button></div>
        <p className="hud-navigation-note">{roomDetails ? `${roomDetails.size[0]} × ${roomDetails.size[1]} m · ${roomDetails.purpose}` : room === 'plant-yard' ? 'Outdoor standby generation and cooling' : 'Four IT halls · 14 rooms · mock operational data'}</p>
      </DataPanel>
      <HudMetrics label="Facility metrics" size={metricSize} metrics={metrics} />
    </div>}

    {panelsVisible && sidePanel === 'alerts' && <ResourceList className="hud-side-panel dc-alerts-panel" label="Incident queue" density="compact" selectedId={activeIncident?.id} onSelect={id => { const incident = incidents.find(incident => incident.id === id); if (incident) onSelect(incident.nodeId); }} items={incidents.map(incident => ({ id: incident.id, label: <span className="dc-incident-label"><span className="hud-symbol dp-tone" data-tone={incident.severity}>{incident.severity === 'critical' ? <CircleAlert size={24} /> : <AlertTriangle size={24} />}</span>{incident.title}</span>, description: <span className="dc-incident-description"><span>Hall 01 / {datacenterRecords.find(record => record.id === incident.nodeId)?.name}</span><span className="hud-reading dp-tone" data-tone={incident.severity}>{incident.reading}</span></span>, status: incident.severity === 'critical' ? 'Critical' : 'Warning', tone: incident.severity }))} slots={{ header: sideHeader, footer: <div className="dc-scenario" aria-label="Mock scenario"><button type="button" aria-pressed={scenario === 'incident'} onClick={() => props.onScenarioChange('incident')}>Incident snapshot</button><button type="button" aria-pressed={scenario === 'recovered'} onClick={() => props.onScenarioChange('recovered')}>Recovered snapshot</button></div> }} freshness={{ label: 'Mock snapshots · no live monitoring', state: 'unknown' }}>
      {!incidents.length && <div className="dc-recovered"><span className="hud-symbol dp-tone" data-tone="success"><CheckCircle2 size={38} /></span><strong>All three alerts cleared</strong><p>Inlet 24.2 °C, uplink loss 0.02%, both host PSUs online in this fixture.</p></div>}
    </ResourceList>}

    {panelsVisible && sidePanel === 'inspector' && <EntityInspector className="hud-side-panel dc-inspector" label="Equipment inspector" density="compact" description={record ? `${datacenterRooms.find(room => room.id === record.roomId)?.name} · ${record.role}` : selectedRoom?.purpose} fields={reading ? [{ id: 'inlet', label: 'Inlet', value: <span className="hud-reading dp-tone" data-tone={reading.inlet > datacenterInletLimit ? 'critical' : 'neutral'}>{reading.inlet.toFixed(1)} °C</span> }, { id: 'power', label: 'Rack power', value: `${reading.power.toFixed(1)} kW` }] : selectedRoom ? [{ id: 'size', label: 'Room footprint', value: `${selectedRoom.size[0]} × ${selectedRoom.size[1]} m` }] : []} slots={{ header: inspectorHeader, footer: name ? <Link className="dc-model-link" href={`/docs/objects/${record?.asset ?? (selectedNode?.kind === 'asset' ? selectedNode.asset : 'equipment-cabinet')}`}>Shared model details <ArrowUpRight size={13} /></Link> : undefined }}>
      {props.preview}
      <p className="dc-selection" role="status">Selected: {name ?? 'none'}</p>
      {name ? <>{reading && <ValueMeter label="Mean host CPU" value={reading.load} max={100} unit="%" />}{activeIncident ? <div className="dc-inspector-incident dp-tone" data-tone={activeIncident.severity}><StatusBadge label={activeIncident.title} tone={activeIncident.severity} /><p>{activeIncident.detail}</p><h3>Suggested investigation</h3><p>{activeIncident.nextStep}</p></div> : <p className="dc-healthy"><span className="hud-symbol dp-tone" data-tone="success"><CheckCircle2 size={18} /></span>No open fixture alert for this equipment.</p>}</> : <div className="dc-empty-inspector"><span className="hud-symbol dp-tone" data-tone="info"><Network size={34} /></span><h2>Follow an alert to its rack</h2><p>Select equipment, a room or an alert to inspect its readings.</p></div>}
    </EntityInspector>}

    {panelsVisible && leftPanel === 'racks' && <DataPanel className="hud-floating-panel dc-racks" title="Rack overview" label="Rack readings" description={`${tableRecords.length} fixture records · ${roomDetails?.kind === 'hall' ? roomDetails.name : 'all halls'}`} density="compact" slots={{ icon: <List size={16} />, actions: closeLeft, footer: <div className="dc-pagination"><button type="button" disabled={rackPage === 0} onClick={() => props.onRackPageChange(rackPage - 1)}>Previous racks</button><span>{rackPage * 8 + 1}–{Math.min((rackPage + 1) * 8, tableRecords.length)} of {tableRecords.length}</span><button type="button" disabled={(rackPage + 1) * 8 >= tableRecords.length} onClick={() => props.onRackPageChange(rackPage + 1)}>Next racks</button></div> }}>
      <div className="dc-table-scroll"><table><thead><tr><th>Rack / workload</th><th>Health</th><th>Inlet</th><th>Power</th><th>CPU</th></tr></thead><tbody>{pageRecords.map(record => { const value = datacenterReading(record, scenario), health = rackHealth(datacenterState(record.id, scenario)); return <tr key={record.id} data-selected={selected === record.id}><td><div className="dc-rack-cell"><span className="hud-symbol dp-tone" data-tone={health.tone}><Server size={16} /></span><div><button type="button" aria-pressed={selected === record.id} onClick={() => onSelect(record.id)}>{record.name}</button><small>{datacenterRooms.find(room => room.id === record.roomId)?.name} · {record.role}</small></div></div></td><td><StatusBadge label={health.label} tone={health.tone} /></td><td><span className="hud-reading dp-tone" data-tone={value.inlet > datacenterInletLimit ? 'critical' : 'neutral'}>{value.inlet.toFixed(1)} °C</span></td><td>{value.power.toFixed(1)} kW</td><td><span className="dc-cpu"><span className="dc-cpu-bar" aria-hidden="true"><span style={{ width: `${value.load}%` }} /></span>{value.load}%</span></td></tr>; })}</tbody></table></div>
    </DataPanel>}

    {panelsVisible && leftPanel === 'controls' && <DataPanel className="hud-floating-panel dc-controls-panel" title="Equipment controls" label="Equipment controls" density="compact" slots={{ icon: <Settings2 size={16} />, actions: closeLeft, footer: 'Counts represent connected plugs and installed modules.' }}>
      <div className="datacenter-controls"><label>Switch A ports <input aria-label="Connected ports" type="range" min={0} max={24} value={ports} onChange={event => props.onPortsChange(Number(event.target.value))} /><output>{ports} / 24</output></label><label>UPS A modules <input aria-label="Battery modules" type="range" min={0} max={6} value={modules} onChange={event => props.onModulesChange(Number(event.target.value))} /><output>{modules} / 6</output></label></div>
      <div className="datacenter-records" aria-label="Individual equipment">{datacenterDefinition.nodes.filter(node => ['server-a', 'server-b', 'switch', 'cooling', 'ups', 'ups-b', 'generator-1', 'chiller-1', 'electrical-a-gear-0', 'battery-room-a-bank-0'].includes(node.id)).map(node => <button type="button" key={node.id} aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>{node.label}</button>)}</div>
    </DataPanel>}

    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel dc-about" title="Facility information" label="Facility information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft, footer: <div className="dc-document-links"><Link href="/docs/data-panels">Panel components <ArrowUpRight size={12} /></Link><Link href="/docs/objects/generator-set">Facility assets <ArrowUpRight size={12} /></Link></div> }}>
      <FieldList fields={[{ id: 'site', label: 'Site', value: '106 × 90 m' }, { id: 'building', label: 'Building', value: '68 × 48 m · 3,264 m² gross' }, { id: 'halls', label: 'IT hall footprints', value: '4 × 360 m² · 128 rack records' }, { id: 'support', label: 'Support spaces', value: '10 rooms + outdoor plant' }]} />
      <p className="hud-concept-note">Original research-informed concept with mock readings and alerts. Dimensions, clearance and plant capacity are illustrative; no Tier or code certification is claimed. Fan motion and activity LEDs are decorative.</p>
      <div className="dc-legend" aria-label="Scene legend"><StatusBadge label="Cold intake aisle" tone="info" /><StatusBadge label="Warm exhaust / service" tone="warning" /><StatusBadge label="Critical" tone="critical" /></div>
    </DataPanel>}

    <div className="hud-viewport-controls">
    <DatacenterZoom {...props} />
    <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
      <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'racks' && panelsVisible} onClick={() => toggleLeft('racks')}><List size={14} />Racks</button><button type="button" aria-pressed={leftPanel === 'controls' && panelsVisible} onClick={() => toggleLeft('controls')}><Settings2 size={14} />Controls</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'alerts' && panelsVisible} onClick={toggleAlerts}><AlertTriangle size={14} />Alerts</button></div>
      <MetricSizeControl size={metricSize} onChange={setMetricSize} />
      <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Equipment motion" type="checkbox" checked={motion} onChange={event => props.onMotionChange(event.target.checked)} /></label>
      <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select equipment</span></div>
    </DataPanel>
    </div>
  </section>;
}

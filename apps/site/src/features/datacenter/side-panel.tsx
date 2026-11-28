import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Box, CheckCircle2, CircleAlert, Network, Server, X } from 'lucide-react';
import { EntityInspector, ResourceList, StatusBadge, ValueMeter } from '@opsorama/react/ui';
import { datacenterDefinition, datacenterIncidents, datacenterInletLimit, datacenterReading, datacenterRecords, datacenterRooms, datacenterState, type DatacenterScenario } from '../../../examples/datacenter-data';

export const rackHealth = (state: ReturnType<typeof datacenterState>) => state === 'normal' ? { label: 'Healthy', tone: 'success' } as const : state === 'critical' ? { label: 'Critical', tone: 'critical' } as const : { label: 'Warning', tone: 'warning' } as const;

export type DatacenterSidePanelId = 'alerts' | 'inspector';

/**
 * The right-hand panel: the incident queue or the equipment inspector, with tabs between them and a close button. The
 * queue's footer switches the mock snapshot when the host passes `onScenarioChange`.
 */
export function DatacenterSidePanel({ scenario, panel, selected, preview, onPanel, onSelect, onScenarioChange }: {
  scenario: DatacenterScenario; panel: DatacenterSidePanelId; selected: string | null; preview: ReactNode;
  onPanel(panel: DatacenterSidePanelId | null): void; onSelect(id: string): void; onScenarioChange?(scenario: DatacenterScenario): void;
}) {
  const incidents = scenario === 'incident' ? datacenterIncidents : [];
  const activeIncident = incidents.find(incident => incident.nodeId === selected || `alert-${incident.id}` === selected);
  const record = datacenterRecords.find(record => record.id === (activeIncident?.nodeId ?? selected));
  const reading = record ? datacenterReading(record, scenario) : undefined;
  const selectedNode = datacenterDefinition.nodes.find(node => node.id === selected);
  const name = record?.name ?? selectedNode?.label;
  const selectedRoom = datacenterRooms.find(room => room.id === selected);
  const sideHeader = <div className="hud-side-tabs"><button type="button" aria-pressed={panel === 'alerts'} onClick={() => onPanel('alerts')}>Alerts <StatusBadge label={String(incidents.length)} tone={incidents.length ? 'warning' : 'success'} /></button><button type="button" aria-pressed={panel === 'inspector'} onClick={() => onPanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => onPanel(null)}><X size={15} /></button></div>;
  const selectedTone = activeIncident?.severity ?? (record ? rackHealth(datacenterState(record.id, scenario)).tone : 'info');
  const inspectorHeader = <div>{sideHeader}{name && <div className="dc-equipment"><span className="hud-symbol dp-tone" data-tone={selectedTone}>{record ? <Server size={26} /> : <Box size={26} />}</span><div><h2 className="dc-equipment-name">{name}</h2><p className="dc-equipment-context">{record ? `${datacenterRooms.find(room => room.id === record.roomId)?.name} · ${record.role}` : selectedRoom?.purpose ?? 'Shared catalog equipment'}</p></div></div>}</div>;

  return panel === 'alerts'
    ? <ResourceList className="hud-side-panel dc-alerts-panel" label="Incident queue" density="compact" selectedId={activeIncident?.id} onSelect={id => { const incident = incidents.find(incident => incident.id === id); if (incident) onSelect(incident.nodeId); }} items={incidents.map(incident => ({ id: incident.id, label: <span className="dc-incident-label"><span className="hud-symbol dp-tone" data-tone={incident.severity}>{incident.severity === 'critical' ? <CircleAlert size={24} /> : <AlertTriangle size={24} />}</span>{incident.title}</span>, description: <span className="dc-incident-description"><span>Hall 01 / {datacenterRecords.find(record => record.id === incident.nodeId)?.name}</span><span className="hud-reading dp-tone" data-tone={incident.severity}>{incident.reading}</span></span>, status: incident.severity === 'critical' ? 'Critical' : 'Warning', tone: incident.severity }))} slots={{ header: sideHeader, footer: onScenarioChange && <div className="dc-scenario" aria-label="Mock scenario"><button type="button" aria-pressed={scenario === 'incident'} onClick={() => onScenarioChange?.('incident')}>Incident snapshot</button><button type="button" aria-pressed={scenario === 'recovered'} onClick={() => onScenarioChange?.('recovered')}>Recovered snapshot</button></div> }} freshness={{ label: 'Mock snapshots · no live monitoring', state: 'unknown' }}>
      {!incidents.length && <div className="dc-recovered"><span className="hud-symbol dp-tone" data-tone="success"><CheckCircle2 size={38} /></span><strong>All three alerts cleared</strong><p>Inlet 24.2 °C, uplink loss 0.02%, both host PSUs online in this fixture.</p></div>}
    </ResourceList>
    : <EntityInspector className="hud-side-panel dc-inspector" label="Equipment inspector" density="compact" description={record ? `${datacenterRooms.find(room => room.id === record.roomId)?.name} · ${record.role}` : selectedRoom?.purpose} fields={reading ? [{ id: 'inlet', label: 'Inlet', value: <span className="hud-reading dp-tone" data-tone={reading.inlet > datacenterInletLimit ? 'critical' : 'neutral'}>{reading.inlet.toFixed(1)} °C</span> }, { id: 'power', label: 'Rack power', value: `${reading.power.toFixed(1)} kW` }] : selectedRoom ? [{ id: 'size', label: 'Room footprint', value: `${selectedRoom.size[0]} × ${selectedRoom.size[1]} m` }] : []} slots={{ header: inspectorHeader, footer: name ? <Link className="dc-model-link" href={`/docs/objects/${record?.asset ?? (selectedNode?.kind === 'asset' ? selectedNode.asset : 'equipment-cabinet')}`}>Shared model details <ArrowUpRight size={13} /></Link> : undefined }}>
      {preview}
      <p className="dc-selection" role="status">Selected: {name ?? 'none'}</p>
      {name ? <>{reading && <ValueMeter label="Mean host CPU" value={reading.load} max={100} unit="%" />}{activeIncident ? <div className="dc-inspector-incident dp-tone" data-tone={activeIncident.severity}><StatusBadge label={activeIncident.title} tone={activeIncident.severity} /><p>{activeIncident.detail}</p><h3>Suggested investigation</h3><p>{activeIncident.nextStep}</p></div> : <p className="dc-healthy"><span className="hud-symbol dp-tone" data-tone="success"><CheckCircle2 size={18} /></span>No open fixture alert for this equipment.</p>}</> : <div className="dc-empty-inspector"><span className="hud-symbol dp-tone" data-tone="info"><Network size={34} /></span><h2>Follow an alert to its rack</h2><p>Select equipment, a room or an alert to inspect its readings.</p></div>}
    </EntityInspector>;
}

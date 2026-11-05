import { createSceneStore, type MarkerIcon, type MarkerNode, type SceneDefinition, type SceneStore, type VisualState } from '@opsorama/core';
import { createFacilityNodes, datacenterRooms } from './datacenter-facility';
export { datacenterRooms } from './datacenter-facility';

export type DatacenterScenario = 'incident' | 'recovered';
export interface DatacenterRecord {
  id: string; name: string; role: string; asset: string; inlet: number; power: number; load: number; roomId: string; mountedUnits: number;
}
/** Fictional host records. Layout, visual parts and alerts are mapped separately below. */
const legacyRecords = [
  { id: 'rack', name: 'Rack A01', role: 'Application compute', asset: 'equipment-cabinet', inlet: 23.4, power: 3.2, load: 58 },
  { id: 'rack-a02', name: 'Rack A02', role: 'Database cluster', asset: 'equipment-cabinet', inlet: 34.8, power: 6.8, load: 89 },
  { id: 'rack-a03', name: 'Rack A03', role: 'Storage cluster', asset: 'equipment-cabinet', inlet: 24.1, power: 4.6, load: 64 },
  { id: 'rack-a04', name: 'Rack A04', role: 'Edge networking', asset: 'equipment-cabinet', inlet: 23.8, power: 2.9, load: 42 },
  { id: 'rack-b01', name: 'Rack B01', role: 'Application compute', asset: 'equipment-cabinet', inlet: 22.6, power: 4.4, load: 67 },
  { id: 'rack-b02', name: 'Rack B02', role: 'Virtualization hosts', asset: 'equipment-cabinet', inlet: 24.5, power: 5.7, load: 76 },
  { id: 'rack-b03', name: 'Rack B03', role: 'Backup compute', asset: 'equipment-cabinet', inlet: 23.2, power: 3.9, load: 53 },
  { id: 'rack-b04', name: 'Rack B04', role: 'Storage replication', asset: 'equipment-cabinet', inlet: 22.8, power: 4.1, load: 61 },
];
const legacySlots = [0, 1, 2, 3, 8, 9, 10, 11];
export const datacenterRecords: readonly DatacenterRecord[] = datacenterRooms.filter(room => room.kind === 'hall').flatMap((room, hall) => Array.from({ length: 32 }, (_, slot) => {
  const legacy = room.id === 'hall-01' ? legacySlots.indexOf(slot) : -1;
  if (legacy >= 0) return { ...legacyRecords[legacy], roomId: room.id, mountedUnits: [8, 10, 12, 8, 10, 12, 8, 10][legacy] };
  return { id: `rack-h${hall + 1}-${slot + 1}`, name: `Rack ${String.fromCharCode(65 + Math.floor(slot / 8))}${String(slot % 8 + 1).padStart(2, '0')}`, role: ['Application compute', 'Storage cluster', 'Virtualization hosts', 'Database replicas'][Math.floor(slot / 8)], asset: 'equipment-cabinet', inlet: 22 + (slot * 7 + hall * 3) % 26 / 10, power: 3.4 + (slot * 3 + hall * 7) % 30 / 10, load: 42 + (slot * 11 + hall * 5) % 43, roomId: room.id, mountedUnits: 8 };
}));
/** Fixture inlet policy in °C, as quoted by the thermal incident. */
export const datacenterInletLimit = 30;
/** Mock rack load samples in kW, oldest first over 60 minutes, ending at the supplied current total. */
export const datacenterRackLoadHistory = (current: number): number[] => [.94, .95, .93, .96, .97, .95, .98, .97, .99, .98, 1].map(share => current * share);
export interface DatacenterIncident {
  id: string; nodeId: string; severity: 'warning' | 'critical'; title: string; reading: string; detail: string; nextStep: string;
}
/** Example policies only. Thresholds are host choices, not universal equipment limits. */
export const datacenterIncidents: readonly DatacenterIncident[] = [
  { id: 'thermal', nodeId: 'rack-a02', severity: 'critical', title: 'High inlet temperature', reading: '34.8 °C · policy > 30 °C', detail: 'Upper rack inlet sensor exceeds the fixture threshold. The database hosts remain online.', nextStep: 'Inspect the inlet obstruction and cooling path; verify the sensor before changing cooling settings.' },
  { id: 'network', nodeId: 'rack-a04', severity: 'warning', title: 'Uplink packet loss', reading: '2.4% loss · policy > 1%', detail: 'The primary uplink has intermittent loss. The secondary uplink remains available.', nextStep: 'Inspect interface counters, patch cable and transceiver; correlate with the upstream switch.' },
  { id: 'power', nodeId: 'rack-b03', severity: 'warning', title: 'PSU redundancy lost', reading: 'PSU 2 failed · PSU 1 online', detail: 'A backup host is running on its remaining power supply. This is a device fault, not a UPS outage.', nextStep: 'Check the host PSU and its feed, then schedule replacement under the host maintenance policy.' },
];

const facilityNodes = createFacilityNodes(datacenterRecords);

/** Icon for each incident's kind of problem. */
const ALERT_ICONS: Readonly<Record<string, MarkerIcon>> = { thermal: 'thermometer', network: 'network', power: 'plug' };
/** Each incident is a severity pin on its rack's `top` anchor. Its card shows severity, title and reading. */
function alertNodes(): MarkerNode[] {
  return datacenterIncidents.map(incident => ({ id: `alert-${incident.id}`, entityId: incident.id, kind: 'marker', attachment: { nodeId: incident.nodeId, anchor: 'top' }, state: incident.severity,
    icon: ALERT_ICONS[incident.id] ?? 'alert', eyebrow: incident.severity === 'critical' ? 'Critical' : 'Warning', label: incident.title, detail: incident.reading, selectable: true }));
}
export function datacenterState(id: string, scenario: DatacenterScenario): VisualState {
  return scenario === 'incident' ? datacenterIncidents.find(incident => incident.nodeId === id)?.severity ?? 'normal' : 'normal';
}
export function datacenterReading(record: DatacenterRecord, scenario: DatacenterScenario) {
  return { ...record, inlet: record.id === 'rack-a02' && scenario === 'recovered' ? 24.2 : record.inlet };
}
export const datacenterDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  ...facilityNodes.map(node => ({ ...node, state: node.id === 'hall-01' ? 'critical' as const : datacenterState(node.id, 'incident') })), ...alertNodes(),
] };
export const makeDatacenterStore = () => createSceneStore(datacenterDefinition, {
  shadows: false, zoom: 1.05, palette: { surface: '#46566a', structure: '#202f40', trim: '#9baebf', accent: '#4daac3', normal: '#54c7aa', screen: '#111f2d' },
});
export function updateDatacenter(store: SceneStore, ports: number, modules: number, motion: boolean) {
  for (const [id, count] of [['switch', ports], ['ups', modules]] as const) {
    const node = store.getSnapshot().nodes.find(node => node.id === id);
    if (node?.kind === 'asset' && node.count !== count) store.upsert({ ...node, count });
  }
  store.configure({ motion });
}
export function setDatacenterScenario(store: SceneStore, scenario: DatacenterScenario) {
  const rackIds = new Set(datacenterRecords.map(record => record.id));
  store.replace([
    ...store.getSnapshot().nodes.filter(node => !node.id.startsWith('alert-')).map(node => rackIds.has(node.id) || node.id === 'hall-01' ? { ...node, state: node.id === 'hall-01' && scenario === 'incident' ? 'critical' as const : datacenterState(node.id, scenario) } : node),
    ...(scenario === 'incident' ? alertNodes() : []),
  ]);
}
export function datacenterRoomForNode(id: string): string | null {
  if (id === 'plant-yard' || id.startsWith('generator-') || id.startsWith('chiller-')) return 'plant-yard';
  if (datacenterRooms.some(room => room.id === id)) return id;
  return datacenterDefinition.nodes.find(node => node.id === id)?.parentId ?? null;
}
/** Focused room: every room stays open, and only the focused room's cabinets use the detailed model. Throws on an unknown room; `overview` and `plant-yard` detail none. */
export function setDatacenterRoom(store: SceneStore, roomId: string) {
  if (roomId !== 'overview' && roomId !== 'plant-yard' && !datacenterRooms.some(room => room.id === roomId)) throw new Error(`Unknown datacenter room: ${roomId}.`);
  store.replace(store.getSnapshot().nodes.map(node => node.kind === 'asset' && node.asset === 'equipment-cabinet' ? { ...node, variant: node.parentId === roomId ? 'detailed' : 'overview' } : node));
}

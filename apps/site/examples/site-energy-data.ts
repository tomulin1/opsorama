import { createSceneStore, type SceneDefinition, type SceneStore, type VisualState } from '@opsorama/core';

/** Object composition fixture; positions are illustrative. No production, energy or security records are inferred. */
export const siteEnergyDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'ground', kind: 'ground', size: [28, 18] },
  { id: 'cnc', kind: 'asset', asset: 'machine-tool', position: [-9, 0, -3.5], label: 'Machine tool', selectable: true },
  { id: 'arm', kind: 'asset', asset: 'robot-arm', variant: 'reach', position: [-6.2, 0, -3.2], rotation: [0, -Math.PI / 2, 0], label: 'Robot arm', selectable: true },
  { id: 'amr', kind: 'asset', asset: 'mobile-robot', variant: 'tote', position: [-6.5, 0, .5], rotation: [0, Math.PI / 2, 0], label: 'Mobile robot', selectable: true },
  { id: 'cones', kind: 'asset', asset: 'traffic-cone', count: 4, position: [-7, 0, 3.5], label: 'Traffic cones · 4', selectable: true },
  { id: 'camera', kind: 'asset', asset: 'security-camera', variant: 'pole', position: [-12, 0, 5], rotation: [0, Math.PI * .75, 0], label: 'Security camera', selectable: true },
  { id: 'solar', kind: 'asset', asset: 'solar-array', count: 6, position: [3, 0, -5], label: 'Solar array · 6 modules', selectable: true },
  { id: 'turbine', kind: 'asset', asset: 'wind-turbine', position: [10.5, 0, -6], label: 'Wind turbine', selectable: true },
  { id: 'charger-1', kind: 'asset', asset: 'ev-charger', position: [-1.5, 0, 3], label: 'EV charger 1', selectable: true },
  { id: 'charger-2', kind: 'asset', asset: 'ev-charger', position: [1.5, 0, 3], label: 'EV charger 2', selectable: true },
  { id: 'tank', kind: 'asset', asset: 'storage-tank', position: [8, 0, 1.5], label: 'Storage tank', selectable: true },
  { id: 'pump', kind: 'asset', asset: 'pump-unit', position: [8, 0, 4.2], rotation: [0, Math.PI / 2, 0], label: 'Pump unit', selectable: true },
  { id: 'fence-1', kind: 'asset', asset: 'fence-segment', position: [-1.5, 0, -8], selectable: false },
  { id: 'fence-gate', kind: 'asset', asset: 'fence-segment', variant: 'gate', position: [1.5, 0, -8], label: 'Fence gate', selectable: true },
  { id: 'fence-2', kind: 'asset', asset: 'fence-segment', position: [4.5, 0, -8], selectable: false },
  { id: 'fence-3', kind: 'asset', asset: 'fence-segment', position: [7.5, 0, -8], selectable: false },
  { id: 'bin-general', kind: 'asset', asset: 'waste-bin', variant: 'general', position: [-3.4, 0, 6.5], label: 'Waste bins', selectable: true },
  { id: 'bin-recycling', kind: 'asset', asset: 'waste-bin', variant: 'recycling', position: [-2.6, 0, 6.5], selectable: false },
  { id: 'bin-organic', kind: 'asset', asset: 'waste-bin', variant: 'organic', position: [-1.8, 0, 6.5], selectable: false },
] };
export const makeSiteEnergyStore = () => createSceneStore(siteEnergyDefinition, { shadows: false, zoom: 1.2 });
export interface SiteEnergySession { store: SceneStore; dispose(): void; }
export interface SiteEnergyOptions { midnight: boolean; chargerFault: boolean; turbineStopped: boolean; }
/** Host-owned charger health and explicit turbine motion are fixture toggles, not monitored telemetry. */
export function updateSiteEnergy(store: SceneStore, options: SiteEnergyOptions) {
  const set = (id: string, state: VisualState | undefined) => { const node = store.getSnapshot().nodes.find(item => item.id === id); if (node?.kind === 'asset' && node.state !== state) store.upsert({ ...node, state }); };
  set('charger-1', options.chargerFault ? 'critical' : undefined);
  const turbine = store.getSnapshot().nodes.find(node => node.id === 'turbine');
  if (turbine?.kind === 'asset' && turbine.localMotion !== !options.turbineStopped) store.upsert({ ...turbine, localMotion: !options.turbineStopped });
  store.configure({ theme: options.midnight ? 'midnight' : 'light' });
}

import { createSceneStore, personHairColor, type SceneDefinition, type SceneNode, type SceneStore } from '@opsorama/core';

const zone = (id: string, label: string, center: readonly [number, number], size: readonly [number, number], color: string): SceneNode => ({ id, kind: 'zone', label, position: [center[0], .02, center[1]], size, color });
const asset = (id: string, type: string, position: readonly [number, number], label?: string, extra: Partial<Extract<SceneNode, { kind: 'asset' }>> = {}): SceneNode =>
  ({ id, kind: 'asset', asset: type, position: [position[0], 0, position[1]], ...(label ? { label, selectable: true } : { selectable: false }), ...extra });

/** An unlabelled, unselectable person with a stable preset hair color. */
const person = (id: string, type: string, position: readonly [number, number], extra: Partial<Extract<SceneNode, { kind: 'asset' }>> = {}): SceneNode =>
  asset(id, type, position, undefined, { materials: { hair: personHairColor(id) }, ...extra });

/** Five illustrative domain areas built from shared models; no flight, patient, crop, production or event records are inferred. */
export const domainKitsDefinition: SceneDefinition = { schemaVersion: 1, nodes: [
  { id: 'ground', kind: 'ground', size: [62, 38] },
  zone('zone-airport', 'Airport stand', [-19, -6], [20, 24], '#dfe7f1'),
  zone('zone-industry', 'Port & construction', [2, -9], [20, 16], '#e8e2d4'),
  zone('zone-farm', 'Farm', [22, -9], [16, 16], '#dcebd6'),
  zone('zone-care', 'Care & kitchen', [0, 9.5], [18, 13], '#e6e3f0'),
  zone('zone-events', 'Events', [21, 9.5], [16, 13], '#f1e3dc'),
  asset('aircraft', 'aircraft', [-19, -9], 'Aircraft'),
  asset('baggage-1', 'baggage-cart', [-15.5, 1.2], 'Baggage cart · 6 bags', { count: 6 }),
  asset('baggage-2', 'baggage-cart', [-15.5, 4], undefined, { count: 3 }),
  asset('tower-crane', 'tower-crane', [-6, -13], 'Tower crane'),
  asset('gantry-crane', 'gantry-crane', [5, -9], 'Gantry crane', { rotation: [0, Math.PI / 2, 0] }),
  asset('valve', 'valve', [9, -3.5], 'Valve', { variant: 'open' }),
  asset('silo', 'grain-silo', [25, -12], 'Grain silo'),
  asset('tractor', 'tractor', [19, -6], 'Tractor', { rotation: [0, -Math.PI / 2, 0] }),
  asset('bed-1', 'hospital-bed', [-6.5, 9], 'Hospital bed'),
  asset('bed-2', 'hospital-bed', [-4.5, 9], undefined, { color: '#9fcdb8' }),
  asset('service-cart', 'service-cart', [-2.6, 11.5], 'Service cart'),
  asset('kitchen-cooking', 'kitchen-station', [2.5, 7], 'Kitchen · cooking', { variant: 'cooking' }),
  asset('kitchen-prep', 'kitchen-station', [6, 7], 'Kitchen · prep', { variant: 'prep' }),
  asset('stage', 'event-stage', [21, 6.5], 'Event stage'),
  asset('booth-1', 'exhibition-booth', [16.5, 13], 'Exhibition booth'),
  asset('booth-2', 'exhibition-booth', [25.5, 13], undefined, { color: '#e26d5a' }),
  // Illustrative people from the person catalog; they carry no staff, patient or visitor records.
  person('person-crane', 'construction-worker', [-3.6, -10.2], { variant: 'working', rotation: [0, -Math.PI / 2, 0] }),
  person('person-port', 'construction-worker', [7.6, -6], { variant: 'idle', person: { figure: 'feminine' }, rotation: [0, -Math.PI / 2, 0] }),
  person('person-doctor', 'doctor', [-5.5, 11.2], { variant: 'idle', rotation: [0, Math.PI, 0] }),
  person('person-nurse', 'nurse', [-3.25, 9], { variant: 'working', person: { figure: 'feminine' }, rotation: [0, -Math.PI / 2, 0] }),
  person('person-chef-1', 'chef', [2.5, 8.6], { variant: 'working', rotation: [0, Math.PI, 0] }),
  person('person-chef-2', 'chef', [6, 8], { variant: 'working', person: { figure: 'feminine' }, rotation: [0, Math.PI, 0], color: '#a33b3b' }),
  person('person-guard', 'security-guard', [17.6, 3.2], { variant: 'idle', rotation: [0, Math.PI / 2, 0] }),
  person('person-visitor-1', 'visitor', [16, 15.4], { variant: 'idle', person: { figure: 'feminine' }, rotation: [0, Math.PI, 0] }),
  person('person-visitor-2', 'visitor', [25, 15.6], { variant: 'walking', rotation: [0, Math.PI, 0], color: '#4f7fbf' }),
  person('person-visitor-3', 'office-worker', [26.2, 15.4], { variant: 'idle', rotation: [0, Math.PI, 0] }),
] };
export const makeDomainKitsStore = () => createSceneStore(domainKitsDefinition, { shadows: false, zoom: .85 });
export interface DomainKitsSession { store: SceneStore; dispose(): void; }
export interface DomainKitsOptions { valveClosed: boolean; midnight: boolean; }
/** The valve position is a host-switched variant here, not live process feedback. */
export function updateDomainKits(store: SceneStore, options: DomainKitsOptions) {
  const valve = store.getSnapshot().nodes.find(node => node.id === 'valve'), variant = options.valveClosed ? 'closed' : 'open';
  if (valve?.kind === 'asset' && valve.variant !== variant) store.upsert({ ...valve, variant });
  store.configure({ theme: options.midnight ? 'midnight' : 'light' });
}

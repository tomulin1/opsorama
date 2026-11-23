import { createSceneStore, type AssetNode, type GroundNode, type LightingPreset, type QualityLevel, type SceneDefinition, type SceneNode, type SceneSettings, type SceneSettingsPatch, type SceneStore, type Selection } from '@opsorama/core';
import { createAssetRegistry, type AssetRegistry, type SceneRenderer } from '@opsorama/three';
import { buildingsKit } from '@opsorama/objects/buildings';
import { environmentKit } from '@opsorama/objects/environment';
import { furnitureKit } from '@opsorama/objects/furniture';
import { indicatorsKit } from '@opsorama/objects/indicators';
import { vehiclesKit } from '@opsorama/objects/vehicles';

/*
 * The lighting example: one delivery yard under each lighting preset, with an optional sky gradient, distance fog and a
 * quality profile. Lighting never rebuilds models; only the lights, the exposure, the background and the fog change.
 */

export const lightingAssets: AssetRegistry = createAssetRegistry(buildingsKit, environmentKit, furnitureKit, indicatorsKit, vehiclesKit);

export const floor: GroundNode = { id: 'yard', kind: 'ground', size: [26, 18] };
export const yardNodes: readonly AssetNode[] = [
  { id: 'store', kind: 'asset', asset: 'storefront', position: [-6, 0, -5], label: 'Store' },
  { id: 'rack-1', kind: 'asset', asset: 'pallet-rack', position: [3, 0, -5] },
  { id: 'rack-2', kind: 'asset', asset: 'pallet-rack', position: [6, 0, -5] },
  { id: 'van', kind: 'asset', asset: 'delivery-van', entityId: 'van:1', position: [-2, 0, 2], rotation: [0, .6, 0], label: 'Van 1' },
  { id: 'lift', kind: 'asset', asset: 'forklift', entityId: 'forklift:1', position: [4, 0, 1] },
  { id: 'lamp-1', kind: 'asset', asset: 'lamp-post', position: [-9, 0, 4] },
  { id: 'lamp-2', kind: 'asset', asset: 'lamp-post', position: [9, 0, 4] },
  { id: 'tree-1', kind: 'asset', asset: 'tree', position: [-11, 0, -7] },
  { id: 'tree-2', kind: 'asset', asset: 'tree-pine', position: [11, 0, -7] },
  { id: 'tree-3', kind: 'asset', asset: 'tree', position: [10, 0, 7] },
  { id: 'beacon', kind: 'asset', asset: 'status-beacon', position: [0, 0, -2], state: 'warning' },
];
export const lightingDefinition: SceneDefinition = { schemaVersion: 1, nodes: [floor, ...yardNodes] };
export const sceneNodes = (): SceneNode[] => lightingDefinition.nodes.slice();

/** What the example page changes; every field maps to a scene setting. */
export interface LightingData { lighting: LightingPreset; theme: SceneSettings['theme']; sky: boolean; fog: boolean; quality: QualityLevel; perspective: boolean }
export const DEFAULT_LIGHTING_DATA: LightingData = { lighting: 'studio', theme: 'light', sky: false, fog: false, quality: 'high', perspective: false };
/** The settings of the page state: a perspective camera shows the sky and the fog best. */
export const lightingSettings = (data: LightingData): SceneSettingsPatch => ({
  lighting: data.lighting, theme: data.theme, sky: data.sky, fog: data.fog, quality: data.quality,
  camera: data.perspective ? { projection: 'perspective', fov: 40 } : { projection: 'orthographic' },
});
/** A store with the page's settings; the component adapters start it empty and add the nodes as components. */
export const makeLightingStore = (data: LightingData, definition: SceneDefinition = lightingDefinition): SceneStore => createSceneStore(definition, lightingSettings(data));
export const selectionSummary = (selection: Selection | null) => selection ? `Selected: ${selection.nodeId}${selection.entityId ? ` (${selection.entityId})` : ''}` : 'Selected: nothing';

export interface LightingSession { store: SceneStore; setData(data: LightingData): void; dispose(): void }
export interface LightingCallbacks { ready(renderer: SceneRenderer): void; select(selection: Selection | null): void; error(error: Error): void }

/** The usage snippet of each adapter: the settings are the same everywhere, on the store. */
export function lightingSnippet(framework: 'react' | 'vue' | 'javascript'): string {
  const configure = `// Lighting, sky, fog and quality are scene settings: they change lights, background and resolution, never the models.
store.configure({ lighting: 'dusk', sky: true, fog: true, quality: 'balanced' });`;
  if (framework === 'javascript') return `const store = createSceneStore(definition, { lighting: 'daylight', sky: true });
const renderer = createSceneRenderer(container, store, { assets });
${configure}`;
  if (framework === 'react') return `const store = createSceneStore(definition, { lighting: 'daylight', sky: true });

<DashboardProvider store={store}>
  <SceneCanvas assets={assets} />
</DashboardProvider>

${configure}`;
  return `const store = createSceneStore(definition, { lighting: 'daylight', sky: true });

h(DashboardProvider, { store }, () => [h(SceneCanvas, { assets })])

${configure}`;
}

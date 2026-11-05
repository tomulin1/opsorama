import { createSceneStore, type AssetNode, type SceneNode, type SceneStore } from '@opsorama/core';

/** Change this version when geometry inputs, layout or motion change; compare equal versions. */
export const PERFORMANCE_FIXTURE_VERSION = 'mixed-catalog-v1';
/** Explicit instance budgets, excluding the single ground node. No automatic quality adjustment. */
export const PERFORMANCE_PRESETS = {
  baseline: { label: 'Baseline', instances: 256 },
  large: { label: 'Large', instances: 1024 },
  mega: { label: 'Mega', instances: 2048 },
} as const;
export type PerformancePreset = keyof typeof PERFORMANCE_PRESETS;
export const DEFAULT_PERFORMANCE_PRESET: PerformancePreset = 'mega';
export const PERFORMANCE_ZOOM = 1;

/** Same miniature scale at every load; changing load adds instances, never scales quantities. */
const MODEL_SCALE = .32, CELL_SPACING = 1.05;
const MODELS: readonly { asset: string; label: string; options?: Partial<AssetNode> }[] = [
  { asset: 'equipment-cabinet', label: 'Rack cabinet', options: { variant: 'overview', count: 8 } },
  { asset: 'pallet', label: 'Pallet', options: { count: 3 } },
  { asset: 'shelf', label: 'Shelf', options: { count: 4 } },
  { asset: 'worker', label: 'Worker', options: { variant: 'walking' } },
  { asset: 'cooling-unit', label: 'Cooling unit' },
  { asset: 'tote', label: 'Tote', options: { count: 3 } },
  { asset: 'parcel-base', label: 'Parcels on base', options: { count: 3 } },
  { asset: 'tree-pine', label: 'Pine tree' },
];

/** Deterministic synthetic grid, in scene metres. IDs, states, counts and route phases use no randomness. */
export function performanceNodes(preset: PerformancePreset): SceneNode[] {
  const definition = PERFORMANCE_PRESETS[preset];
  if (!definition) throw new Error(`Unknown performance preset: ${preset}. Choose baseline, large or mega.`);
  const columns = Math.ceil(Math.sqrt(definition.instances)), rows = Math.ceil(definition.instances / columns);
  const nodes: SceneNode[] = [{ id: 'benchmark-ground', kind: 'ground', size: [columns * CELL_SPACING + 5, rows * CELL_SPACING + 5], position: [0, 0, 0], color: '#dce6ed' }];
  for (let index = 0; index < definition.instances; index++) {
    const model = MODELS[index % MODELS.length];
    const x = (index % columns - (columns - 1) / 2) * CELL_SPACING, z = (Math.floor(index / columns) - (rows - 1) / 2) * CELL_SPACING;
    const position = [x, 0, z] as const;
    nodes.push({
      ...model.options, id: `benchmark-${index}`, kind: 'asset', asset: model.asset,
      label: `${model.label} ${index + 1}`, selectable: true, labelMode: 'always',
      position, scale: [MODEL_SCALE, MODEL_SCALE, MODEL_SCALE], rotation: [0, index % 2 ? Math.PI : 0, 0],
      state: index % 37 === 0 ? 'critical' : index % 11 === 0 ? 'warning' : 'normal',
      ...(model.asset === 'worker' ? { route: { points: [position, [x + .22, 0, z], [x + .22, 0, z + .22], [x, 0, z + .22], position], speed: .12, loop: true, elapsed: index % 13 * .3 } } : {}),
    });
  }
  return nodes;
}

/** Host-owned fixture store. SceneCanvas owns its renderer; the host disposes this store on leaving the page. */
export function createPerformanceStore(preset: PerformancePreset = DEFAULT_PERFORMANCE_PRESET): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: performanceNodes(preset) }, { shadows: false, labels: false, motion: true, zoom: PERFORMANCE_ZOOM });
}

/** Completed-frame throughput for an actual elapsed interval, not a GPU timer or a frame-time percentile. */
export interface ThroughputSample { frames: number; elapsedMs: number; }
export function summarizeThroughput(samples: readonly ThroughputSample[]) {
  if (!samples.length) return null;
  if (samples.some(sample => !Number.isSafeInteger(sample.frames) || sample.frames < 0 || !Number.isFinite(sample.elapsedMs) || sample.elapsedMs <= 0)) throw new Error('Throughput samples require a nonnegative integer frame count and positive finite elapsed milliseconds.');
  const frames = samples.reduce((sum, sample) => sum + sample.frames, 0), elapsedMs = samples.reduce((sum, sample) => sum + sample.elapsedMs, 0);
  const rates = samples.map(sample => sample.frames * 1000 / sample.elapsedMs);
  return { frames, elapsedMs, averageFps: frames * 1000 / elapsedMs, minimumIntervalFps: Math.min(...rates), maximumIntervalFps: Math.max(...rates), intervals: samples.length };
}

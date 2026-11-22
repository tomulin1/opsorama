import type { AssetNode } from '@opsorama/core';
import { validateBuildingNode, type BuildingOptions } from './building';
import { validateContents, type ContainerContents } from './contents';
import { assetDisplayDefinitions, validateDisplay, type DisplayReading } from './displays';
import { FORK_LIMITS, validateForkMotion, type ForkMotion } from './forks';
import { assetMeasurementDefinitions, resolveMeasurement, type Measurement } from './gauges';
import { OPERATING_OPTION_ASSETS, validateOperatingProperties } from './operating';
import { PERSON_ASSETS, validatePersonOptions, type PersonOptions } from './people';
import { assetLabelSurfaces, validateSurfaceLabel, type SurfaceLabel } from './surface-labels';

declare module '@opsorama/core' {
  /** Model options of the `@opsorama/objects` catalog. Each option is accepted only by the assets in `CATALOG_OPTION_ASSETS`. */
  interface AssetOptions {
    /** forklift and reach-truck: fork height and reach, set by the host. Default: travel height, not reached out. See `ForkMotion`. */
    forks?: ForkMotion;
    /** Person assets (`PERSON_ASSETS`): body silhouette and hairstyle. */
    person?: PersonOptions;
    /** heated-pass, espresso-machine and pizza-oven: visible heat glow, steam or fire, default true. Independent of alerts and motion. */
    heatEnabled?: boolean;
    /** deck-shower: visible water, default true. Scene motion gates still control droplets. */
    waterRunning?: boolean;
    /** trough: finite fill fraction 0–1, default 1; zero removes the contents. */
    fillLevel?: number;
    /** building: exterior style, size, cutaway and colors. See `BuildingOptions`. */
    building?: BuildingOptions;
    /** parcel and shopping-cart: host content lines shown as bounded visible proxies and summarized in the label. See `ContainerContents`. */
    contents?: ContainerContents;
    /** Readout assets (`assetDisplayDefinitions`): number, clock, stopwatch or countdown reading. See `DisplayReading`. */
    display?: DisplayReading;
    /** Gauge assets (`assetMeasurementDefinitions`): reading, range, unit, target and bands. See `Measurement`. */
    measurement?: Measurement;
    /** Assets with a label surface (`assetLabelSurfaces`): text or SVG artwork painted on the model. See `SurfaceLabel`. */
    surfaceLabel?: SurfaceLabel;
  }
}

/** Option names of the catalog's `AssetOptions`. */
export type CatalogOption = 'forks' | 'person' | 'heatEnabled' | 'waterRunning' | 'fillLevel' | 'building' | 'contents' | 'display' | 'measurement' | 'surfaceLabel';

/** The catalog assets that accept each option in `AssetNode.options`. Any other option key on a catalog asset is an error. */
export const CATALOG_OPTION_ASSETS: Readonly<Record<CatalogOption, readonly string[]>> = Object.freeze({
  forks: Object.freeze(Object.keys(FORK_LIMITS)),
  person: PERSON_ASSETS,
  heatEnabled: OPERATING_OPTION_ASSETS.heatEnabled,
  waterRunning: OPERATING_OPTION_ASSETS.waterRunning,
  fillLevel: OPERATING_OPTION_ASSETS.fillLevel,
  building: Object.freeze(['building']),
  contents: Object.freeze(['parcel', 'shopping-cart']),
  display: Object.freeze(Object.keys(assetDisplayDefinitions)),
  measurement: Object.freeze(Object.keys(assetMeasurementDefinitions)),
  surfaceLabel: Object.freeze(Object.keys(assetLabelSurfaces)),
});

/**
 * Validates the `options` of a catalog asset node and throws an actionable error: every key must be an option the asset
 * accepts (`CATALOG_OPTION_ASSETS`), every value must be valid, and options must not conflict with other node fields:
 * - `display` excludes `count`, `multiplier`, `measurement` and `surfaceLabel`;
 * - `measurement` excludes `count` and `multiplier`;
 * - `contents` excludes `count` and `multiplier`;
 * - `building` excludes `variant`, `count`, `multiplier` and `footprint` (the size is `building.size`).
 * `asset` is the catalog key of the factory, normally `node.asset`.
 */
export function validateCatalogOptions(asset: string, node: AssetNode): void {
  if (asset === 'building') validateBuildingNode(node);
  const options = node.options;
  if (options === undefined) return;
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    const accepting = Object.hasOwn(CATALOG_OPTION_ASSETS, key) ? CATALOG_OPTION_ASSETS[key as CatalogOption] : undefined;
    if (!accepting) throw new Error(`Asset ${asset} has no option ${key} (node ${node.id}). Catalog options are ${Object.keys(CATALOG_OPTION_ASSETS).join(', ')}; remove options.${key}.`);
    if (!accepting.includes(asset)) throw new Error(`Asset ${asset} does not accept options.${key} (node ${node.id}). It is accepted by ${accepting.join(', ')}; remove options.${key} or use one of those assets.`);
  }
  validateOperatingProperties({ asset, options });
  if (options.forks !== undefined) validateForkMotion(asset, options.forks);
  if (options.person !== undefined) validatePersonOptions(options.person);
  if (options.contents !== undefined) {
    validateContents(options.contents);
    if (node.count !== undefined || node.multiplier !== undefined) throw new Error(`Contents of ${node.id} are independent of counted compositions; omit count and multiplier.`);
  }
  if (options.display !== undefined) {
    validateDisplay(options.display);
    if (node.count !== undefined || node.multiplier !== undefined || options.measurement !== undefined || options.surfaceLabel !== undefined) throw new Error(`Display readings of ${node.id} cannot be combined with counts, measurements or surface labels.`);
  }
  if (options.measurement !== undefined) {
    resolveMeasurement(options.measurement);
    if (node.count !== undefined || node.multiplier !== undefined) throw new Error(`Measurement of ${node.id} cannot be combined with count or multiplier.`);
  }
  if (options.surfaceLabel !== undefined) validateSurfaceLabel(options.surfaceLabel);
}

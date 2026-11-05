import * as THREE from 'three';
import { resolveCountRepresentation, validateOperatingProperties, type AssetNode } from '@opsorama/core';
import { disposeObject, type AssetFactory, type AssetRegistry, type MaterialContext } from '@opsorama/three';
import { assetCountDefinitions } from './asset-counts';
import { assetCountLayoutDefaults } from './count-layout';
import { assetDisplayDefinitions } from './displays';
import { assetMeasurementDefinitions } from './gauges';
import { applySurfaceLabel, assetLabelSurfaces } from './surface-labels';
import { assetFootprintDefinitions } from './surfaces';

/**
 * Wraps raw model factories as catalog entries. Each wrapped factory validates the node's operating properties, counts and multipliers,
 * display, count layout, measurement, surface label and footprint settings against the model's definitions, builds the model, applies its
 * surface label, and releases the model if that decoration fails. Every kit is built with it; the result is frozen.
 */
export function catalogEntries(factories: Readonly<Record<string, AssetFactory>>): AssetRegistry {
  return Object.freeze(Object.fromEntries(Object.entries(factories).map(([key, factory]): [string, AssetFactory] => [key, (node: AssetNode, context?: MaterialContext) => {
  validateOperatingProperties(node);
  const counted = node.count !== undefined || node.multiplier !== undefined;
  if (counted && assetCountDefinitions[key]) resolveCountRepresentation(node, assetCountDefinitions[key]);
  if (node.display !== undefined && !assetDisplayDefinitions[key]) throw new Error(`Asset ${key} has no display configuration.`);
  if (node.countLayout !== undefined && !assetCountLayoutDefaults[key]) throw new Error(`Asset ${key} has no count layout configuration.`);
  if (node.measurement !== undefined && !assetMeasurementDefinitions[key]) throw new Error(`Asset ${key} has no measurement configuration.`);
  if (node.surfaceLabel && !assetLabelSurfaces[key]) throw new Error(`Asset ${key} has no surface label configuration.`);
  if (node.footprint !== undefined && !assetFootprintDefinitions[key]) throw new Error(`Asset ${key} has no footprint configuration.`);
  const object = factory(node, context);
  try {
    // After the factory, so a model's own, more specific count error wins.
    if (counted && !assetCountDefinitions[key]) throw new Error(`Asset ${key} has no count configuration. Remove count and multiplier from node ${node.id}, or use a countable asset.`);
    if (node.surfaceLabel) applySurfaceLabel(object, node, assetLabelSurfaces[key]);
    if (object.userData.displayBounds instanceof THREE.Box3) object.userData.displayBounds.setFromObject(object);
    return object;
  }
  catch (error) { disposeObject(object); throw error; }
}])));
}

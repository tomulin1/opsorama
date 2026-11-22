import * as THREE from 'three';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { disposeObject, type AssetFactory, type AssetRegistry, type MaterialContext } from '@opsorama/three';
import { assetCountDefinitions } from './asset-counts';
import { assetCountLayoutDefaults } from './count-layout';
import { contentsLabel } from './contents';
import { formatMeasurement } from './gauges';
import { validateCatalogOptions } from './options';
import { applySurfaceLabel, assetLabelSurfaces } from './surface-labels';
import { assetFootprintDefinitions } from './surfaces';

/** Visible content proxies per container before the label reports the rest as overflow. */
const CONTENT_CAPACITY: Readonly<Record<string, number>> = Object.freeze({ parcel: 9, 'shopping-cart': 6 });

/**
 * Validates a node for the catalog asset `key` without building it: its `options` (accepted keys, values and cross-field
 * rules, see `validateCatalogOptions`), counts and multipliers against the model's count definition, count layout and footprint.
 */
function validateCatalogNode(key: string, node: AssetNode): void {
  if (node.countLayout !== undefined && !assetCountLayoutDefaults[key]) throw new Error(`Asset ${key} has no count layout configuration.`);
  if (node.footprint !== undefined && !assetFootprintDefinitions[key]) throw new Error(`Asset ${key} has no footprint configuration.`);
  if ((node.count !== undefined || node.multiplier !== undefined) && assetCountDefinitions[key]) resolveCountRepresentation(node, assetCountDefinitions[key]);
  validateCatalogOptions(key, node);
}

/**
 * Wraps raw model factories as catalog entries. Each entry carries `validate` (the store hook and the renderer call it before
 * building): it checks which `options` the asset accepts and their values, counts and multipliers, count layout and footprint
 * against the model's definitions. Calling the entry validates the same way, builds the model, applies its surface label, sets
 * the renderer hints for nodes with a surface label, measurement or contents (`labelHeight`, `labelText`, `labelWrap`), and
 * releases the model if that decoration fails. Every kit is built with it; the result is frozen.
 */
export function catalogEntries(factories: Readonly<Record<string, AssetFactory>>): AssetRegistry {
  return Object.freeze(Object.fromEntries(Object.entries(factories).map(([key, factory]): [string, AssetFactory] => {
    const validate = (node: AssetNode) => validateCatalogNode(key, node);
    const entry = (node: AssetNode, context?: MaterialContext) => {
      validate(node);
      const object = factory(node, context), options = node.options;
      try {
        // After the factory, so a model's own, more specific count error wins.
        if ((node.count !== undefined || node.multiplier !== undefined) && !assetCountDefinitions[key]) throw new Error(`Asset ${key} has no count configuration. Remove count and multiplier from node ${node.id}, or use a countable asset.`);
        if (options?.surfaceLabel) applySurfaceLabel(object, node, assetLabelSurfaces[key]);
        if (object.userData.displayBounds instanceof THREE.Box3) object.userData.displayBounds.setFromObject(object);
        // Labels float just above artwork and gauges, and summarize contents or the reading when the node has no own text.
        if (options?.surfaceLabel || options?.measurement) object.userData.labelHeight = new THREE.Box3().setFromObject(object).max.y + .35;
        if (options?.contents) object.userData.labelText = `${node.label ? `${node.label} · ` : ''}${contentsLabel(options.contents, CONTENT_CAPACITY[key] ?? 9)}`;
        else if (options?.measurement && node.label === undefined) object.userData.labelText = formatMeasurement(options.measurement);
        if (options?.measurement) object.userData.labelWrap = true;
        return object;
      }
      catch (error) { disposeObject(object); throw error; }
    };
    return [key, Object.assign(entry, { validate })];
  })));
}

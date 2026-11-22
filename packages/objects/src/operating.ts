import type { AssetNode } from '@opsorama/core';

/**
 * Explicit physical properties in `AssetNode.options` and the assets that accept them:
 * `heatEnabled` (visible heat glow, steam or fire, default true), `waterRunning` (visible water, default true)
 * and `fillLevel` (fill fraction 0–1, default 1; zero removes the contents).
 */
export const OPERATING_OPTION_ASSETS = Object.freeze({
  heatEnabled: Object.freeze(['heated-pass', 'espresso-machine', 'pizza-oven'] as const),
  waterRunning: Object.freeze(['deck-shower'] as const),
  fillLevel: Object.freeze(['trough'] as const),
});
export type OperatingOption = keyof typeof OPERATING_OPTION_ASSETS;

/**
 * Checks the explicit physical properties in `node.options` before a model is built or stored.
 * These properties never infer alarms, business activity or scene motion.
 */
export function validateOperatingProperties(node: Pick<AssetNode, 'asset' | 'options'>): void {
  for (const field of Object.keys(OPERATING_OPTION_ASSETS) as OperatingOption[]) {
    const value = node.options?.[field], assets: readonly string[] = OPERATING_OPTION_ASSETS[field];
    if (value === undefined) continue;
    if (!assets.includes(node.asset)) throw new Error(`options.${field} is supported only by ${assets.join(', ')}; remove it from ${node.asset}.`);
    if (field === 'fillLevel') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('trough options.fillLevel must be a finite fraction from 0 (empty) to 1 (full).');
    } else if (typeof value !== 'boolean') throw new Error(`${node.asset} options.${field} must be a boolean; use true or false.`);
  }
}

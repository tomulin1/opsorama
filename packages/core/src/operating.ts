import type { AssetNode } from './index';

/**
 * Checks explicit physical properties before a model is built or stored.
 * These properties never infer alarms, business activity or scene motion.
 */
export function validateOperatingProperties(node: Pick<AssetNode, 'asset' | 'heatEnabled' | 'waterRunning' | 'fillLevel'>): void {
  for (const [field, assets] of [['heatEnabled', ['heated-pass', 'espresso-machine', 'pizza-oven']], ['waterRunning', ['deck-shower']], ['fillLevel', ['trough']]] as const) {
    const value = node[field];
    if (value === undefined) continue;
    if (!assets.some(asset => asset === node.asset)) throw new Error(`${field} is supported only by ${assets.join(', ')}; remove it from ${node.asset}.`);
    if (field === 'fillLevel') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('trough.fillLevel must be a finite fraction from 0 (empty) to 1 (full).');
    } else if (typeof value !== 'boolean') throw new Error(`${node.asset}.${field} must be a boolean; use true or false.`);
  }
}

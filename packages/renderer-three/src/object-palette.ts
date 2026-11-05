import type { AssetNode, MaterialPalette } from '@opsorama/core';
import type { MaterialContext } from './laboratory';
import { stateColor } from './parts';
const tones: MaterialPalette = { surface: '#d9b48a', structure: '#7f8fa6', trim: '#f6e6c7', accent: '#6c97d9', glass: '#c3d0e0', liquid: '#7ba88b', screen: '#23334e', text: '#ffffff', skin: '#d9b397', hair: '#3a3c43', wood: '#a8896a', foliage: '#8bbcaa', normal: '#38a88a', busy: '#5088ec', warning: '#e6b569', critical: '#df6470', inactive: '#788297' };
/**
 * Theme → definition defaults → scene roles → compatibility color → instance roles.
 * `defaults` keep a definition's own look in the default scene; a scene palette still overrides them.
 */
export function objectPalette(node: AssetNode, context?: MaterialContext, colorRole: keyof MaterialPalette = 'surface', defaults?: Partial<MaterialPalette>): MaterialPalette {
  return { ...tones, ...(context?.theme === 'midnight' ? { surface: '#9a8068', structure: '#99abc0', accent: '#87a5e0', glass: '#9bb1cc' } : {}), ...defaults, ...context?.palette, ...(node.color ? { [colorRole]: node.color } : {}), ...node.materials };
}

/** Resolve one legacy part tone: instance role → color → scene role → definition tone. Preserves the original default. */
export function resolveObjectColor(node: AssetNode, context: MaterialContext | undefined, role: keyof MaterialPalette, fallback: string): string {
  return node.materials?.[role] ?? node.color ?? context?.palette?.[role] ?? fallback;
}

/** Preserve legacy warning/critical/inactive mappings, with status roles independent of the body color. */
export function resolveObjectStateColor(node: AssetNode, context: MaterialContext | undefined, fallback: string): string {
  return stateColor(node.state, fallback, { ...context?.palette, ...node.materials });
}

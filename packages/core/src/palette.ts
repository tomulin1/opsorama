import { collectProblems, throwOnErrors } from './scene-problems';
import { materialChecks } from './validate-scene';
/** Semantic material roles. Support is declared by each asset; legacy models may ignore these. */
export const MATERIAL_ROLES = ['surface', 'structure', 'trim', 'accent', 'glass', 'liquid', 'screen', 'text', 'skin', 'hair', 'wood', 'foliage', 'normal', 'busy', 'warning', 'critical', 'inactive'] as const;
export type MaterialRole = typeof MATERIAL_ROLES[number];
/**
 * A six-digit hex color, #RRGGBB.
 * @pattern ^#[0-9a-fA-F]{6}$
 */
type HexColor = string;
/** A #RRGGBB color for every material role. */
export type MaterialPalette = Readonly<Record<MaterialRole, HexColor>>;
/** #RRGGBB colors for some material roles; omitted roles keep their defaults. */
export type MaterialOverrides = Readonly<Partial<MaterialPalette>>;
/** Throws `SceneValidationError` unless every key is a known `MaterialRole` with a #RRGGBB color. */
export function validateMaterialOverrides(value: MaterialOverrides): void {
  throwOnErrors(collectProblems(add => materialChecks(value, '', add)));
}

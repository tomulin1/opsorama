/** Semantic material roles. Support is declared by each asset; legacy models may ignore these. */
export const MATERIAL_ROLES = ['surface', 'structure', 'trim', 'accent', 'glass', 'liquid', 'screen', 'text', 'skin', 'hair', 'wood', 'foliage', 'normal', 'busy', 'warning', 'critical', 'inactive'] as const;
export type MaterialRole = typeof MATERIAL_ROLES[number];
export type MaterialPalette = Readonly<Record<MaterialRole, string>>;
export type MaterialOverrides = Readonly<Partial<MaterialPalette>>;
export function validateMaterialOverrides(value: MaterialOverrides): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Material palette must be an object.');
  for (const [role, color] of Object.entries(value)) if (!MATERIAL_ROLES.includes(role as MaterialRole) || typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Material palette requires known roles with #RRGGBB colors.');
}

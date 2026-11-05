export type AssetCountDefinition = Readonly<{
  label: string;
  unit: string;
  default: number;
} & ({ kind: 'range'; min: number; max: number; step: number } | { kind: 'variants'; values: readonly number[] })>;

export interface AssetCountInput { count?: number; multiplier?: number; }
export interface CountRepresentation { count: number; multiplier: number; total: number; }

/** Count is visible geometry; multiplier changes its disclosed symbolic meaning. */
export function resolveCountRepresentation(input: AssetCountInput, definition: AssetCountDefinition): CountRepresentation {
  const validDefinition = Number.isSafeInteger(definition.default) && definition.default >= 0 && (
    definition.kind === 'range'
      ? Number.isSafeInteger(definition.min) && definition.min >= 0 && Number.isSafeInteger(definition.max) && definition.max >= definition.min && Number.isSafeInteger(definition.step) && definition.step > 0 && definition.default >= definition.min && definition.default <= definition.max && (definition.default - definition.min) % definition.step === 0
      : definition.values.length > 0 && definition.values.every(value => Number.isSafeInteger(value) && value >= 0) && new Set(definition.values).size === definition.values.length && definition.values.includes(definition.default)
  );
  if (!validDefinition) throw new Error('Asset count definition must declare a finite integer range or unique exact variants.');
  validateCountInput(input);
  const count = input.count ?? definition.default, multiplier = input.multiplier ?? 1;
  validateCountInput({ count, multiplier });
  const allowed = definition.kind === 'variants' ? definition.values.includes(count) : count >= definition.min && count <= definition.max && (count - definition.min) % definition.step === 0;
  if (!allowed) throw new Error(`Invalid ${definition.label}: ${count}. Allowed ${definition.kind === 'variants' ? definition.values.join(', ') : `${definition.min}–${definition.max} in steps of ${definition.step}`}.`);
  return { count, multiplier, total: count * multiplier };
}

export function validateCountInput(input: AssetCountInput): void {
  if (input.count !== undefined && (!Number.isSafeInteger(input.count) || input.count < 0)) throw new Error('Asset count must be a non-negative safe integer.');
  if (input.multiplier !== undefined && (!Number.isSafeInteger(input.multiplier) || input.multiplier < 1)) throw new Error('Asset multiplier must be a positive safe integer.');
  if (!Number.isSafeInteger((input.count ?? 1) * (input.multiplier ?? 1))) throw new Error('Represented count exceeds the safe integer range.');
}
/** Reserved layouts keep each part in its maximum-capacity slot as count changes. */
export type CountLayout = 'compact' | 'reserved';

/** Width along local x and depth along local z, in metres. Patterns keep their real size; geometric scale would stretch them. */
export type Footprint = readonly [width: number, depth: number];

export type FootprintDefinition = Readonly<{
  min: Footprint;
  max: Footprint;
  default: Footprint;
  /** Variant-specific defaults, used when the node omits a footprint. */
  variantDefaults?: Readonly<Record<string, Footprint>>;
}>;

export function validateFootprint(footprint: Footprint): void {
  if (!Array.isArray(footprint) || footprint.length !== 2 || footprint.some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) throw new Error('Footprint requires two positive finite dimensions in metres.');
}

/** Resolves the explicit footprint or the variant/definition default, rejecting sizes outside the declared range. */
export function resolveFootprint(input: { footprint?: Footprint; variant?: string }, definition: FootprintDefinition): Footprint {
  const footprint = input.footprint ?? (input.variant !== undefined ? definition.variantDefaults?.[input.variant] : undefined) ?? definition.default;
  validateFootprint(footprint);
  if (footprint.some((value, axis) => value < definition.min[axis] || value > definition.max[axis])) throw new Error(`Footprint must be ${definition.min[0]}–${definition.max[0]} m wide and ${definition.min[1]}–${definition.max[1]} m deep.`);
  return footprint;
}

export interface MeasurementBand { from: number; to: number; state: 'normal' | 'warning' | 'critical'; }
/** A reading is independent of discrete object counts and source unit identities. */
export interface Measurement {
  value: number | null;
  min?: number;
  max?: number;
  unit?: string;
  target?: number;
  bands?: readonly MeasurementBand[];
}
export interface ResolvedMeasurement {
  value: number | null; min: number; max: number; unit: string;
  fraction: number | null; targetFraction?: number; outOfRange: boolean;
  state?: MeasurementBand['state']; bands: readonly MeasurementBand[];
}
export function resolveMeasurement(input: Measurement): ResolvedMeasurement {
  if (!input || typeof input !== 'object') throw new Error('Measurement must be an object.');
  const { value, target } = input, min = input.min === undefined ? 0 : input.min, max = input.max === undefined ? 100 : input.max;
  if (value !== null && !Number.isFinite(value)) throw new Error('Measurement value must be finite or null.');
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(max - min)) throw new Error('Measurement requires a finite increasing range.');
  if (target !== undefined && !Number.isFinite(target)) throw new Error('Measurement target must be finite.');
  if (input.unit !== undefined && (typeof input.unit !== 'string' || input.unit.length > 40)) throw new Error('Measurement unit must be a string of at most 40 characters.');
  if (input.bands !== undefined && (!Array.isArray(input.bands) || input.bands.length > 12)) throw new Error('Measurement supports at most twelve bands.');
  const bands = input.bands ?? [];
  let previous = min, state: MeasurementBand['state'] | undefined;
  for (const band of bands) {
    if (!band || !Number.isFinite(band.from) || !Number.isFinite(band.to) || band.from < previous || band.to <= band.from || band.to > max || !['normal', 'warning', 'critical'].includes(band.state)) throw new Error('Measurement bands must be ordered, non-overlapping and inside the range.');
    previous = band.to;
    if (value !== null && value >= band.from && value <= band.to) state = band.state;
  }
  const fraction = (reading: number) => reading <= min ? 0 : reading >= max ? 1 : (reading - min) / (max - min);
  return { value, min, max, unit: input.unit ?? '', fraction: value === null ? null : fraction(value), ...(target === undefined ? {} : { targetFraction: fraction(target) }), outOfRange: value !== null && (value < min || value > max), state, bands };
}
export function formatMeasurement(input: Measurement): string {
  const reading = resolveMeasurement(input);
  const value = reading.value !== null && reading.unit.trim() === '%' ? Math.round(reading.value) : reading.value;
  return value === null ? 'Unknown' : `${value}${reading.unit ? ` ${reading.unit}` : ''}${reading.outOfRange ? ' (out of range)' : ''}`;
}

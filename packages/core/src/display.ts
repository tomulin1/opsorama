/** Host-owned readings. Optional running advances only the renderer's visual demonstration. */
export type DisplayReading =
  | { kind: 'number'; value: number | null; decimals?: 0 | 1 | 2 }
  | { kind: 'clock' | 'stopwatch' | 'countdown'; seconds: number; running?: boolean };

export function validateDisplay(reading: DisplayReading): void {
  if (!reading || typeof reading !== 'object') throw new Error('Display reading must be an object.');
  if (reading.kind === 'number') {
    if (reading.value !== null && (!Number.isFinite(reading.value) || Math.abs(reading.value) > 9999.99)) throw new Error('Display value must be null or between -9999.99 and 9999.99.');
    if (reading.decimals !== undefined && ![0, 1, 2].includes(reading.decimals)) throw new Error('Display decimals must be 0, 1 or 2.');
  } else {
    if (!['clock', 'stopwatch', 'countdown'].includes(reading.kind)) throw new Error('Unknown display reading kind.');
    const max = reading.kind === 'clock' ? 86399 : 359999;
    if (!Number.isInteger(reading.seconds) || reading.seconds < 0 || reading.seconds > max) throw new Error(`Display seconds must be an integer from 0 to ${max}.`);
    if (reading.running !== undefined && typeof reading.running !== 'boolean') throw new Error('Display running must be boolean.');
  }
}

/** Fixed-width time, with no implicit timezone, system clock or business timer. */
export function formatDisplay(reading: DisplayReading, showSeconds = true): string {
  validateDisplay(reading);
  if (reading.kind === 'number') return reading.value === null ? '----' : reading.value.toFixed(reading.decimals ?? 0);
  const n = reading.seconds, pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(n / 3600))}:${pad(Math.floor(n / 60) % 60)}${showSeconds ? `:${pad(n % 60)}` : ''}`;
}

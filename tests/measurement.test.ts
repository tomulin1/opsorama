import { describe, expect, it } from 'vitest';
import { createSceneStore, formatMeasurement, resolveMeasurement, type AssetNode, type Measurement } from '@opsorama/core';

describe('measured values', () => {
  it('rounds percentage labels without changing readings, fractions or non-percentage precision', () => {
    const reading = { value: 72.583927, unit: '%' };
    expect(formatMeasurement(reading)).toBe('73 %');
    expect(reading.value).toBe(72.583927); expect(resolveMeasurement(reading).fraction).toBeCloseTo(.72583927);
    expect(formatMeasurement({ value: 72.49, unit: '%' })).toBe('72 %');
    expect(formatMeasurement({ value: -2.6, min: -10, max: 10, unit: '%' })).toBe('-3 %');
    expect(formatMeasurement({ value: 125.6, unit: '%' })).toBe('126 % (out of range)');
    expect(formatMeasurement({ value: null, unit: '%' })).toBe('Unknown');
    expect(formatMeasurement({ value: 72.583927, unit: 'kW' })).toBe('72.583927 kW');
  });
  it('normalizes decimal and negative readings without rounding source values', () => {
    expect(resolveMeasurement({ value: 72.5 })).toMatchObject({ value: 72.5, fraction: .725, min: 0, max: 100 });
    expect(resolveMeasurement({ value: -5, min: -20, max: 40, unit: 'C' }).fraction).toBe(.25);
    expect(formatMeasurement({ value: 0.000012345, unit: 'kW' })).toBe('0.000012345 kW');
  });
  it('distinguishes unknown, zero and out-of-range readings and retains unbounded target text', () => {
    expect(resolveMeasurement({ value: null, target: 125 })).toMatchObject({ fraction: null, targetFraction: 1, outOfRange: false });
    expect(resolveMeasurement({ value: 0 }).fraction).toBe(0);
    expect(formatMeasurement({ value: null, unit: '%' })).toBe('Unknown');
    expect(formatMeasurement({ value: 125, unit: '%' })).toBe('125 % (out of range)');
    expect(resolveMeasurement({ value: -10 })).toMatchObject({ value: -10, fraction: 0, outOfRange: true });
  });
  it('resolves boundary readings into the next ordered threshold band', () => {
    const bands = [{ from: 0, to: 70, state: 'normal' }, { from: 70, to: 90, state: 'warning' }, { from: 90, to: 100, state: 'critical' }] as const;
    expect(resolveMeasurement({ value: 70, bands }).state).toBe('warning');
    expect(resolveMeasurement({ value: 90, bands }).state).toBe('critical');
    expect(resolveMeasurement({ value: null, bands }).state).toBeUndefined();
    expect(resolveMeasurement({ value: 110, bands }).state).toBeUndefined();
  });
  it('rejects invalid readings, ranges, targets, overlapping bands and unbounded band lists', () => {
    for (const input of [
      { value: NaN }, { value: Infinity }, { value: undefined }, { value: 0, min: 1, max: 1 }, { value: 0, min: -Number.MAX_VALUE, max: Number.MAX_VALUE }, { value: 0, target: Infinity },
      { value: 0, min: null }, { value: 0, max: null }, { value: 0, unit: 1 }, { value: 0, bands: [{ from: -1, to: 10, state: 'normal' }] },
      { value: 0, bands: [{ from: 0, to: 50, state: 'normal' }, { from: 40, to: 100, state: 'warning' }] },
      { value: 0, bands: [{ from: 0, to: 101, state: 'normal' }] },
      { value: 0, bands: Array.from({ length: 13 }, (_, i) => ({ from: i, to: i + 1, state: 'normal' })) },
    ]) expect(() => resolveMeasurement(input as Measurement)).toThrow();
  });
  it('deeply snapshots readings and bands and rejects invalid updates atomically', () => {
    const measurement: Measurement = { value: 72.5, bands: [{ from: 0, to: 100, state: 'warning' }] };
    const node: AssetNode = { id: 'load', entityId: 'server-a', kind: 'asset', asset: 'ring-gauge', measurement };
    const store = createSceneStore({ schemaVersion: 1, nodes: [node] }); store.select('load');
    measurement.value = 10; measurement.bands![0].state = 'critical';
    const snapshot = store.getSnapshot(), stored = snapshot.nodes[0] as AssetNode;
    expect(stored.measurement!.value).toBe(72.5); expect(stored.measurement!.bands![0].state).toBe('warning');
    expect(Object.isFrozen(stored.measurement!.bands![0])).toBe(true);
    for (const patch of [{ measurement: { value: NaN } }, { count: 1 }, { multiplier: 2 }]) {
      expect(() => store.upsert({ ...stored, ...patch })).toThrow(); expect(store.getSnapshot()).toBe(snapshot);
    }
    store.upsert({ ...stored, measurement: { value: null } }); expect(store.getSnapshot().selection?.entityId).toBe('server-a'); store.dispose();
  });
});

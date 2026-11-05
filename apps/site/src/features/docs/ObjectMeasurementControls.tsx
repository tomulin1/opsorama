'use client';
import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatMeasurement, resolveMeasurement, type Measurement, type MeasurementBand } from '@opsorama/core';

interface Draft { value: string; min: string; max: string; unit: string; target: string; unknown: boolean; bands: { from: string; to: string; state: MeasurementBand['state'] }[]; }
export function ObjectMeasurementControls({ measurement, onChange }: { measurement: Readonly<Measurement>; onChange: (value: Measurement) => void }) {
  const valueId = useId();
  const [draft, setDraft] = useState<Draft>(() => ({ value: String(measurement.value ?? measurement.min ?? 0), min: String(measurement.min ?? 0), max: String(measurement.max ?? 100), unit: measurement.unit ?? '', target: measurement.target === undefined ? '' : String(measurement.target), unknown: measurement.value === null, bands: (measurement.bands ?? []).map(band => ({ ...band, from: String(band.from), to: String(band.to) })) }));
  const [error, setError] = useState<string | null>(null);
  function change(next: Draft) {
    setDraft(next);
    try {
      const number = (text: string) => { if (!text.trim() || !Number.isFinite(Number(text))) throw new Error('Enter finite numbers for the reading, range and bands.'); return Number(text); };
      const value: Measurement = { value: next.unknown ? null : number(next.value), min: number(next.min), max: number(next.max), unit: next.unit, ...(next.target.trim() ? { target: number(next.target) } : {}), ...(next.bands.length ? { bands: next.bands.map(band => ({ from: number(band.from), to: number(band.to), state: band.state })) } : {}) };
      resolveMeasurement(value); onChange(value); setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  const min = measurement.min ?? 0, max = measurement.max ?? 100, text = formatMeasurement(measurement);
  const step = measurement.unit?.trim() === '%' && Number.isInteger(min) && Number.isInteger(max) ? 1 : 'any';
  const field = (key: 'min' | 'max' | 'target', label: string) => <label>{label}<input aria-label={`Measurement ${key}`} type="number" step="any" value={draft[key]} onChange={event => change({ ...draft, [key]: event.target.value })} /></label>;
  return <div className="object-measurement-controls">
    <label className="object-toggle">Unknown reading<input aria-label="Unknown reading" type="checkbox" checked={draft.unknown} onChange={event => change({ ...draft, unknown: event.target.checked })} /></label>
    <div className="measurement-value-control"><div className="measurement-value-heading"><label htmlFor={valueId}>Value</label><output aria-label="Current measurement">{text}</output></div><input id={valueId} aria-label="Measurement value" aria-valuetext={text} type="range" min={min} max={max} step={step} value={Math.max(min, Math.min(max, Number(draft.value)))} disabled={draft.unknown} onChange={event => change({ ...draft, value: event.target.value })} /></div>
    <div className="measurement-range">{field('min', 'Minimum')}{field('max', 'Maximum')}</div>
    <label>Unit<input aria-label="Measurement unit" type="text" maxLength={40} value={draft.unit} onChange={event => change({ ...draft, unit: event.target.value })} /></label>
    {field('target', 'Target (optional)')}
    <div className="measurement-bands"><strong>Threshold bands</strong>{draft.bands.map((band, index) => <div className="measurement-band" key={index}>
      <input aria-label={`Band ${index + 1} from`} type="number" step="any" value={band.from} onChange={event => change({ ...draft, bands: draft.bands.map((item, i) => i === index ? { ...item, from: event.target.value } : item) })} />
      <input aria-label={`Band ${index + 1} to`} type="number" step="any" value={band.to} onChange={event => change({ ...draft, bands: draft.bands.map((item, i) => i === index ? { ...item, to: event.target.value } : item) })} />
      <select aria-label={`Band ${index + 1} state`} value={band.state} onChange={event => change({ ...draft, bands: draft.bands.map((item, i) => i === index ? { ...item, state: event.target.value as MeasurementBand['state'] } : item) })}><option value="normal">Normal</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
      <button type="button" title="Remove band" aria-label={`Remove band ${index + 1}`} onClick={() => change({ ...draft, bands: draft.bands.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
    </div>)}<button type="button" disabled={draft.bands.length >= 12} onClick={() => {
      const bands = [...draft.bands], last = bands[bands.length - 1];
      if (last && Number(last.to) === Number(draft.max)) { const midpoint = String((Number(last.from) + Number(last.to)) / 2); bands[bands.length - 1] = { ...last, to: midpoint }; bands.push({ from: midpoint, to: last.to, state: 'warning' }); }
      else bands.push({ from: last?.to ?? draft.min, to: draft.max, state: 'warning' });
      change({ ...draft, bands });
    }}><Plus size={14} />Add band</button></div>
    {error && <p role="alert">{error} The last valid configuration is retained.</p>}
  </div>;
}

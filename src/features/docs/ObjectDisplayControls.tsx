'use client';
import { formatDisplay, type DisplayReading } from '@opsorama/core';

export function ObjectDisplayControls({ reading, onChange }: { reading: DisplayReading; onChange(reading: DisplayReading): void }) {
  return <div className="object-display-controls">
    {reading.kind === 'number' ? <>
      <label>Value<input aria-label="Display value" type="number" min={-9999.99} max={9999.99} step="any" value={reading.value ?? ''} disabled={reading.value === null} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && Math.abs(value) <= 9999.99) onChange({ ...reading, value }); }} /></label>
      <label>Decimal places<select aria-label="Display decimals" value={reading.decimals ?? 0} onChange={event => onChange({ ...reading, decimals: Number(event.target.value) as 0 | 1 | 2 })}>{[0, 1, 2].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Unknown<input aria-label="Display unknown" type="checkbox" checked={reading.value === null} onChange={event => onChange({ ...reading, value: event.target.checked ? null : 0 })} /></label>
    </> : <>
      <label>{reading.kind === 'clock' ? 'Seconds since midnight' : 'Duration in seconds'}<input aria-label="Display seconds" type="number" min={0} max={reading.kind === 'clock' ? 86399 : 359999} step={1} value={reading.seconds} onChange={event => { const seconds = event.target.valueAsNumber; if (Number.isInteger(seconds) && seconds >= 0 && seconds <= (reading.kind === 'clock' ? 86399 : 359999)) onChange({ ...reading, seconds }); }} /></label>
      <label>Run preview<input aria-label="Display running" type="checkbox" checked={!!reading.running} onChange={event => onChange({ ...reading, running: event.target.checked })} /><small>Requires scene animation. Uses visual time; the host owns actual timekeeping.</small></label>
    </>}
    <p aria-label="Configured display reading">{formatDisplay(reading)}</p>
  </div>;
}

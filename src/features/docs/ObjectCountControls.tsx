'use client';
import { resolveCountRepresentation, type AssetCountDefinition } from '@opsorama/core';
import { useState } from 'react';

export function ObjectCountControls({ definition, count, multiplier, onChange, showMultiplier = true }: { definition: AssetCountDefinition; count: number; multiplier: number; onChange: (count: number, multiplier: number) => void; showMultiplier?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const representation = resolveCountRepresentation({ count, multiplier }, definition);
  function change(nextCount: number, nextMultiplier: number) {
    try { resolveCountRepresentation({ count: nextCount, multiplier: nextMultiplier }, definition); setError(null); onChange(nextCount, nextMultiplier); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  return <div className="object-count-controls">
    <label>{definition.label}<strong>{count}</strong>{definition.kind === 'range' ? <><input aria-label="Object count" type="range" min={definition.min} max={definition.max} step={definition.step} value={count} onChange={event => change(Number(event.target.value), multiplier)} /><small>{definition.min}–{definition.max}, whole counts only</small></> : <select aria-label="Object count variant" value={count} onChange={event => change(Number(event.target.value), multiplier)}>{definition.values.map(value => <option key={value} value={value}>{value} blocks</option>)}</select>}</label>
    {showMultiplier && <><label>Units per visible part<input aria-label="Object multiplier" type="number" min={1} max={Math.floor(Number.MAX_SAFE_INTEGER / Math.max(1, count))} step={1} value={multiplier} onChange={event => change(count, Number(event.target.value))} /></label>
    <div className="object-count-total" role="status"><span>SYMBOLIC QUANTITY</span><strong>{representation.total.toLocaleString('en-US')} {definition.unit}</strong><small>{count} × {multiplier.toLocaleString('en-US')} · geometry stays bounded</small></div></>}
    {error && <p role="alert">{error} The last valid configuration is retained.</p>}
  </div>;
}

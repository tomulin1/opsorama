'use client';
import { useState } from 'react';
import { resolveFootprint, type Footprint, type FootprintDefinition } from '@opsorama/core';

export function SurfaceFootprint({ definition, value, onChange }: { definition: FootprintDefinition; value: Footprint; onChange: (footprint: Footprint) => void }) {
  const [drafts, setDrafts] = useState(() => value.map(String)), [error, setError] = useState<string>();
  const range = (axis: number) => `${definition.min[axis]}–${definition.max[axis]} m`;
  function change(index: number, text: string) {
    const next = drafts.map((draft, axis) => axis === index ? text : draft); setDrafts(next);
    try {
      const footprint = next.map(draft => draft.trim() ? Number(draft) : NaN) as unknown as Footprint;
      resolveFootprint({ footprint }, definition); setError(undefined); onChange(footprint);
    } catch { setError(`Width must be ${range(0)} and depth ${range(1)}. The last valid footprint is retained.`); }
  }
  return <div className="object-count-controls building-dimensions">
    {(['Width', 'Depth'] as const).map((name, axis) => {
      const number = Number(drafts[axis]);
      return <label key={name}>{name} (m)<input aria-label={`Surface ${name.toLowerCase()}`} type="number" min={definition.min[axis]} max={definition.max[axis]} step="any" value={drafts[axis]} aria-invalid={!drafts[axis].trim() || !Number.isFinite(number) || number < definition.min[axis] || number > definition.max[axis]} onChange={event => change(axis, event.target.value)} /></label>;
    })}
    <small>Width {range(0)}, depth {range(1)}. Patterns keep their real size.</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}

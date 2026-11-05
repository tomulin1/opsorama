'use client';
import { useState } from 'react';
import { validateBuilding, type Vec3 } from '@opsorama/core';

export function BuildingDimensions({ size, onChange }: { size: Vec3; onChange: (size: Vec3) => void }) {
  const [drafts, setDrafts] = useState(() => size.map(String)), [error, setError] = useState<string>();
  function change(index: number, value: string) {
    const next = drafts.map((draft, axis) => axis === index ? value : draft); setDrafts(next);
    try {
      const dimensions = next.map(draft => draft.trim() ? Number(draft) : NaN) as [number, number, number];
      validateBuilding({ size: dimensions }); setError(undefined); onChange(dimensions);
    } catch { setError('Each dimension must be between 2 and 100 m. The last valid size is retained.'); }
  }
  return <div className="object-count-controls building-dimensions">
    {(['Width', 'Height', 'Depth'] as const).map((name, index) => <label key={name}>{name} (m)<input aria-label={`Building ${name.toLowerCase()}`} type="number" min={2} max={100} step="any" value={drafts[index]} aria-invalid={!drafts[index].trim() || !Number.isFinite(Number(drafts[index])) || Number(drafts[index]) < 2 || Number(drafts[index]) > 100} onChange={event => change(index, event.target.value)} /></label>)}
    <small>2–100 m per dimension. Interior objects keep their local positions.</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}

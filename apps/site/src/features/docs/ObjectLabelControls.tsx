'use client';
import { useState } from 'react';
import { validateSurfaceLabel, type SurfaceLabel } from '@opsorama/core';
import { validateLabelSvg, type LabelSurface } from '@opsorama/renderer-three';

export const SAMPLE_LABEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"><rect x="4" y="4" width="52" height="52" rx="12" fill="#497bec"/><path d="M16 30h28M30 16v28" stroke="#ffffff" stroke-width="6"/><text x="70" y="40" font-family="sans-serif" font-size="30" font-weight="600" fill="#243650">NORTH</text></svg>';

export function ObjectLabelControls({ surface, onChange }: { surface: LabelSurface; onChange: (label: SurfaceLabel | undefined) => void }) {
  const [mode, setMode] = useState<'none' | 'text' | 'svg'>('none');
  const [text, setText] = useState('NORTH'), [svg, setSvg] = useState(SAMPLE_LABEL_SVG), [alt, setAlt] = useState('North logo');
  const [color, setColor] = useState('#243650'), [background, setBackground] = useState('#fffaf2'), [error, setError] = useState('');
  function update(next: { mode?: typeof mode; text?: string; svg?: string; alt?: string; color?: string; background?: string } = {}) {
    const kind = next.mode ?? mode;
    if (kind === 'none') { setError(''); onChange(undefined); return; }
    const label: SurfaceLabel = kind === 'text' ? { kind, text: next.text ?? text, ...(surface.multiline ? { layout: 'multiline' as const } : {}), color: next.color ?? color, background: next.background ?? background } : { kind, svg: next.svg ?? svg, alt: next.alt ?? alt, background: next.background ?? background };
    try { validateSurfaceLabel(label); if (label.kind === 'svg') validateLabelSvg(label.svg); setError(''); onChange(label); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }
  return <fieldset className="object-label-controls"><legend>Surface label</legend><p>{surface.description}</p>
    <label>Content<select aria-label="Surface label type" value={mode} onChange={event => { const next = event.target.value as typeof mode; setMode(next); update({ mode: next }); }}><option value="none">None</option><option value="text">Text</option><option value="svg">SVG artwork</option></select></label>
    {mode === 'text' && <><label>Text<>{surface.multiline ? <textarea aria-label="Surface label text" rows={6} maxLength={480} value={text} onChange={event => { setText(event.target.value); update({ text: event.target.value }); }} /> : <input aria-label="Surface label text" maxLength={80} value={text} onChange={event => { setText(event.target.value); update({ text: event.target.value }); }} />}</></label><label>Text color<input aria-label="Surface label text color" type="color" value={color} onChange={event => { setColor(event.target.value); update({ color: event.target.value }); }} /></label></>}
    {mode === 'svg' && <><label>SVG markup<textarea aria-label="Surface label SVG" rows={6} maxLength={20000} spellCheck={false} value={svg} onChange={event => { setSvg(event.target.value); update({ svg: event.target.value }); }} /></label>
      <label>SVG file<input aria-label="Upload surface label SVG" type="file" accept=".svg,image/svg+xml" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 20000) { setError('SVG files must be at most 20 KB.'); return; } try { const source = await file.text(); setSvg(source); setMode('svg'); update({ mode: 'svg', svg: source }); } catch { setError('The SVG file could not be read.'); } }} /></label>
      <label>Text alternative<input aria-label="Surface label alternative" maxLength={80} value={alt} onChange={event => { setAlt(event.target.value); update({ alt: event.target.value }); }} /></label><small>Static shapes and text with a viewBox. Convert styled logos to inline presentation attributes. Scripts, images, external resources and animation are unsupported.</small></>}
    {mode !== 'none' && <label>Background<input aria-label="Surface label background" type="color" value={background} onChange={event => { setBackground(event.target.value); update({ background: event.target.value }); }} /></label>}
    {error && <p role="alert">{error} The preview keeps the last valid label.</p>}
  </fieldset>;
}

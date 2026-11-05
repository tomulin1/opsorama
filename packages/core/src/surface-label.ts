/** Static artwork attached to a model; independent of its projected HTML label. */
export type SurfaceLabel = (
  | { kind: 'text'; text: string; color?: string; layout?: 'single-line' | 'multiline' }
  | { kind: 'svg'; svg: string; alt: string }
) & { background?: string };

export function validateSurfaceLabel(label: SurfaceLabel): void {
  if (!label || !['text', 'svg'].includes(label.kind)) throw new Error('Unknown surface label kind.');
  const text = label.kind === 'text' ? label.text : label.alt;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Surface label text must not be empty.');
  if (label.kind === 'text' && label.layout !== undefined && !['single-line', 'multiline'].includes(label.layout)) throw new Error('Unknown surface text layout.');
  if (label.kind === 'text' && label.layout === 'multiline') {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (text.length > 480 || lines.length > 6 || lines.some(line => line.length > 80 || /\r/.test(line))) throw new Error('Multiline labels support up to six lines, 80 characters per line and 480 total.');
  } else if (text.length > 80 || /[\r\n]/.test(text)) throw new Error('Surface label text must contain 1–80 characters on one line.');
  for (const color of [label.background, label.kind === 'text' ? label.color : undefined]) {
    if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Surface label colors must use #RRGGBB.');
  }
  if (label.kind === 'svg' && (typeof label.svg !== 'string' || !label.svg.trim() || label.svg.length > 20_000)) throw new Error('Surface label SVG must contain 1–20,000 characters.');
}

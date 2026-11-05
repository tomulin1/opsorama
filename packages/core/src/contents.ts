/** Host-supplied line quantities; generic shapes do not imply physical unit identities. */
export interface ContentLine { id: string; title: string; quantity: number; color?: string; }
export interface ContainerContents { lines: readonly ContentLine[]; }
export function validateContents(contents: ContainerContents): void {
  if (!contents || !Array.isArray(contents.lines)) throw new Error('Contents require lines.');
  const ids = new Set<string>(); let total = 0;
  for (const line of contents.lines) {
    if (!line.id?.trim() || ids.has(line.id) || !line.title?.trim()) throw new Error('Content lines need unique IDs and titles.');
    ids.add(line.id);
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) throw new Error('Content quantities must be non-negative safe integers.');
    if (line.color !== undefined && !/^#[0-9a-f]{6}$/i.test(line.color)) throw new Error('Content colors must be #RRGGBB.');
    total += line.quantity; if (!Number.isSafeInteger(total)) throw new Error('Content total exceeds safe integer range.');
  }
}
/** Bounded visible proxies with an explicit remainder, without allocating an array per source unit. */
export function projectContents(contents: ContainerContents, capacity: number) {
  validateContents(contents);
  if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > 27) throw new Error('Content capacity must be 0–27.');
  const visible: ContentLine[] = []; let total = 0;
  for (const line of contents.lines) {
    total += line.quantity;
    const count = Math.min(line.quantity, capacity - visible.length);
    for (let index = 0; index < count; index++) visible.push(line);
  }
  return { visible, total, overflow: total - visible.length };
}
export function contentsLabel(contents: ContainerContents, capacity: number): string {
  const { total, overflow, visible } = projectContents(contents, capacity);
  return `${total} item${total === 1 ? '' : 's'}${overflow ? ` · ${visible.length} shown +${overflow} in detail` : ''}`;
}

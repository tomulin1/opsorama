import { MARKER_SHAPES, type MarkerIconName, type MarkerNode, type MarkerShape, type MarkerTone, type SceneNode, type SceneSettings } from '@opsorama/core';

/**
 * Scene for the marker examples: one configurable marker on a cabinet's `top` anchor, and a gallery
 * row with every shape in the tone and icon it usually carries. All three adapters mount these nodes.
 */
export const markerStage: readonly SceneNode[] = [
  { id: 'floor', kind: 'ground', size: [20, 10], position: [0, 0, 0], color: '#e4ebf2' },
  { id: 'cabinet', kind: 'asset', asset: 'equipment-cabinet', count: 8, position: [0, 0, -1.6], label: 'Rack A02', labelMode: 'active', selectable: true },
];

/** The marker the controls change. It follows the cabinet's roof through its `top` anchor. */
export const defaultFeaturedMarker: MarkerNode = {
  id: 'featured', kind: 'marker', attachment: { nodeId: 'cabinet', anchor: 'top' }, shape: 'pin', tone: 'critical', icon: 'thermometer',
  eyebrow: 'Critical', label: 'High inlet temperature', detail: '34.8 °C · policy > 30 °C', selectable: true,
};

/** A conventional tone and icon for each shape, shown in the gallery row. */
export const markerShapeExamples: Readonly<Record<MarkerShape, { tone: MarkerTone; icon: MarkerIconName; label: string }>> = Object.freeze({
  pin: { tone: 'info', icon: 'package', label: 'Pin · a place or object' },
  circle: { tone: 'success', icon: 'check', label: 'Circle · status' },
  square: { tone: 'info', icon: 'info', label: 'Square · notice' },
  diamond: { tone: 'warning', icon: 'zap', label: 'Diamond · hazard' },
  triangle: { tone: 'warning', icon: 'alert', label: 'Triangle · caution' },
  hexagon: { tone: 'neutral', icon: 'wrench', label: 'Hexagon · maintenance' },
  octagon: { tone: 'critical', icon: 'x', label: 'Octagon · stop' },
  shield: { tone: 'info', icon: 'lock', label: 'Shield · security' },
});

/** Scene settings shared by the three mounts: a closer camera than the default fit, no shadows. */
export const markerSceneSettings: Partial<SceneSettings> = { shadows: false, zoom: 2.4 };

/** Gallery markers, 2.2 m apart along the front of the floor. Badges float 0.8 m up; pins point at the floor. */
export const markerGallery: readonly MarkerNode[] = MARKER_SHAPES.map((shape, index) => ({
  id: `gallery-${shape}`, kind: 'marker', shape, ...markerShapeExamples[shape], position: [(index - 3.5) * 2.2, shape === 'pin' ? 0 : .8, 2.6], selectable: true,
}));

/** A marker's fields without `kind`, as the React and Vue `Marker` components take them. */
export const markerProps = (node: MarkerNode): Omit<MarkerNode, 'kind'> => Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'kind')) as Omit<MarkerNode, 'kind'>;

/** Every node of the example with the featured marker as configured. */
export const markerSceneNodes = (featured: MarkerNode): SceneNode[] => [...markerStage, featured, ...markerGallery];

/** Copyable snippet for the configured marker in each adapter. Only set fields are written. */
export function markerSnippet(marker: MarkerNode, framework: 'react' | 'vue' | 'javascript'): string {
  const fields = Object.entries(marker).filter(([key]) => key !== 'kind' && key !== 'id');
  const value = (entry: unknown): string => typeof entry === 'string' ? `'${entry.replace(/'/g, "\\'")}'` : Array.isArray(entry) ? `[${entry.map(value).join(', ')}]`
    : entry && typeof entry === 'object' ? `{ ${Object.entries(entry).map(([key, item]) => `${key}: ${value(item)}`).join(', ')} }` : String(entry);
  if (framework === 'javascript') return `store.upsert({\n  id: '${marker.id}', kind: 'marker',\n${fields.map(([key, entry]) => `  ${key}: ${value(entry)},`).join('\n')}\n});`;
  const attributes = fields.map(([key, entry]) => typeof entry === 'string' ? `${key}="${entry}"` : typeof entry === 'boolean' && entry ? key : framework === 'react' ? `${key}={${value(entry)}}` : `:${key}="${value(entry)}"`);
  return `<Marker id="${marker.id}"\n  ${attributes.join('\n  ')} />`;
}

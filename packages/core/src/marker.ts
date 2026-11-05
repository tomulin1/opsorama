import type { VisualState } from './index';

/**
 * Silhouettes of a scene marker. `pin` points down at its node's position; every other shape is a
 * badge centred on it. Shapes carry conventional meaning, but the host chooses: `triangle` and
 * `diamond` for caution, `octagon` for stop, `shield` for security, `circle`, `square` and
 * `hexagon` for neutral status or categories.
 */
export const MARKER_SHAPES = Object.freeze(['pin', 'circle', 'square', 'diamond', 'triangle', 'hexagon', 'octagon', 'shield'] as const);
export type MarkerShape = typeof MARKER_SHAPES[number];

/** Semantic colour of a marker. `critical`, `warning`, `success` and `info` read the scene palette roles `critical`, `warning`, `normal` and `accent`. */
export const MARKER_TONES = Object.freeze(['critical', 'warning', 'success', 'info', 'neutral'] as const);
export type MarkerTone = typeof MARKER_TONES[number];

/** Built-in icons, drawn white inside the shape. `none` leaves the shape plain. */
export const MARKER_ICONS = Object.freeze(['alert', 'info', 'check', 'x', 'thermometer', 'network', 'plug', 'zap', 'droplet', 'flame', 'lock', 'wrench', 'clock', 'wifi-off', 'package', 'user', 'bell', 'none'] as const);
export type MarkerIconName = typeof MARKER_ICONS[number];
/** A custom icon: stroked SVG path data in a 24 × 24 view box, like the built-in set. At most 8 paths of 1,000 characters. */
export interface MarkerCustomIcon { paths: readonly string[] }
export type MarkerIcon = MarkerIconName | MarkerCustomIcon;

/** Rendered marker sizes: the shape's width in CSS pixels. A pin is 1.25 times as tall as it is wide. */
export const MARKER_SIZES = Object.freeze({ small: 24, medium: 32, large: 40 } as const);
export type MarkerSize = keyof typeof MARKER_SIZES;

/**
 * A projected HTML marker with no geometry, such as an alert over a rack. Place it with `position`,
 * or follow a node with `attachment` (for example its `top` anchor). `label` is required: it is the
 * card title and part of the accessible name.
 *
 * The marker stays the same size at every zoom, is never moved or hidden to avoid other labels, and
 * other labels make way for it. Hover, keyboard focus and selection open its card above it.
 */
export interface MarkerFields {
  /** Default `pin`. */
  shape?: MarkerShape;
  /** Default from `state`: critical → critical, warning → warning, inactive → neutral, otherwise info. */
  tone?: MarkerTone;
  /** Default by tone: alert for critical and warning, check for success, info otherwise. */
  icon?: MarkerIcon;
  /** CSS colour replacing the tone's fill. The icon and rim stay white, so choose a colour that keeps contrast. */
  color?: string;
  /** Default `medium` (32 px wide). Named apart from a zone's `size` in metres. */
  markerSize?: MarkerSize;
  /** Small caps line above the title in the card, such as a severity. 1–40 characters. */
  eyebrow?: string;
  /** Line under the title in the card, such as a reading. 1–160 characters. */
  detail?: string;
  /**
   * Pulse a ring around the shape to draw attention. Default true for critical, false otherwise.
   * It never runs while scene motion is off, the scene is paused or the user prefers reduced motion.
   */
  pulse?: boolean;
}

const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;

/** Throws a message that names the field and the fix. Called by `validateNode` for every marker node. */
export function validateMarker(node: MarkerFields & { id: string; label?: string }): void {
  const fail = (message: string) => { throw new Error(`Marker ${node.id}: ${message}`); };
  if (typeof node.label !== 'string' || !node.label.trim() || node.label.length > 120) fail('label is required, 1–120 characters; it is the card title and accessible name.');
  if (node.shape !== undefined && !MARKER_SHAPES.includes(node.shape)) fail(`unknown shape "${node.shape}"; use one of ${MARKER_SHAPES.join(', ')}.`);
  if (node.tone !== undefined && !MARKER_TONES.includes(node.tone)) fail(`unknown tone "${node.tone}"; use one of ${MARKER_TONES.join(', ')}.`);
  if (node.markerSize !== undefined && !Object.hasOwn(MARKER_SIZES, node.markerSize)) fail(`unknown markerSize "${node.markerSize}"; use small, medium or large.`);
  if (typeof node.icon === 'string' && !MARKER_ICONS.includes(node.icon)) fail(`unknown icon "${node.icon}"; use one of ${MARKER_ICONS.join(', ')}, or { paths } for a custom icon.`);
  if (node.icon !== undefined && typeof node.icon !== 'string') {
    const paths = (node.icon as { paths?: unknown }).paths;
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > 8) fail('a custom icon needs 1–8 paths.');
    for (const path of paths as unknown[]) if (typeof path !== 'string' || path.length > 1000 || !PATH_DATA.test(path)) fail('custom icon paths must be SVG path data (commands and numbers only), at most 1,000 characters each.');
  }
  if (node.color !== undefined && (typeof node.color !== 'string' || !node.color.trim())) fail('color must be a CSS colour string.');
  if (node.eyebrow !== undefined && (typeof node.eyebrow !== 'string' || !node.eyebrow.trim() || node.eyebrow.length > 40)) fail('eyebrow must be 1–40 characters.');
  if (node.detail !== undefined && (typeof node.detail !== 'string' || !node.detail.trim() || node.detail.length > 160)) fail('detail must be 1–160 characters.');
  if (node.pulse !== undefined && typeof node.pulse !== 'boolean') fail('pulse must be a boolean.');
}

/** The tone a marker renders with: its own, or one derived from the node state. */
export function resolveMarkerTone(marker: Pick<MarkerFields, 'tone'>, state?: VisualState): MarkerTone {
  return marker.tone ?? (state === 'critical' ? 'critical' : state === 'warning' ? 'warning' : state === 'inactive' ? 'neutral' : 'info');
}

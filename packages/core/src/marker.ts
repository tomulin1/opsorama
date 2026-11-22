import type { VisualState } from './index';
import { collectProblems, throwOnErrors } from './scene-problems';
import { markerChecks } from './validate-scene';

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
export interface MarkerCustomIcon {
  /**
   * 1–8 strings of SVG path data.
   * @minItems 1
   * @maxItems 8
   */
  paths: readonly SvgPathData[];
}
/**
 * SVG path data: path commands and numbers only, at most 1,000 characters.
 * @maxLength 1000
 * @pattern ^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$
 */
type SvgPathData = string;
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
  /**
   * CSS colour replacing the tone's fill. The icon and rim stay white, so choose a colour that keeps contrast.
   * @pattern \S
   */
  color?: string;
  /** Default `medium` (32 px wide). Named apart from a zone's `size` in metres. */
  markerSize?: MarkerSize;
  /**
   * Small caps line above the title in the card, such as a severity. 1–40 characters.
   * @minLength 1
   * @maxLength 40
   * @pattern \S
   */
  eyebrow?: string;
  /**
   * Line under the title in the card, such as a reading. 1–160 characters.
   * @minLength 1
   * @maxLength 160
   * @pattern \S
   */
  detail?: string;
  /**
   * Pulse a ring around the shape to draw attention. Default true for critical, false otherwise.
   * It never runs while scene motion is off, the scene is paused or the user prefers reduced motion.
   */
  pulse?: boolean;
}

/** Throws `SceneValidationError` with a message that names the field and the fix. Called by `validateNode` for every marker node. */
export function validateMarker(node: MarkerFields & { id: string; label?: string }): void {
  throwOnErrors(collectProblems(add => markerChecks(node as unknown as Record<string, unknown>, '', add)));
}

/** The tone a marker renders with: its own, or one derived from the node state. */
export function resolveMarkerTone(marker: Pick<MarkerFields, 'tone'>, state?: VisualState): MarkerTone {
  return marker.tone ?? (state === 'critical' ? 'critical' : state === 'warning' ? 'warning' : state === 'inactive' ? 'neutral' : 'info');
}

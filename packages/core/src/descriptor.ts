import { MATERIAL_ROLES, type MaterialRole } from './palette';
import type { AssetNode, VisualState } from './index';

/**
 * The common object contract (C1): one typed, serializable description of a
 * catalog definition, covering identity, geometry, palette, customization,
 * state, motion, interaction, lifecycle and evidence. The renderer package
 * declares descriptors next to its factories and verifies them against the
 * built model; the catalog website renders the same data.
 */
export interface ObjectDescriptor {
  /** Registry key, e.g. `parcel`. */
  asset: string;
  name: string;
  category: string;
  purpose: string;
  /** Contract version; changes when a field's meaning changes. */
  version: 1;
  geometry: GeometryDescriptor;
  palette: PaletteDescriptor;
  customization: readonly OptionDescriptor[];
  states: StateDescriptor;
  motion: MotionDescriptor;
  interaction: InteractionDescriptor;
  lifecycle: LifecycleDescriptor;
  evidence: EvidenceDescriptor;
}

export interface Bounds { min: readonly [number, number, number]; max: readonly [number, number, number]; }
/** Node fields that select a configuration, as JSON data (e.g. `{ count: 27, countLayout: 'reserved' }`). */
export type NodeSample = Readonly<Partial<Omit<AssetNode, 'id' | 'kind' | 'asset'>>>;

export interface GeometryDescriptor {
  /** `metres` for physical size; `process-scale` when size encodes a stage, not a real object. */
  units: 'metres' | 'process-scale';
  /**
   * `base-center`: the bounds are centred on the pivot in x and z.
   * `stance`: the pivot is the floor point under a standing or seated body; x is
   * centred, and reach or a held load may extend the bounds forward (+z).
   * `model-origin`: preserves an existing asymmetric, elevated or inset origin;
   * the geometry note must explain its location. Bounds are relative to it.
   */
  pivot: 'base-center' | 'stance' | 'model-origin';
  forward: '+z';
  up: '+y';
  /** Model-local bounds of the default configuration. */
  bounds: Bounds;
  /** Largest configuration and its bounds, when options change the size. */
  largest?: { node: NodeSample; bounds: Bounds };
  note?: string;
}

export interface PaletteRoleUse {
  role: MaterialRole;
  /** Which parts use the role, in words. */
  parts: string;
  /** Configuration in which the role appears, when it is not always visible. */
  when?: NodeSample;
}
export interface PaletteDescriptor {
  roles: readonly PaletteRoleUse[];
  /** Role(s) that legacy `AssetNode.color` sets; an array preserves multi-part mappings. Absent when unsupported. */
  colorRole?: MaterialRole | readonly MaterialRole[];
  /** Parts with fixed colors that no role changes, if any. */
  fixed?: string;
}

export interface OptionDescriptor {
  /** `AssetNode` field. */
  field: string;
  type: string;
  default: string;
  /** `rebuild`: a change rebuilds the model; `transform`: applied to the root without a rebuild. */
  update: 'rebuild' | 'transform';
  description: string;
  /** Values the conformance check builds, as JSON data. */
  samples?: readonly NodeSample[];
}

export interface StateDescriptor {
  /** States with a visible mapping. */
  shown: readonly VisualState[];
  /** States accepted without a visual change. */
  unchanged: readonly VisualState[];
  parts: string;
  /** How meaning is available without color, e.g. the label or an HTML list. */
  alternative: string;
}

export interface MotionDescriptor {
  /** `none`: the model never animates itself; `local`: it has a built-in animator on the scene clock. */
  animation: 'none' | 'local';
  staticPose: string;
  /** How the root moves to a new record position; routes and controllers take over when present. */
  transform: string;
  policy: string;
}

export interface AnchorDescriptor {
  name: string;
  purpose: string;
  /** Configurations that have the anchor, when not every configuration does. */
  when?: readonly NodeSample[];
}
export interface InteractionDescriptor {
  selectable: string;
  /** Hit area for picking. */
  hit: string;
  anchors: readonly AnchorDescriptor[];
  /** Interaction slot names, when the model declares slots. */
  slots: readonly string[];
  relationships: string;
}

export interface LifecycleDescriptor {
  ownership: 'instance';
  /** Instance-owned textures, e.g. surface-label artwork, or `none`. */
  textures: string;
  animator: boolean;
  update: string;
  disposal: string;
}

export interface EvidenceDescriptor {
  examples: readonly string[];
  tests: readonly string[];
  limits: readonly string[];
}

const nonEmpty = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const finiteBounds = (bounds: Bounds) => [...bounds.min, ...bounds.max].every(Number.isFinite) && bounds.min.every((value, axis) => value <= bounds.max[axis]);

/** Structural checks; `checkAssetDescriptor` in the renderer package checks the descriptor against the model. */
export function validateObjectDescriptor(descriptor: ObjectDescriptor): void {
  const label = `Descriptor ${descriptor?.asset ?? '?'}`;
  for (const field of ['asset', 'name', 'category', 'purpose'] as const) if (!nonEmpty(descriptor[field])) throw new Error(`${label}: ${field} must not be empty.`);
  if (descriptor.version !== 1) throw new Error(`${label}: unsupported version.`);
  const { geometry, palette, customization, states, motion, interaction, lifecycle, evidence } = descriptor;
  if (!['base-center', 'stance', 'model-origin'].includes(geometry.pivot)) throw new Error(`${label}: unknown pivot ${String(geometry.pivot)}.`);
  if (geometry.pivot === 'model-origin' && !nonEmpty(geometry.note)) throw new Error(`${label}: model-origin needs a note explaining the preserved origin.`);
  if (!finiteBounds(geometry.bounds) || geometry.largest && !finiteBounds(geometry.largest.bounds)) throw new Error(`${label}: bounds must be finite with min ≤ max.`);
  if (!palette.roles.length) throw new Error(`${label}: declare at least one palette role.`);
  for (const use of palette.roles) if (!MATERIAL_ROLES.includes(use.role) || !nonEmpty(use.parts)) throw new Error(`${label}: unknown palette role ${String(use.role)} or missing parts.`);
  if (palette.colorRole !== undefined) {
    const roles = typeof palette.colorRole === 'string' ? [palette.colorRole] : palette.colorRole;
    if (!roles.length || new Set(roles).size !== roles.length || roles.some(role => !palette.roles.some(use => use.role === role))) throw new Error(`${label}: colorRole must name unique declared roles.`);
  }
  const fields = new Set<string>();
  for (const option of customization) {
    if (!nonEmpty(option.field) || fields.has(option.field)) throw new Error(`${label}: customization fields must be unique.`);
    fields.add(option.field);
    if (!['rebuild', 'transform'].includes(option.update) || !nonEmpty(option.description)) throw new Error(`${label}: option ${option.field} needs an update mode and a description.`);
  }
  const known: readonly VisualState[] = ['normal', 'busy', 'warning', 'critical', 'inactive'];
  const listed = [...states.shown, ...states.unchanged];
  if (listed.length !== known.length || !known.every(state => listed.includes(state))) throw new Error(`${label}: list every visual state once, as shown or unchanged.`);
  if (!nonEmpty(states.alternative)) throw new Error(`${label}: states need a non-color alternative.`);
  if (!['none', 'local'].includes(motion.animation) || !nonEmpty(motion.staticPose) || !nonEmpty(motion.policy)) throw new Error(`${label}: motion needs an animation class, static pose and policy.`);
  if ((motion.animation === 'local') !== lifecycle.animator) throw new Error(`${label}: lifecycle.animator must match motion.animation.`);
  const anchors = new Set<string>();
  for (const anchor of interaction.anchors) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(anchor.name) || anchors.has(anchor.name) || !nonEmpty(anchor.purpose)) throw new Error(`${label}: anchors need unique names and a purpose.`);
    anchors.add(anchor.name);
  }
  if (lifecycle.ownership !== 'instance' || !nonEmpty(lifecycle.disposal)) throw new Error(`${label}: lifecycle must declare instance ownership and disposal.`);
  if (!evidence.examples.length || !evidence.tests.length) throw new Error(`${label}: evidence needs runnable examples and tests.`);
}

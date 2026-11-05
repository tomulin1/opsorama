import type { MaterialOverrides, SceneNode, Vec3, VisualState } from '@opsorama/core';

/** Two complete scene palettes for the parcel's declared roles; switching keeps every instance override. */
export const CONTRACT_PALETTES = {
  harbor: { surface: '#c9a27a', trim: '#f1e3c8', text: '#fffaf0', structure: '#5e6b7d', accent: '#4f86d9', warning: '#e6a84f', critical: '#d9535f' },
  meadow: { surface: '#9fc5a8', trim: '#e8f1d9', text: '#ffffff', structure: '#4d6b5a', accent: '#d98b4f', warning: '#e2b13c', critical: '#c94f5d' },
} as const satisfies Record<string, MaterialOverrides>;
export type ContractPalette = keyof typeof CONTRACT_PALETTES;

export interface ContractSettings {
  palette: ContractPalette;
  /** Partial instance roles on the main parcel; the rest keeps inheriting. */
  override: boolean;
  /** Legacy `color`, mapped to the surface role. */
  legacyColor: boolean;
  state: VisualState;
  variant: 'closed' | 'open';
  spot: 0 | 1;
}
export const DEFAULT_CONTRACT: ContractSettings = { palette: 'harbor', override: false, legacyColor: false, state: 'normal', variant: 'closed', spot: 0 };
export const CONTRACT_SPOTS: readonly Vec3[] = [[-2.2, 0, .6], [2.2, 0, .6]];
export const INSTANCE_OVERRIDE: MaterialOverrides = { trim: '#2f6fd6', text: '#ffd166' };
export const LEGACY_COLOR = '#b5653a';

/** The same scene in every adapter: a configurable order parcel and a reference parcel that only inherits. */
export function contractNodes(settings: ContractSettings): SceneNode[] {
  return [
    { id: 'floor', kind: 'ground', size: [10, 7] },
    {
      id: 'parcel-main', entityId: 'order-1001', kind: 'asset', asset: 'parcel', label: 'Order #1001', selectable: true,
      variant: settings.variant, state: settings.state, position: CONTRACT_SPOTS[settings.spot],
      ...(settings.legacyColor ? { color: LEGACY_COLOR } : {}), ...(settings.override ? { materials: INSTANCE_OVERRIDE } : {}),
    },
    { id: 'parcel-reference', kind: 'asset', asset: 'parcel', label: 'Inherits the scene palette', position: [0, 0, -2] },
  ];
}

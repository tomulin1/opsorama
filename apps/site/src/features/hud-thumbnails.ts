/** Catalog model keys used by the HUD. The capture script renders the same set to WebP. */
export const hudThumbnailModels = [
  'bar-counter', 'booth-seating', 'carton-flow-rack', 'chicken', 'chicken-coop', 'cow', 'crop-field',
  'desk-pod', 'dining-table', 'focus-pod', 'forklift', 'grain-silo', 'heated-pass', 'horse', 'kitchen-station',
  'lap-pool', 'led-display', 'lifeguard-chair', 'loading-dock', 'map-pin', 'meeting-table',
  'mobile-robot', 'pallet', 'pallet-rack', 'parcel', 'pickup-shelf', 'pig', 'pizza-oven',
  'rack-server', 'reach-truck', 'roll-cage', 'serving-plates', 'sheep', 'shelf', 'starting-block',
  'tractor', 'trough', 'truck', 'wading-pool', 'whiteboard', 'worker',
] as const;

export const hudThumbnailVariants = {
  'dining-table-round': ['dining-table', 'round'],
  'kitchen-station-prep': ['kitchen-station', 'prep'],
  'loading-dock-open': ['loading-dock', 'open'],
} as const;

export type HudThumbnailModel = typeof hudThumbnailModels[number] | keyof typeof hudThumbnailVariants;

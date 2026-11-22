/**
 * `@opsorama/objects/handling`: handling rules for movable units (which unit fits which place), the handling state that
 * tracks and checks placements, its item policy for the behavior runner, and optional move mode. This entry loads no
 * Three.js code: it imports only `@opsorama/core` and types of `@opsorama/three`. The catalog's declarations
 * (`assetHandling`, `handlingProfiles`, `checkAssetHandling`) come from `@opsorama/objects`.
 */
export * from './rules';
export * from './state';
export * from './move-mode';
export * from './item-policy';
export * from './bind-move-mode';

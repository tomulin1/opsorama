import { PERSON_ASSETS, type NavAgentRule } from '@opsorama/core';

const TURN_ANY = Math.PI / 4, TURN_SHARP = Math.PI * 2 / 3, TURN_NEVER = Math.PI;

/**
 * Default movement-graph agent rules for the catalog's mobile models: speed,
 * acceleration, corner speed, corner radius and turning. They are readable visual defaults at
 * dashboard scale, not vehicle specifications. Spread one into a graph's
 * `agents` and override any field, e.g.
 * `agents: { person: assetMotionProfiles.worker, vehicle: { ...assetMotionProfiles.forklift, speed: 2 } }`.
 *
 * People and differential-drive robots turn in place at sharp corners.
 * Steered vehicles never pivot: they slow down for corners and drive them as
 * arcs (`cornerRadius`), and their heading changes at the start and end of a
 * route are blended by the renderer. The pallet jack pivots only at sharp
 * corners and rounds the others.
 */
export const assetMotionProfiles: Readonly<Record<string, NavAgentRule>> = Object.freeze({
  // Every person asset walks like the worker.
  ...Object.fromEntries(PERSON_ASSETS.map(asset => [asset, { speed: 1.3, acceleration: 2.5, turnRate: 7, turnInPlaceAngle: TURN_ANY, cornerSpeed: .8 }])),
  'mobile-robot': { speed: 1.5, acceleration: 1, turnRate: 2.5, turnInPlaceAngle: Math.PI / 6 },
  'pallet-jack': { speed: 1.8, acceleration: .9, turnRate: 2, turnInPlaceAngle: TURN_SHARP, cornerSpeed: .6, cornerRadius: .6 },
  forklift: { speed: 3, acceleration: 1.2, turnInPlaceAngle: TURN_NEVER, cornerSpeed: .9, cornerRadius: 1.2 },
  'reach-truck': { speed: 2.5, acceleration: 1, turnInPlaceAngle: TURN_NEVER, cornerSpeed: .7, cornerRadius: 1 },
  'picking-cart': { speed: 1.1, acceleration: 1.5, turnRate: 3, turnInPlaceAngle: TURN_SHARP, cornerSpeed: .5 },
  'shopping-cart': { speed: 1.1, acceleration: 1.5, turnRate: 3, turnInPlaceAngle: TURN_SHARP, cornerSpeed: .5 },
  'baggage-cart': { speed: 3, acceleration: 1, turnInPlaceAngle: TURN_NEVER, cornerSpeed: 1.2, cornerRadius: 1.5 },
  'cargo-bike': { speed: 4, acceleration: 1.5, turnInPlaceAngle: TURN_NEVER, cornerSpeed: 2, cornerRadius: 1.5 },
  'delivery-van': { speed: 8, acceleration: 2, turnInPlaceAngle: TURN_NEVER, cornerSpeed: 3, cornerRadius: 5.5 },
  truck: { speed: 7, acceleration: 1.2, turnInPlaceAngle: TURN_NEVER, cornerSpeed: 2.5, cornerRadius: 8 },
  aircraft: { speed: 8, acceleration: .6, turnInPlaceAngle: TURN_NEVER, cornerSpeed: 2.5, cornerRadius: 10 },
} satisfies Record<string, NavAgentRule>);

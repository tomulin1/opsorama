import { HANDLING_FAMILY_LABELS, handlingFits, handlingVocabulary, receptacleAnchors, type HandlingAccepts, type HandlingFit, type HandlingSize, type Receptacle } from '@opsorama/core';
import { assetHandling, handlingProfiles } from '@opsorama/objects';
import { catalogObjects, type CatalogObject } from './objects';

/**
 * Catalog view of the declared handling compatibility. Everything here is derived from
 * `assetHandling` and `handlingProfiles` through `handlingFits`; nothing is written per page.
 */
export const catalogFits: readonly HandlingFit[] = handlingFits(assetHandling, handlingProfiles);
const vocabulary = handlingVocabulary(handlingProfiles);

/** Catalog entry of an asset key, for links. */
export function catalogEntryForAsset(asset: string): CatalogObject | undefined { return catalogObjects.find(item => item.asset === asset); }
export const assetName = (asset: string) => catalogEntryForAsset(asset)?.name ?? asset;

const metres = (value: number) => `${Number(value.toFixed(3))}`;
export const sizeText = (size: HandlingSize, scale = 1) => `${metres(size.footprint[0] * scale)} × ${metres(size.footprint[1] * scale)} × ${metres(size.height * scale)} m`;
const familiesText = (families: readonly string[]) => families.map(family => HANDLING_FAMILY_LABELS[family as keyof typeof HANDLING_FAMILY_LABELS] ?? family).join(', ');
/** `slot-0…slot-3` for consecutive numbered anchors, otherwise a comma list. */
export function anchorRange(names: readonly string[]): string {
  const parsed = names.map(name => /^(.*-)(\d+)$/.exec(name));
  if (names.length > 2 && parsed.every(match => match && match[1] === parsed[0]![1]) && parsed.every((match, i) => Number(match![2]) === Number(parsed[0]![2]) + i)) return `${names[0]}…${names[names.length - 1]}`;
  return names.join(', ');
}
const ACCESS: Readonly<Record<Receptacle['arrangement'], string>> = { slot: 'Any unit', stack: 'Top unit only', deck: 'Top layer only', rail: 'Any unit', bulk: 'Host contents lines' };
function acceptsText(accepts: HandlingAccepts): string {
  return accepts.classes ? accepts.classes.map(id => vocabulary.classes.get(id)?.name ?? id).join(', ') : `Any ${familiesText(accepts.families)}`;
}
function capacityText(receptacle: Receptacle): string {
  if (receptacle.arrangement === 'slot') return `${receptacle.anchors.length} ${receptacle.anchors.length === 1 ? 'slot' : 'slots'}, one unit each`;
  if (receptacle.arrangement === 'stack') return `Pile of up to ${receptacle.capacity}`;
  if (receptacle.arrangement === 'rail') return `${receptacle.positions} positions of ${Number(receptacle.pitch.toFixed(4))} m`;
  if (receptacle.arrangement === 'bulk') return 'No positions';
  return 'Layers up to the clear height';
}

export interface ReceptacleFacts {
  name: string; arrangement: Receptacle['arrangement']; anchors: string; capacity: string; envelope: string; access: string; accepts: string; reachedFrom?: string;
  patterns: readonly { id: string; name: string; units: number }[];
  units: readonly HandlingFit[];
}
export interface HandlingFacts {
  asset: string;
  unit?: { classId: string; className: string; profile: string; family: string; size: string; stacking: string; scale: number; variants: readonly string[] };
  /** Receptacles of other objects (or this one) that accept the unit and fit it. */
  fitsInto: readonly HandlingFit[];
  /** Receptacles that accept the unit's family but are too small. */
  tooLarge: readonly HandlingFit[];
  receptacles: readonly ReceptacleFacts[];
}

/** Compatibility facts for a catalog page, or null when the asset has no declaration. */
export function handlingFacts(asset: string): HandlingFacts | null {
  const handling = assetHandling[asset];
  if (!handling) return null;
  const unitClass = handling.unit && vocabulary.classes.get(handling.unit.class), scale = handling.unit?.scale ?? 1;
  const asUnit = catalogFits.filter(fit => fit.unit === asset);
  return {
    asset,
    ...(handling.unit && unitClass ? { unit: {
      classId: unitClass.id, className: unitClass.name, profile: handlingProfiles.find(entry => entry.classes.includes(unitClass))?.name ?? '', variants: Object.values(handling.unit.variants ?? {}), family: HANDLING_FAMILY_LABELS[unitClass.family], size: sizeText(unitClass.size), scale: handling.unit.scale,
      stacking: unitClass.stacking.maxAbove ? `Up to ${unitClass.stacking.maxAbove} ${unitClass.stacking.maxAbove === 1 ? 'unit' : 'units'} on top (${familiesText(unitClass.stacking.families)})` : 'Nothing on top',
    } } : {}),
    fitsInto: asUnit.filter(fit => fit.verdict === 'fits'),
    tooLarge: asUnit.filter(fit => fit.verdict === 'too-large'),
    receptacles: handling.receptacles.map(receptacle => ({
      name: receptacle.name, arrangement: receptacle.arrangement, anchors: anchorRange(receptacleAnchors(receptacle)), capacity: capacityText(receptacle),
      envelope: sizeText(receptacle.envelope, scale), access: ACCESS[receptacle.arrangement], accepts: acceptsText(receptacle.accepts),
      ...(receptacle.reachedFrom ? { reachedFrom: receptacle.reachedFrom } : {}),
      patterns: receptacle.arrangement === 'deck' ? receptacle.patterns.map(id => { const pattern = vocabulary.patterns.get(id)!; return { id, name: pattern.name, units: pattern.positions.length }; }) : [],
      units: catalogFits.filter(fit => fit.container === asset && fit.receptacle === receptacle.name),
    })),
  };
}

/** Short card tag, e.g. `Unit load · holds cases, soft packs`; undefined without a declaration. */
export function handlingTag(asset: string): string | undefined {
  const handling = assetHandling[asset];
  if (!handling) return undefined;
  const unitClass = handling.unit && vocabulary.classes.get(handling.unit.class);
  const held = [...new Set(handling.receptacles.flatMap(receptacle => receptacle.accepts.families))];
  const text = [unitClass && HANDLING_FAMILY_LABELS[unitClass.family], held.length && `holds ${familiesText(held)}`].filter(Boolean).join(' · ');
  return text[0].toUpperCase() + text.slice(1);
}

/** Assets with a handling declaration, in catalog order, for the "Compatible with" filter. */
export const handlingAssets: readonly string[] = catalogObjects.flatMap(item => item.asset && assetHandling[item.asset] ? [item.asset] : []);

/** Other assets that fit into `asset` or that `asset` fits into (verdict `fits` only). */
export function compatibleAssets(asset: string): ReadonlySet<string> {
  const related = new Set<string>();
  for (const fit of catalogFits) if (fit.verdict === 'fits') { if (fit.unit === asset) related.add(fit.container); if (fit.container === asset) related.add(fit.unit); }
  related.delete(asset);
  return related;
}

/** Conditions of a fit: turned, load patterns and load height limit. */
export function fitConditions(fit: HandlingFit): string[] {
  const parts: string[] = [];
  if (fit.turned) parts.push('turned 90°');
  if (fit.patterns.length) parts.push(`patterns ${fit.patterns.map(id => vocabulary.patterns.get(id)?.name ?? id).join(', ')}`);
  if (fit.maxLoadHeight !== undefined) parts.push(`load up to ${metres(fit.maxLoadHeight)} m high`);
  return parts;
}

/** Fit description in a unit's "Fits into" list: receptacle, its anchors and the conditions. */
export function fitDetail(fit: HandlingFit): string {
  const receptacle = assetHandling[fit.container].receptacles.find(entry => entry.name === fit.receptacle)!;
  return [`${fit.receptacle} (${anchorRange(receptacleAnchors(receptacle))})`, ...fitConditions(fit)].join(' · ');
}

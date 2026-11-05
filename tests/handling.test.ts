import { describe, expect, it } from 'vitest';
import { fitOrientation, handlingFits, validateAssetHandling, validateHandlingProfile, type AssetHandling, type HandlingProfile, type Receptacle } from '@opsorama/core';
import { assetHandling, basicAssets, checkAssetHandling, handlingProfiles, logisticsProfile } from '@opsorama/renderer-three';
import { catalogObjects } from '../apps/site/src/features/docs/objects';
import { compatibleAssets, handlingAssets, handlingFacts, handlingTag } from '../apps/site/src/features/docs/object-handling';
import { docs, docsNavigation } from '../apps/site/src/features/docs/content';

const failures = (asset: string, handling: AssetHandling) => checkAssetHandling(asset, handling, basicAssets[asset]).checks.filter(check => !check.ok).map(check => check.name);
const shelfLevel = (level: number) => assetHandling.shelf.receptacles.find(receptacle => receptacle.name === `level-${level}`)!;

describe('handling declarations (H0)', () => {
  it('the logistics profile is valid and every shared declaration passes its model check', () => {
    expect(() => validateHandlingProfile(logisticsProfile)).not.toThrow();
    expect(Object.keys(assetHandling)).toEqual(expect.arrayContaining(['pallet', 'pallet-jack', 'pallet-rack', 'parcel', 'shelf', 'station', 'tote', 'worker']));
    for (const [asset, handling] of Object.entries(assetHandling)) {
      const report = checkAssetHandling(asset, handling, basicAssets[asset]);
      expect(report.checks.filter(check => !check.ok), asset).toEqual([]);
      expect(report.ok).toBe(true);
    }
    expect(checkAssetHandling('shelf', assetHandling.shelf, basicAssets.shelf).checks.map(check => check.name)).toEqual(expect.arrayContaining(['receptacle level-0 anchor slot-0 exists once', 'receptacle level-2 envelopes are clear of model parts', 'receptacle level-1 slots do not overlap', 'receptacle level-0 is reached from slot group pick']));
    // The pallet is measured empty, like the shelf and tote; count 0 is a valid pallet configuration.
    expect(assetHandling.pallet.empty).toEqual({ count: 0 });
    expect(checkAssetHandling('pallet', assetHandling.pallet, basicAssets.pallet).checks.map(check => check.name)).toEqual(expect.arrayContaining(['unit footprint matches logistics/industrial-pallet', 'unit height matches logistics/industrial-pallet at the deck top']));
  });

  it('the model check catches a wrong scale, a too-tall slot, a missing anchor and an unknown slot group', () => {
    expect(failures('parcel', { ...assetHandling.parcel, unit: { class: 'logistics/carton-m', scale: 1 } })).toEqual(['unit footprint matches logistics/carton-m', 'unit height matches logistics/carton-m']);
    const tall = { ...assetHandling.shelf, receptacles: [{ ...shelfLevel(0), envelope: { footprint: [.68, .95] as const, height: 1 } }] };
    expect(failures('shelf', tall)).toEqual(['receptacle level-0 envelopes are clear of model parts']);
    const wide = { ...assetHandling.shelf, receptacles: [{ ...shelfLevel(0), envelope: { footprint: [.75, .95] as const, height: .78 } }] };
    // Wider slots overlap their neighbours, and the outer ones run into the frame posts.
    expect(failures('shelf', wide)).toEqual(['receptacle level-0 envelopes are clear of model parts', 'receptacle level-0 slots do not overlap']);
    expect(failures('worker', { receptacles: [{ ...assetHandling.worker.receptacles[0] as Extract<Receptacle, { arrangement: 'stack' }>, anchor: 'shoulder' }] })).toEqual(['receptacle carry anchor shoulder exists once']);
    expect(failures('shelf', { ...assetHandling.shelf, receptacles: [{ ...shelfLevel(1), reachedFrom: 'load' }] })).toEqual(['receptacle level-1 is reached from slot group load']);
    const outside = { ...assetHandling.pallet, receptacles: [{ ...assetHandling.pallet.receptacles[0], offset: [1, 0, 0] as const }] };
    expect(failures('pallet', outside)).toEqual(['receptacle deck lies within the model footprint']);
  });

  it('structural validation names the problem and the fix', () => {
    const profile = (patch: Partial<HandlingProfile>): HandlingProfile => ({ ...logisticsProfile, ...patch });
    const carton = logisticsProfile.classes[0];
    expect(() => validateHandlingProfile(profile({ classes: [{ ...carton, family: 'crate' as never }] }))).toThrow(/unknown family crate; use one of item, case/);
    expect(() => validateHandlingProfile(profile({ classes: [{ ...carton, id: 'retail/carton-m' }] }))).toThrow(/must be logistics\/<lowercase-name>/);
    expect(() => validateHandlingProfile(profile({ patterns: [{ id: 'logistics/bad', class: carton.id, name: 'Overlap', positions: [{ offset: [0, 0], yaw: 0 }, { offset: [.2, 0], yaw: 0 }] }] }))).toThrow(/positions 0 and 1 overlap/);
    expect(() => validateHandlingProfile(profile({ classes: [{ ...carton, turnable: false }], patterns: [logisticsProfile.patterns[0]] }))).toThrow(/turns logistics\/carton-m, which is not turnable/);
    expect(() => validateAssetHandling('crate', { unit: { class: 'logistics/crate', scale: 1 }, receptacles: [] }, handlingProfiles)).toThrow(/unknown class logistics\/crate; declare it in a domain profile first/);
    expect(() => validateAssetHandling('cart', { receptacles: [{ name: 'deck', arrangement: 'stack', anchor: 'load', capacity: 0, accepts: { families: ['case'] }, envelope: { footprint: [1, 1], height: 1 } }] }, handlingProfiles)).toThrow(/capacity must be an integer from 1 to 64/);
    expect(() => validateAssetHandling('cart', { receptacles: [{ name: 'a', arrangement: 'slot', anchors: ['slot-0'], accepts: { families: ['case'] }, envelope: { footprint: [1, 1], height: 1 } }, { name: 'b', arrangement: 'slot', anchors: ['slot-0'], accepts: { families: ['case'] }, envelope: { footprint: [1, 1], height: 1 } }] }, handlingProfiles)).toThrow(/reuses anchor slot-0/);
    expect(() => validateAssetHandling('cart', { receptacles: [{ name: 'a', arrangement: 'slot', anchors: ['slot-0'], accepts: { families: ['unit-load'], classes: ['logistics/tote'] }, envelope: { footprint: [1, 1], height: 1 } }] }, handlingProfiles)).toThrow(/class logistics\/tote of family case, which it does not list/);
    expect(() => validateAssetHandling('cart', { receptacles: [{ name: 'deck', arrangement: 'deck', anchor: 'load', patterns: ['logistics/tote-2x2'], accepts: { families: ['case'] }, envelope: { footprint: [1, 1], height: 1 } }] }, handlingProfiles)).toThrow(/reaches outside the 1 × 1 m deck/);
    expect(() => validateAssetHandling('cart', { receptacles: [] }, handlingProfiles)).toThrow(/neither a unit nor a receptacle/);
    expect(() => handlingFits({}, [logisticsProfile, logisticsProfile])).toThrow(/declared by more than one profile/);
  });

  it('fit orientation prefers the declared orientation and turns only turnable units', () => {
    const envelope = { footprint: [.5, .8] as const, height: .5 };
    expect(fitOrientation({ footprint: [.4, .7], height: .3 }, envelope, true)).toBe('as-is');
    expect(fitOrientation({ footprint: [.7, .4], height: .3 }, envelope, true)).toBe('turned');
    expect(fitOrientation({ footprint: [.7, .4], height: .3 }, envelope, false)).toBeNull();
    expect(fitOrientation({ footprint: [.4, .7], height: .6 }, envelope, true)).toBeNull();
  });

  it('derives declared compatibility from the shared declarations', () => {
    const fits = handlingFits(assetHandling, handlingProfiles);
    const declared = ['pallet', 'pallet-jack', 'pallet-rack', 'shelf', 'station', 'worker'], where = (unit: string) => fits.filter(fit => fit.unit === unit && declared.includes(fit.container)).map(fit => `${fit.container} ${fit.receptacle} ${fit.verdict}`);
    expect(where('tote')).toEqual(['pallet deck fits', 'shelf level-0 fits', 'shelf level-1 fits', 'shelf level-2 fits', 'station surface fits', 'worker carry fits']);
    expect(where('parcel')).toEqual(['pallet deck fits', 'shelf level-0 fits', 'shelf level-1 fits', 'shelf level-2 fits', 'station surface fits', 'worker carry fits']);
    expect(where('pallet')).toEqual(['pallet-jack load fits', 'pallet-rack level-0 fits', 'pallet-rack level-1 fits', 'pallet-rack level-2 fits']);
    expect(fits.find(fit => fit.unit === 'parcel' && fit.container === 'pallet')!.patterns).toEqual(['logistics/carton-m-3x2']);
    // The industrial pallet fits a rack position either way round, and each level limits its load height.
    expect(fits.filter(fit => fit.unit === 'pallet' && fit.container === 'pallet-rack').map(fit => [fit.turned, fit.maxLoadHeight])).toEqual([[false, 1.23], [false, 1.17], [false, 1.01]]);
    expect(fits.find(fit => fit.unit === 'pallet' && fit.container === 'pallet-rack')!.message).toBe('Industrial pallet 1200 × 1000 (1.2 × 1 × 0.21 m) fits pallet-rack level-0 with a load up to 1.23 m high.');
    // A receptacle that accepts the family but is too small is reported as too large.
    const small = { ...assetHandling, cage: { receptacles: [{ name: 'bay', arrangement: 'stack', anchor: 'load', capacity: 1, accepts: { families: ['unit-load'] }, envelope: { footprint: [1.1, 1.1], height: 2 } }] } } satisfies Record<string, AssetHandling>;
    expect(handlingFits(small, handlingProfiles).find(fit => fit.unit === 'pallet' && fit.container === 'cage')!.message).toBe('Industrial pallet 1200 × 1000 (1.2 × 1 × 0.21 m) is larger than the 1.1 × 1.1 × 2 m clear space of cage bay in either orientation.');
    // A smaller receptacle limits the load a pallet may carry, and a narrow one needs the pallet turned.
    const custom = { ...assetHandling, cart: { receptacles: [{ name: 'bed', arrangement: 'stack', anchor: 'load', capacity: 1, accepts: { families: ['unit-load'] }, envelope: { footprint: [1.05, 1.25], height: 1.2 } }] } } satisfies Record<string, AssetHandling>;
    const cart = handlingFits(custom, handlingProfiles).find(fit => fit.unit === 'pallet' && fit.container === 'cart')!;
    expect(cart).toMatchObject({ unit: 'pallet', verdict: 'fits', turned: true, maxLoadHeight: .99 });
    expect(cart.message).toBe('Industrial pallet 1200 × 1000 (1.2 × 1 × 0.21 m) fits cart bed turned 90° with a load up to 0.99 m high.');
  });

  it('the catalog shows compatibility from the same declarations', () => {
    for (const asset of Object.keys(assetHandling)) expect(catalogObjects.some(item => item.asset === asset), asset).toBe(true);
    expect(handlingAssets).toHaveLength(Object.keys(assetHandling).length);
    expect(handlingTag('pallet')).toBe('Unit load · holds case, soft pack');
    expect(handlingTag('shelf')).toBe('Holds case, soft pack');
    expect(handlingTag('parcel')).toBe('Case');
    expect(handlingTag('tree-pine')).toBeUndefined();
    expect([...compatibleAssets('pallet')]).toEqual(expect.arrayContaining(['forklift', 'pallet-jack', 'pallet-rack', 'parcel', 'reach-truck', 'shipping-container', 'tote']));
    expect([...compatibleAssets('shelf')]).toEqual(expect.arrayContaining(['parcel', 'tote']));
    const shelf = handlingFacts('shelf')!;
    expect(shelf.unit).toBeUndefined();
    expect(shelf.receptacles.map(receptacle => [receptacle.name, receptacle.anchors, receptacle.envelope])).toEqual([['level-0', 'slot-0…slot-3', '0.68 × 0.95 × 0.78 m'], ['level-1', 'slot-4…slot-7', '0.68 × 0.95 × 0.78 m'], ['level-2', 'slot-8…slot-11', '0.68 × 0.95 × 0.84 m']]);
    const pallet = handlingFacts('pallet')!;
    expect(pallet.unit).toMatchObject({ classId: 'logistics/industrial-pallet', family: 'unit load', size: '1.2 × 1 × 0.21 m' });
    expect(pallet.fitsInto.map(fit => `${fit.container} ${fit.receptacle}`)).toEqual(expect.arrayContaining(['pallet-jack load', 'pallet-rack level-0', 'pallet-rack level-1', 'pallet-rack level-2']));
    expect(pallet.tooLarge).toEqual([]);
    expect(pallet.receptacles[0].patterns.map(pattern => pattern.units)).toEqual([6, 4]);
    expect(handlingFacts('tree-pine')).toBeNull();
    const article = docs.find(doc => doc.slug === 'handling')!;
    expect(article.sections.map(section => section.id)).toEqual(['scope', 'families', 'profile', 'patterns', 'declarations', 'check', 'fits', 'state', 'violations', 'targets', 'sync', 'move-mode', 'limits']);
    expect(docsNavigation.flatMap(group => group.items).some(item => item.slug === 'handling')).toBe(true);
  });
});

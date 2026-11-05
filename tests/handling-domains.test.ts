import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createHandlingState, handlingFits, validateAssetHandling, validateHandlingProfile, type AssetHandling, type HandlingProfile, type ReceptaclePlacement } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { assetHandling, catalogAssets, checkAssetHandling, datacenterProfile, handlingProfiles, laboratoryProfile, logisticsProfile, retailProfile } from '@opsorama/objects';
import { catalogObjects } from '../apps/site/src/features/docs/objects';

const state = (instances: readonly { id: string; asset: string; variant?: string }[]) => createHandlingState({ handling: assetHandling, profiles: handlingProfiles, instances });
const cabinet = { container: 'cabinet', receptacle: 'rail' };
const rack = [{ id: 'cabinet', asset: 'equipment-cabinet' }, { id: 's2', asset: 'rack-server' }, { id: 's2b', asset: 'rack-server', variant: '2u' }, { id: 's1', asset: 'rack-server', variant: '1u' }, { id: 'sw', asset: 'network-switch' }];

describe('domain profiles and rails (H4)', () => {
  it('every profile is valid, adds classes only, and every declaration passes its model check', () => {
    expect(handlingProfiles.map(profile => profile.id)).toEqual(['logistics', 'retail', 'datacenter', 'laboratory']);
    for (const profile of [logisticsProfile, retailProfile, datacenterProfile, laboratoryProfile]) expect(() => validateHandlingProfile(profile)).not.toThrow();
    for (const [asset, handling] of Object.entries(assetHandling)) {
      expect(checkAssetHandling(asset, handling, catalogAssets[asset]).checks.filter(check => !check.ok), asset).toEqual([]);
      expect(catalogObjects.some(item => item.asset === asset), asset).toBe(true);
    }
  });

  it('mounts servers on the cabinet rail by rack units', () => {
    const handling = state(rack);
    const first = handling.move([{ unit: 's2', to: cabinet }])[0];
    expect(first.placement).toMatchObject({ anchor: 'rail', position: 0 });
    // A 2U server takes two positions, so the next unit starts at the third.
    expect(handling.move([{ unit: 's1', to: cabinet }])[0].placement).toMatchObject({ position: 2 });
    expect((handling.placement('s1') as ReceptaclePlacement).offset[1]).toBeCloseTo(2 * .0445);
    expect(handling.move([{ unit: 'sw', to: cabinet }])[0].placement).toMatchObject({ position: 3 });
    expect(handling.check('s2b', { ...cabinet, position: 1 }).violations[0]).toMatchObject({ code: 'position-taken', blocking: ['s2', 's1'] });
    expect(handling.check('s2b', { ...cabinet, position: 41 }).violations[0].code).toBe('unknown-target');
    expect(handling.check('s2b', { ...cabinet, position: 40 }).ok).toBe(true);
    expect(handling.contents('cabinet')).toEqual(['s2', 's1', 'sw']);
    // Any unit can be taken from a rail.
    expect(handling.move([{ unit: 's2', to: { position: [0, 0, 0], yaw: 0 } }])[0].ok).toBe(true);
    expect(handling.check('s1', { position: [0, 0, 0], yaw: 0 }).ok).toBe(true);
    expect(handling.move([{ unit: 's2b', to: cabinet }])[0].placement).toMatchObject({ position: 0 });
  });

  it('reports a full rail, and refuses what the rail does not accept', () => {
    const units = Array.from({ length: 22 }, (_, i) => ({ id: `s${i}`, asset: 'rack-server' }));
    const handling = state([{ id: 'cabinet', asset: 'equipment-cabinet' }, { id: 'parcel', asset: 'parcel' }, ...units]);
    expect(handling.move(units.slice(0, 21).map(unit => ({ unit: unit.id, to: cabinet }))).every(check => check.ok)).toBe(true);
    expect(handling.check('s21', cabinet).violations[0].code).toBe('receptacle-full');
    expect(handling.check('parcel', cabinet).violations[0].code).toBe('class-not-accepted');
    expect(handling.targets('s21')).toEqual([]);
  });

  it('places a server exactly where the cabinet model says', () => {
    const handling = state(rack), model = catalogAssets['equipment-cabinet']({ id: 'cabinet', kind: 'asset', asset: 'equipment-cabinet', count: 0 } as never);
    handling.move([{ unit: 's2', to: cabinet }, { unit: 's1', to: cabinet }]);
    model.updateMatrixWorld(true);
    const anchor = model.getObjectByName('anchor-rail')!.getWorldPosition(new THREE.Vector3()), [, patch] = handling.nodePatches();
    expect(anchor.y + patch.position[1]).toBeCloseTo(.14 + 2 * .0445);
    expect(patch).toMatchObject({ id: 's1', attachment: { nodeId: 'cabinet', anchor: 'rail' } });
    disposeObject(model);
  });

  it('a rail along the belt centres each unit on the positions it spans', () => {
    const handling = state([{ id: 'belt', asset: 'conveyor' }, { id: 'tote', asset: 'tote' }, { id: 'carton', asset: 'parcel' }]), to = { container: 'belt', receptacle: 'belt' };
    expect(handling.move([{ unit: 'tote', to }])[0].placement).toMatchObject({ anchor: 'entry', position: 0, turn: 0 });
    // A 0.4 m deep tote spans two 0.25 m positions, so it is centred 0.25 m along the belt.
    expect((handling.placement('tote') as ReceptaclePlacement).offset[2]).toBeCloseTo(.2);
    expect(handling.move([{ unit: 'carton', to }])[0].placement).toMatchObject({ position: 2 });
  });

  it('a bulk receptacle takes contents lines, not units', () => {
    const handling = state([{ id: 'cart', asset: 'shopping-cart' }, { id: 'flask', asset: 'lab-flask' }]);
    expect(handling.check('flask', { container: 'cart', receptacle: 'contents' }).violations[0]).toMatchObject({ code: 'unknown-target' });
    expect(handling.check('flask', { container: 'cart', receptacle: 'contents' }).violations[0].message).toContain('ContainerContents');
    expect(handling.targets('flask')).toEqual([]);
    expect(handling.refusals('flask')).toEqual([]);
    expect(handlingFits(assetHandling, handlingProfiles).some(fit => fit.receptacle === 'contents')).toBe(false);
  });

  it('labware composes: flasks on a tray, the tray on a workstation', () => {
    const handling = state([{ id: 'bench', asset: 'lab-workstation' }, { id: 'tray', asset: 'lab-tray' }, ...Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, asset: 'lab-flask' }))]);
    const load = Array.from({ length: 9 }, (_, i) => ({ unit: `f${i}`, to: { container: 'tray', receptacle: 'deck' } }));
    expect(handling.move([...load, { unit: 'tray', to: { container: 'bench', receptacle: 'tray' } }]).every(check => check.ok)).toBe(true);
    expect(handling.path('f4')).toEqual(['f4', 'tray', 'bench']);
    expect(handling.check('f9', { container: 'tray', receptacle: 'deck' }).ok).toBe(false);
  });

  it('a container holds pallets in two rows and layers them by the stacking rule', () => {
    const pallets = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, asset: 'pallet' }));
    const handling = state([{ id: 'box', asset: 'shipping-container' }, { id: 'drum', asset: 'drum-pallet' }, ...pallets]), to = { container: 'box', receptacle: 'floor' };
    expect(handling.move(pallets.slice(0, 8).map(unit => ({ unit: unit.id, to }))).every(check => check.ok)).toBe(true);
    expect(handling.placement('p7')).toMatchObject({ layer: 0, position: 7, turn: 90 });
    expect(handling.check('p8', to).placement).toMatchObject({ layer: 1 });
    // Drums may not carry anything, and may not rest on a pallet layer's pattern.
    expect(handling.check('drum', to).ok).toBe(false);
  });

  it('declares compatibility across domains from the same rules', () => {
    const fits = handlingFits(assetHandling, handlingProfiles);
    const where = (unit: string) => fits.filter(fit => fit.unit === unit && fit.verdict === 'fits').map(fit => `${fit.container} ${fit.receptacle}`);
    expect(where('rack-server')).toEqual(['equipment-cabinet rail']);
    expect(where('lab-tray')).toEqual(['lab-workstation tray']);
    expect(where('bag')).toEqual(expect.arrayContaining(['pickup-shelf level-0', 'worker carry']));
    expect(where('ibc-tank')).toEqual(expect.arrayContaining(['forklift load', 'pallet-rack level-0', 'reach-truck load']));
    // A bulk bag is 1.23 m tall, 1 cm above the top rack level.
    expect(fits.find(fit => fit.unit === 'bulk-bag' && fit.receptacle === 'level-2')?.verdict).toBe('too-large');
    expect(where('mail-sack')).toContain('pallet deck');
  });

  it('validates rail declarations with the fix', () => {
    const rail = (patch: object): AssetHandling => ({ receptacles: [{ name: 'rail', arrangement: 'rail', anchor: 'a', positions: 4, pitch: .1, axis: 'y', accepts: { families: ['module'] }, envelope: { footprint: [.5, .5], height: .4 }, ...patch } as never] });
    expect(() => validateAssetHandling('x', rail({}), handlingProfiles)).not.toThrow();
    expect(() => validateAssetHandling('x', rail({ positions: 0 }), handlingProfiles)).toThrow(/positions must be an integer/);
    expect(() => validateAssetHandling('x', rail({ pitch: 0 }), handlingProfiles)).toThrow(/pitch must be a positive/);
    expect(() => validateAssetHandling('x', rail({ axis: 'w' }), handlingProfiles)).toThrow(/axis must be x, y or z/);
    expect(() => validateAssetHandling('x', rail({ positions: 5 }), handlingProfiles)).toThrow(/Make them agree/);
    const badVariant: AssetHandling = { unit: { class: 'datacenter/server-2u', scale: 1, variants: { '9u': 'datacenter/server-9u' } }, receptacles: [] };
    expect(() => validateAssetHandling('x', badVariant, handlingProfiles)).toThrow(/unknown class datacenter\/server-9u/);
    const wrong: HandlingProfile = { ...datacenterProfile, classes: datacenterProfile.classes.map(entry => entry.id === 'datacenter/server-1u' ? { ...entry, size: { ...entry.size, height: .3 } } : entry) };
    const report = checkAssetHandling('rack-server', assetHandling['rack-server'], catalogAssets['rack-server'], [logisticsProfile, retailProfile, wrong, laboratoryProfile]);
    expect(report.checks.filter(check => !check.ok).map(check => check.name)).toEqual(['variant 1u matches datacenter/server-1u']);
  });
});

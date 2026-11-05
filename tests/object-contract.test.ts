import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { validateObjectDescriptor, type AssetNode, type ObjectDescriptor } from '@opsorama/core';
import { assetDescriptors, assetLabelSurfaces, basicAssets, checkAssetDescriptor, parcelDescriptor, parcelBaseDescriptor, setAssetAnimator, shelfDescriptor, stationDescriptor, pavilionDescriptor, bagDescriptor, treeDescriptors, signDescriptor, mapPinDescriptor, officeChairDescriptor, workerDescriptor, type AssetFactory } from '@opsorama/renderer-three';
import { catalogObjects } from '../apps/site/src/features/docs/objects';

const failures = (descriptor: ObjectDescriptor, factory: AssetFactory) => checkAssetDescriptor(descriptor, factory).checks.filter(check => !check.ok).map(check => check.name);

describe('common object contract', () => {
  it('verifies the parcel descriptor against the built model', () => {
    const report = checkAssetDescriptor(parcelDescriptor, basicAssets.parcel);
    expect(report.checks.filter(check => !check.ok)).toEqual([]);
    expect(report.checks.length).toBeGreaterThan(30);
    expect(report.ok).toBe(true);
  });

  it('verifies every registered descriptor, including the C2 foundation entries', () => {
    expect(Object.keys(assetDescriptors).sort()).toEqual(Object.keys(basicAssets).sort());
    const reports = Object.entries(assetDescriptors).map(([asset, descriptor]) => checkAssetDescriptor(descriptor, basicAssets[asset]));
    expect(reports.flatMap(report => report.checks.filter(check => !check.ok).map(check => ({ asset: report.asset, ...check })))).toEqual([]);
    expect(checkAssetDescriptor(workerDescriptor, basicAssets.worker).checks.map(check => check.name)).toEqual(expect.arrayContaining(['pivot is the stance point', 'animation class is local', 'local animation leaves the root transform', 'anchor carry exists once', 'role skin colors a part']));
    expect(checkAssetDescriptor(parcelBaseDescriptor, basicAssets['parcel-base']).checks.map(check => check.name)).toEqual(expect.arrayContaining(['pivot is the base center', 'largest bounds match', 'anchor top exists once', 'state critical has no visual change']));
  }, 30000);

  it('is serializable data shared by the registry and the catalog', () => {
    for (const descriptor of Object.values(assetDescriptors)) {
      expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
      expect(Object.isFrozen(descriptor)).toBe(true);
    }
    for (const asset of Object.keys(assetDescriptors)) {
      expect(basicAssets[asset]).toBeDefined();
      expect(catalogObjects.some(item => item.asset === asset)).toBe(true);
    }
  });

  it('detects models that break their descriptor', () => {
    const parcel = basicAssets.parcel;
    expect(failures({ ...parcelDescriptor, geometry: { ...parcelDescriptor.geometry, bounds: { min: [-1, 0, -1], max: [1, 1, 1] } } }, parcel)).toContain('default bounds match');
    const floating: AssetFactory = (node, context) => { const object = parcel(node, context); object.position.y = .2; const group = new THREE.Group(); group.add(object); return group; };
    expect(failures(parcelDescriptor, floating)).toContain('pivot is the base center');
    const extraAnchor: AssetFactory = (node, context) => { const object = parcel(node, context); const anchor = new THREE.Object3D(); anchor.name = 'anchor-handle'; object.add(anchor); return object; };
    expect(failures(parcelDescriptor, extraAnchor)).toContain('default anchors are declared');
    const animated: AssetFactory = (node, context) => { const object = parcel(node, context); setAssetAnimator(object, () => {}, []); return object; };
    expect(failures(parcelDescriptor, animated)).toContain('animation class is none');
    const shared = new THREE.MeshStandardMaterial();
    const sharing: AssetFactory = (node, context) => { const object = parcel(node, context); object.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), shared)); return object; };
    expect(failures(parcelDescriptor, sharing)).toContain('instances own their resources');
    const ignoresPalette: AssetFactory = node => parcel({ ...node, materials: undefined, color: undefined } as AssetNode);
    expect(failures(parcelDescriptor, ignoresPalette)).toEqual(expect.arrayContaining(['role surface colors a part', 'legacy color sets its role']));
  });

  it('detects workers that float, move their root or ignore the palette', () => {
    const worker = basicAssets.worker;
    const floating: AssetFactory = (node, context) => { const object = worker(node, context); object.getObjectByName('worker-rig')!.position.y += .055; return object; };
    expect(failures(workerDescriptor, floating)).toContain('pivot is the stance point');
    const drifting: AssetFactory = (node, context) => { const object = worker(node, context); setAssetAnimator(object, ({ time }) => { object.position.z = time; }, []); return object; };
    expect(failures(workerDescriptor, drifting)).toContain('local animation leaves the root transform');
    const ignoresScene: AssetFactory = node => worker(node);
    expect(failures(workerDescriptor, ignoresScene)).toEqual(expect.arrayContaining(['role skin colors a part', 'role surface colors a part', 'role trim colors a part']));
    expect(failures({ ...workerDescriptor, geometry: { ...workerDescriptor.geometry, pivot: 'base-center' } }, worker)).toContain('pivot is the base center');
  });

  it('keeps every worker pose on the floor with its anchors', () => {
    for (const variant of workerDescriptor.customization.find(option => option.field === 'variant')!.samples!.map(sample => sample.variant)) {
      const object = basicAssets.worker({ id: 'w', kind: 'asset', asset: 'worker', variant }), names: string[] = [];
      object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name); });
      expect(new THREE.Box3().setFromObject(object).min.y, variant).toBeCloseTo(0, 2);
      expect(names.sort()).toEqual(['anchor-carry', 'anchor-cart', 'anchor-hand']);
    }
  });

  it('gives parcels on the base one anchor pair with top at the highest layer, or the base plate when empty', () => {
    for (const [count, countLayout, top] of [[0, 'compact', .095], [1, 'compact', .9], [12, 'compact', 1.8], [27, 'compact', 2.7], [0, 'reserved', .095], [27, 'reserved', 2.7]] as const) {
      const object = basicAssets['parcel-base']({ id: 's', kind: 'asset', asset: 'parcel-base', count, countLayout }), names: string[] = [];
      object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name); });
      expect(names.sort()).toEqual(['anchor-front', 'anchor-top']);
      expect(object.getObjectByName('anchor-top')!.position.y).toBeCloseTo(top, 2);
      expect(new THREE.Box3().setFromObject(object).max.y).toBeCloseTo(top, 1);
      expect(object.getObjectByName('base-plate')).toBeDefined();
    }
  });

  it('gives the shelf twelve storage slots that its decorative boxes fill in order', () => {
    const shelf = basicAssets.shelf({ id: 's', kind: 'asset', asset: 'shelf', count: 12 });
    for (let i = 0; i < 12; i++) {
      const slot = shelf.getObjectByName(`anchor-slot-${i}`)!, box = shelf.getObjectByName(`count-part-${i}`)!;
      expect(box.position.toArray()).toEqual(slot.position.toArray());
      expect(box.userData.decorative).toBe(true);
      // Each box rests on its deck: its lowest point is the slot anchor.
      expect(new THREE.Box3().setFromObject(box).min.y).toBeCloseTo(slot.position.y, 3);
    }
    expect([0, 4, 8].map(i => shelf.getObjectByName(`anchor-slot-${i}`)!.position.y)).toEqual([.22, 1.09, 1.96].map(y => expect.closeTo(y, 3)));
    // Without a scene palette the shelf keeps its blue frame, tan cartons, pale totes and label strips.
    const colors = new Set<string>(); shelf.traverse(child => { if (child instanceof THREE.Mesh) colors.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); });
    expect([...colors]).toEqual(expect.arrayContaining(['#356dd8', '#d8b487', '#95b7df', '#eee2c8', '#273545']));
    const failingSlots = failures({ ...shelfDescriptor, interaction: { ...shelfDescriptor.interaction, slots: ['pick-0'] } }, basicAssets.shelf);
    expect(failingSlots).toContain('interaction slots match');
  });

  it('keeps every workstation variant centred, with the same anchors and its default colors', () => {
    for (const variant of ['standard', 'packing', 'inspection'] as const) {
      const station = basicAssets.station({ id: 's', kind: 'asset', asset: 'station', variant }), names: string[] = [];
      station.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name.slice(7)); });
      expect(names.sort()).toEqual(['front', 'input', 'output', 'surface', 'top']);
      const bounds = new THREE.Box3().setFromObject(station);
      expect(bounds.min.z + bounds.max.z).toBeCloseTo(0, 3);
      // Work items rest on the bench top.
      expect(station.getObjectByName('anchor-surface')!.position.y).toBeCloseTo(1.23, 3);
      const colors = new Set<string>(); station.traverse(child => { if (child instanceof THREE.Mesh) colors.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); });
      expect([...colors]).toEqual(expect.arrayContaining(['#6489d6', '#f6f7fb', '#2e465f', '#bddfdf', '#a9baca']));
    }
    const dropsAnchor: AssetFactory = (node, context) => { const object = basicAssets.station(node, context); if (node.variant === 'packing') object.remove(object.getObjectByName('anchor-surface')!); return object; };
    expect(failures(stationDescriptor, dropsAnchor)).toContain('sample variant {"variant":"packing"} keeps its anchors');
  });

  it('keeps the shelter centred, with decorative parcels on its stock anchors and its default shades', () => {
    const pavilion = basicAssets.pavilion({ id: 'p', kind: 'asset', asset: 'pavilion' });
    for (let i = 0; i < 3; i++) {
      const spot = pavilion.getObjectByName(`anchor-stock-${i}`)!, parcel = pavilion.getObjectByName(`count-part-${i}`)!;
      expect(parcel.position.toArray()).toEqual(spot.position.toArray());
      expect(parcel.userData.decorative).toBe(true);
      expect(new THREE.Box3().setFromObject(parcel).min.y).toBeCloseTo(.04, 3);
    }
    const bounds = new THREE.Box3().setFromObject(pavilion);
    expect(bounds.min.z + bounds.max.z).toBeCloseTo(0, 3);
    const colors = new Set<string>(); pavilion.traverse(child => { if (child instanceof THREE.Mesh) colors.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); });
    expect([...colors]).toEqual(expect.arrayContaining(['#5481dc', '#729be4', '#3463be', '#cfd8e3', '#e3efff']));
    // A new frame color carries its shades along.
    const recolored = new Set<string>(); basicAssets.pavilion({ id: 'p', kind: 'asset', asset: 'pavilion', color: '#aa5533' }).traverse(child => { if (child instanceof THREE.Mesh) recolored.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); });
    expect(recolored.has('#5481dc') || recolored.has('#729be4') || recolored.has('#3463be')).toBe(false);
    expect(checkAssetDescriptor(pavilionDescriptor, basicAssets.pavilion).ok).toBe(true);
    expect(assetLabelSurfaces.pavilion.position[1]).toBeCloseTo(pavilion.getObjectByName('anchor-sign')!.position.y, 3);
  });

  it('keeps the bag grounded and preserves styling under host alert metadata', () => {
    const colorsOf = (node: Partial<AssetNode>) => { const colors = new Set<string>(); basicAssets.bag({ id: 'b', kind: 'asset', asset: 'bag', ...node }).traverse(child => { if (child instanceof THREE.Mesh) colors.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); }); return colors; };
    const bag = basicAssets.bag({ id: 'b', kind: 'asset', asset: 'bag' });
    expect(new THREE.Box3().setFromObject(bag).min.y).toBeCloseTo(0, 3);
    expect([...colorsOf({})].sort()).toEqual(['#2f4a42', '#385e54', '#81b5a3', '#a8c8bc', '#f5f4ea']);
    expect(colorsOf({ state: 'warning', color: '#aa5533' })).toEqual(colorsOf({ color: '#aa5533' }));
    expect(assetLabelSurfaces.bag.position[1]).toBeCloseTo(bag.getObjectByName('anchor-front')!.position.y, 3);
    expect(checkAssetDescriptor(bagDescriptor, basicAssets.bag).ok).toBe(true);
  });

  it('restyles trees through the wood and foliage roles while keeping their original shades', () => {
    const colorsOf = (asset: string, palette?: Record<string, string>) => { const colors = new Set<string>(); basicAssets[asset]({ id: 't', kind: 'asset', asset }, palette ? { theme: 'light', palette } : undefined).traverse(child => { if (child instanceof THREE.Mesh) colors.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); }); return colors; };
    expect([...colorsOf('tree')].sort()).toEqual(['#7fb3a0', '#8bbcaa', '#97c5b3', '#a8896a']);
    expect([...colorsOf('tree-pine')].sort()).toEqual(['#73a58e', '#8f7357', '#a18465']);
    expect([...colorsOf('tree-palm')].sort()).toEqual(['#7a5a3c', '#83b6a0', '#bc9975', '#c7a984']);
    for (const asset of ['tree', 'tree-pine', 'tree-palm']) {
      const autumn = colorsOf(asset, { foliage: '#d9822b', wood: '#5b4636' });
      expect(autumn.has('#d9822b') && autumn.has('#5b4636'), asset).toBe(true);
      const bounds = new THREE.Box3().setFromObject(basicAssets[asset]({ id: 't', kind: 'asset', asset }));
      expect(Math.abs(bounds.min.x + bounds.max.x) / 2, asset).toBeLessThan(.03);
    }
    expect(Object.values(treeDescriptors).every(descriptor => descriptor.interaction.selectable.startsWith('Decoration'))).toBe(true);
  });

  it('gives the sign a label face, the map pin status roles and the office chair the desk-pod seat', () => {
    const sign = basicAssets.sign({ id: 's', kind: 'asset', asset: 'sign' });
    expect(assetLabelSurfaces.sign.position[1]).toBeCloseTo(sign.getObjectByName('anchor-face')!.position.y, 3);
    expect(assetLabelSurfaces.sign.replaceParts).toEqual(['sign-placeholder']);
    const pinColors = (state?: 'warning' | 'inactive') => { const colors = new Set<string>(); basicAssets['map-pin']({ id: 'p', kind: 'asset', asset: 'map-pin', color: '#aa5533', ...(state ? { state } : {}) }).traverse(child => { if (child instanceof THREE.Mesh) colors.add(`#${(child.material as THREE.MeshStandardMaterial).color.getHexString()}`); }); return colors; };
    expect(pinColors().has('#aa5533')).toBe(true);
    expect([...pinColors('warning')]).toEqual(expect.arrayContaining(['#e8b553']));
    expect(pinColors('inactive').has('#aa5533')).toBe(false);
    const chair = basicAssets['office-chair']({ id: 'c', kind: 'asset', asset: 'office-chair' }), pod = basicAssets['desk-pod']({ id: 'd', kind: 'asset', asset: 'desk-pod', count: 1 });
    expect(chair.getObjectByName('anchor-seat-0')!.position.y).toBeCloseTo(pod.getObjectByName('anchor-seat-0')!.position.y, 3);
    // The standalone chair is the same geometry as the desk-pod chair.
    const names = (object: THREE.Object3D) => { const list: string[] = []; object.getObjectByName('office-chair')!.traverse(child => { if (child instanceof THREE.Mesh) list.push(child.name); }); return list.sort(); };
    expect(names(chair)).toEqual(names(pod));
    for (const descriptor of [signDescriptor, mapPinDescriptor, officeChairDescriptor]) expect(checkAssetDescriptor(descriptor, basicAssets[descriptor.asset]).ok, descriptor.asset).toBe(true);
  });

  it('rejects incomplete descriptors', () => {
    expect(() => validateObjectDescriptor({ ...workerDescriptor, geometry: { ...workerDescriptor.geometry, pivot: 'feet' as never } })).toThrow('unknown pivot');
    const broken = (patch: Partial<ObjectDescriptor>) => () => validateObjectDescriptor({ ...parcelDescriptor, ...patch });
    expect(broken({ states: { ...parcelDescriptor.states, unchanged: ['busy'] } })).toThrow('every visual state');
    expect(broken({ palette: { ...parcelDescriptor.palette, colorRole: 'glass' } })).toThrow('colorRole');
    expect(broken({ palette: { roles: [{ role: 'metal' as never, parts: 'x' }] } })).toThrow('unknown palette role');
    expect(broken({ lifecycle: { ...parcelDescriptor.lifecycle, animator: true } })).toThrow('animator');
    expect(broken({ interaction: { ...parcelDescriptor.interaction, anchors: [{ name: 'top', purpose: 'a' }, { name: 'top', purpose: 'b' }] } })).toThrow('anchors');
    expect(broken({ evidence: { ...parcelDescriptor.evidence, tests: [] } })).toThrow('evidence');
  });

  it('keeps every parcel configuration on its pivot with one set of anchors at the top layer', () => {
    const build = ([asset, extra]: readonly [string, Partial<AssetNode>]) => basicAssets[asset]({ id: 'p', kind: 'asset', asset, ...extra });
    for (const configuration of [['parcel', {}], ['parcel', { variant: 'open' }], ['parcel-base', { count: 12 }], ['parcel-base', { count: 0 }]] as const) {
      const object = build(configuration), names: string[] = [];
      object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name); });
      expect(new THREE.Box3().setFromObject(object).min.y).toBeCloseTo(0, 1);
      expect(names.filter(name => name === 'anchor-top')).toHaveLength(1);
      const top = object.getObjectByName('anchor-top')!, height = new THREE.Box3().setFromObject(object).max.y;
      // The top anchor sits on the highest layer, within the carton's tape and flaps.
      expect(height - top.position.y).toBeLessThan(.25);
    }
  });

  it('keeps the parcel one carton and points counted parcels to parcel-base and pallet', () => {
    const parcel = (extra: Partial<AssetNode>) => () => basicAssets.parcel({ id: 'p', kind: 'asset', asset: 'parcel', ...extra });
    for (const extra of [{ count: 1 }, { count: 3 }, { multiplier: 10 }]) expect(parcel(extra), JSON.stringify(extra)).toThrow('use parcel-base');
    expect(parcel({ countLayout: 'reserved' })).toThrow('no count layout');
    const single = parcel({})(), parts: string[] = [];
    single.traverse(child => { if (child.name.startsWith('count-part-')) parts.push(child.name); });
    expect(parts).toEqual(['count-part-0']); expect(single.getObjectByName('base-plate')).toBeUndefined();
    expect(() => basicAssets['parcel-base']({ id: 'b', kind: 'asset', asset: 'parcel-base', variant: 'open' })).toThrow('no variants');
  });
});

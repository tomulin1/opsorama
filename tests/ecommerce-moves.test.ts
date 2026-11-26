import { describe, expect, it } from 'vitest';
import type { AssetNode } from '@opsorama/core';
import { LOCATIONS, type LocationId } from '../apps/site/src/features/ecommerce/model';
import { createEcommerceSimulation, type ActorRole, type EcommerceEvent, type EcommerceSimulation, type EcommerceSimulationOptions, type Move } from '../apps/site/src/features/ecommerce/simulation';
/** Move options without their ghost places, which the tests of previews check on their own. */
const bare = <T extends { previews?: unknown }>(items: readonly T[]) => items.map(item => { const { previews, ...rest } = item; void previews; return rest; });

type EventOf<T extends EcommerceEvent['type']> = Extract<EcommerceEvent, { type: T }>;
const same = (a: Move, b: Move) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A scripted director on the peak shift: each commanded actor works through its own list of moves, and a move leaves the list
 * when the simulation reports that it ended. Roles in `auto` keep the automatic choice; `depart` sends the outbound truck.
 */
function scripted(options: Omit<EcommerceSimulationOptions, 'director' | 'onEvent'> & { auto?: readonly ActorRole[] } = {}) {
  const queues = new Map<string, Move[]>(), events: EcommerceEvent[] = [];
  let leave = false;
  const simulation = createEcommerceSimulation('peak', 7, {
    ...options,
    director: { job: (actor, auto) => options.auto?.includes(actor.role) ? auto() : queues.get(actor.id)?.[0], depart: () => leave },
    onEvent: event => {
      events.push(event);
      const queue = event.type === 'move-ended' ? queues.get(event.actor) : undefined;
      if (event.type === 'move-ended' && queue?.length && same(queue[0], event.move)) queue.shift();
    },
  });
  const of = <T extends EcommerceEvent['type']>(type: T) => events.filter((event): event is EventOf<T> => event.type === type);
  return {
    simulation, events, of,
    command(actor: string, ...moves: Move[]) { queues.set(actor, [...(queues.get(actor) ?? []), ...moves]); },
    /** Drop an actor's current move: it stops after the task it is on. */
    stop(actor: string) { queues.get(actor)?.shift(); },
    queue: (actor: string) => queues.get(actor) ?? [],
    depart() { leave = true; },
    /** Advance a second at a time until `done` holds; fails after `limit` seconds. */
    until(done: () => boolean, limit = 600) {
      for (let elapsed = 0; elapsed <= limit; elapsed++) { if (done()) return; simulation.advance(1); }
      throw new Error(`Not reached within ${limit} s; events: ${events.filter(event => event.type.startsWith('move') || event.type === 'unloaded' || event.type === 'put-away').map(event => `${event.time.toFixed(1)} ${event.type}`).join(', ')}`);
    },
  };
}
const pallets = (simulation: EcommerceSimulation) => simulation.nodes().filter((node): node is AssetNode => node.kind === 'asset' && node.id.startsWith('pallet:'));
const inStaging = (simulation: EcommerceSimulation) => pallets(simulation).filter(node => !node.attachment && (node.position?.[0] ?? 0) < 20).map(node => node.id);
const rackOf = (simulation: EcommerceSimulation, pallet: string) => pallets(simulation).find(node => node.id === pallet)?.attachment?.nodeId;
const actor = (simulation: EcommerceSimulation, id: string) => simulation.actors().find(item => item.id === id)!;
const stopped = (simulation: EcommerceSimulation) => simulation.snapshot().events.filter(event => event.text.includes('stopped:'));

describe('e-commerce commanded moves', () => {
  it('lists the commanded actors and leaves them idle without a command', () => {
    const game = scripted(), { simulation } = game;
    expect(simulation.actors().map(item => [item.id, item.role])).toEqual([['forklift', 'forklift'], ['reach-truck', 'reach-truck'], ['replenisher', 'replenisher'], ['dispatcher', 'dispatcher'], ['shelf-filler', 'shelf-filler']]);
    simulation.advance(200);
    expect(simulation.actors().filter(item => item.task || item.move)).toEqual([]);
    expect(inStaging(simulation)).toHaveLength(5);
    expect(game.of('unloaded')).toEqual([]);
    expect(game.of('put-away')).toEqual([]);
    // Pickers and packers still work, but the outbound truck waits for the director.
    expect(simulation.snapshot().docks.find(dock => dock.id === 'D3')!.status).toBe('loading');
    simulation.dispose();
  });

  it('unloads a truck pallet by pallet, waits for room in staging and goes on by itself', () => {
    const game = scripted(), { simulation } = game;
    expect(bare(simulation.moves('forklift', 'dock:D1').options)).toEqual([{ move: { kind: 'unload', dock: 'D1' }, target: 'Staging lane' }]);
    expect(simulation.moves('forklift', 'dock:D1').refused).toEqual([]);
    expect(simulation.moves('forklift', 'dock:D2').refused).toEqual([{ kind: 'unload', target: 'Staging lane', reason: 'No truck is docked at D2.' }]);
    game.command('forklift', { kind: 'unload', dock: 'D1' });
    game.until(() => game.of('move-waiting').length > 0);
    expect(game.of('unloaded').map(event => event.dock)).toEqual(['D1']);
    expect(game.of('move-waiting')[0]).toMatchObject({ actor: 'forklift', move: { kind: 'unload', dock: 'D1' }, reason: 'Waits for room in staging.' });
    expect(actor(simulation, 'forklift')).toMatchObject({ move: { kind: 'unload', dock: 'D1' }, waiting: 'Waits for room in staging.' });
    expect(actor(simulation, 'forklift').task).toBeUndefined();
    // A put-away frees a spot, and the forklift takes the next pallet without a new command.
    const [first] = simulation.moves('reach-truck', inStaging(simulation)[0]).options;
    game.command('reach-truck', first.move);
    game.until(() => game.of('unloaded').length === 2);
    expect(game.queue('forklift')).toEqual([{ kind: 'unload', dock: 'D1' }]);
    simulation.dispose();
  });

  it('ends a repeating unload when the truck is empty, and stops one after the current pallet', () => {
    const emptied = scripted({ auto: ['reach-truck'] });
    emptied.command('forklift', { kind: 'unload', dock: 'D1' });
    emptied.until(() => emptied.queue('forklift').length === 0, 900);
    // D1 had 6 of its 14 pallets left.
    expect(emptied.of('unloaded')).toHaveLength(6);
    expect(emptied.of('move-ended').filter(event => event.actor === 'forklift')).toEqual([expect.objectContaining({ outcome: 'emptied', reason: 'The truck at D1 is empty.' })]);
    // The empty truck leaves the dock.
    emptied.simulation.advance(10);
    expect(emptied.simulation.snapshot().docks.find(dock => dock.id === 'D1')!.status).toBe('free');
    expect(emptied.simulation.check('forklift', { kind: 'unload', dock: 'D1' })).toEqual({ ok: false, wait: false, reason: 'No truck is docked at D1.' });
    emptied.simulation.dispose();

    const stopping = scripted({ auto: ['reach-truck'] });
    stopping.command('forklift', { kind: 'unload', dock: 'D1' });
    stopping.until(() => stopping.of('unloaded').length === 1);
    stopping.stop('forklift');
    stopping.simulation.advance(120);
    expect(stopping.of('unloaded')).toHaveLength(1);
    expect(actor(stopping.simulation, 'forklift')).toEqual({ id: 'forklift', role: 'forklift', label: 'Forklift' });
    stopping.simulation.dispose();
  });

  it('puts a pallet away into any free rack place, at the level and place asked for', () => {
    const game = scripted({ capacityRules: true }), { simulation } = game, pallet = 'pallet:1038';
    const choices = simulation.moves('reach-truck', pallet), occupancy = simulation.snapshot().occupancy;
    // Every free place of every rack, whatever the goods: emptiest rack first, lowest place first; only full racks are refused.
    const free = LOCATIONS.filter(item => item.kind === 'rack').reduce((sum, item) => sum + item.capacity - occupancy[item.id], 0);
    expect(choices.options).toHaveLength(free);
    expect(choices.options.every(option => option.move.kind === 'put-away' && option.move.level !== undefined && option.move.position !== undefined)).toBe(true);
    expect(choices.options.every(option => /^R\d\d · level [1-3] · place [12]$/.test(option.target))).toBe(true);
    const racks = choices.options.map(option => option.move.kind === 'put-away' ? option.move.rack : '');
    expect(occupancy[racks[0] as LocationId]).toBe(Math.min(...racks.map(rack => occupancy[rack as LocationId])));
    expect(new Set(racks)).toContain('R04');
    expect(choices.refused.every(item => / is full\.$/.test(item.reason))).toBe(true);
    expect(simulation.check('reach-truck', { kind: 'put-away', pallet, rack: 'R05', level: 3 })).toEqual({ ok: false, wait: false, reason: 'R05 has levels 1 to 3.' });
    expect(simulation.check('reach-truck', { kind: 'put-away', pallet, rack: 'R05', position: 1 })).toEqual({ ok: false, wait: false, reason: 'A position in R05 needs a level and is 1 or 2.' });
    // A Toys pallet goes to the second place of the second level of an Outdoor rack.
    const place = choices.options.find(option => option.move.kind === 'put-away' && option.move.rack !== 'R05' && option.move.rack !== 'R12' && option.move.level === 1 && option.move.position === 1)!.move as Extract<Move, { kind: 'put-away' }>;
    game.command('reach-truck', place);
    game.until(() => game.queue('reach-truck').length === 0);
    expect(game.of('move-ended').map(event => [event.outcome, event.reason])).toEqual([['done', `Pallet 1038 put away to ${place.rack}.`]]);
    expect(game.of('put-away')).toEqual([expect.objectContaining({ pallet, sku: 'TOY-120', rack: place.rack })]);
    expect(rackOf(simulation, pallet)).toBe(`rack:${place.rack}`);
    expect(pallets(simulation).find(node => node.id === pallet)!.attachment!.anchor).toBe('slot-3');
    expect(inStaging(simulation)).not.toContain(pallet);
    // It is in a rack now, so it can only be replenished from there.
    expect(simulation.check('reach-truck', { kind: 'put-away', pallet, rack: 'R12' })).toEqual({ ok: false, wait: false, reason: 'Pallet 1038 is not in staging.' });
    expect(bare(simulation.moves('reach-truck', pallet).options)).toEqual([{ move: { kind: 'replenish', pallet }, target: 'Behind F4' }]);
    simulation.dispose();
  });

  it('offers the same free places without the capacity rules, as on the dashboard', () => {
    const simulation = createEcommerceSimulation('peak', 7, { director: { job: () => undefined } }), choices = simulation.moves('reach-truck', 'pallet:1038');
    expect(new Set(choices.options.map(option => option.move.kind === 'put-away' && option.move.rack))).toEqual(new Set(['R01', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'R14']));
    // Only the full racks are refused.
    expect(choices.refused.map(item => item.reason)).toEqual(['R02 is full.']);
    simulation.dispose();
  });

  it('brings only as many pallets as the racks can take, so put-away never blocks', () => {
    const game = scripted({ capacityRules: true }), { simulation } = game, racks = (simulation_: EcommerceSimulation) => simulation_.snapshot().occupancy;
    game.command('forklift', { kind: 'unload', dock: 'D1' }, { kind: 'unload', dock: 'D2' });
    game.until(() => {
      // Every pallet in staging always has a free rack place.
      for (const pallet of inStaging(simulation)) expect(simulation.moves('reach-truck', pallet).options.length, pallet).toBeGreaterThan(0);
      if (!game.queue('reach-truck').length) {
        const pallet = inStaging(simulation)[0];
        if (pallet) game.command('reach-truck', simulation.moves('reach-truck', pallet).options[0].move);
      }
      return game.queue('forklift').length === 0 && inStaging(simulation).length === 0 && game.queue('reach-truck').length === 0;
    }, 1500);
    // Both trucks were emptied and every pallet went into a rack, none over its capacity.
    expect(game.of('unloaded')).toHaveLength(16);
    expect(game.of('put-away')).toHaveLength(21);
    for (const item of LOCATIONS.filter(value => value.kind === 'rack')) expect(racks(simulation)[item.id], item.id).toBeLessThanOrEqual(item.capacity);
    expect(stopped(simulation)).toEqual([]);
    simulation.dispose();
  }, 30000);

  it('leaves the outbound truck to the director when it departs by the director', () => {
    const departs = createEcommerceSimulation('peak', 7, { directorDeparts: true, director: { depart: () => false } });
    departs.advance(400);
    // The automatic dispatcher keeps loading and never sends the truck.
    expect(departs.snapshot().docks.find(dock => dock.id === 'D3')!.status).toBe('loading');
    departs.dispose();
    const automatic = createEcommerceSimulation('peak', 7);
    automatic.advance(400);
    expect(automatic.snapshot().events.some(event => /left dock D3/.test(event.text))).toBe(true);
    automatic.dispose();
  });

  it('replenishes a pick face: a pallet behind it, the replenisher empties it, the reach truck clears it', () => {
    const game = scripted(), { simulation } = game, pallet = 'pallet:1015';
    expect(simulation.moves('replenisher', 'replen:F3').refused).toEqual([{ kind: 'decant', target: 'F3 lanes', reason: 'No pallet stands behind F3.' }]);
    expect(bare(simulation.moves('reach-truck', pallet).options)).toEqual([{ move: { kind: 'replenish', pallet }, target: 'Behind F3' }]);
    // The pallet's ghost stands on the spot behind F3, turned as pallets stand there.
    expect(simulation.moves('reach-truck', pallet).options[0].previews).toEqual([expect.objectContaining({ ghost: pallet, yaw: Math.PI / 2, position: [expect.any(Number), expect.any(Number), -5.75] })]);
    game.command('reach-truck', { kind: 'replenish', pallet });
    game.simulation.advance(1);
    // The replenisher may be told before the pallet arrives: it waits for it.
    game.command('replenisher', { kind: 'decant', face: 'F3' });
    // Another pallet for F3 waits until its spot is free again.
    expect(simulation.check('reach-truck', { kind: 'replenish', pallet: 'pallet:1016' })).toEqual({ ok: false, wait: true, reason: 'Waits for room behind F3.' });
    game.until(() => game.of('move-waiting').length > 0);
    expect(game.of('move-waiting')[0]).toMatchObject({ actor: 'replenisher', reason: 'Waits for the pallet behind F3.' });
    game.until(() => game.of('move-ended').some(event => event.actor === 'reach-truck'));
    expect(simulation.check('reach-truck', { kind: 'clear', face: 'F3' })).toMatchObject({ ok: false, wait: false, reason: expect.stringMatching(/^The pallet behind F3 still holds \d cartons?\.$/) });
    game.until(() => game.queue('replenisher').length === 0, 300);
    expect(game.of('move-ended').filter(event => event.actor === 'replenisher')).toEqual([expect.objectContaining({ outcome: 'emptied', reason: 'The pallet behind F3 is empty.' })]);
    expect(game.of('replenished')).toHaveLength(9);
    expect(game.of('replenished').every(event => event.face === 'F3' && event.sku === 'OUT-142')).toBe(true);
    const stack = simulation.snapshot().emptyPallets;
    expect(bare(simulation.moves('reach-truck', 'replen:F3').options)).toEqual([{ move: { kind: 'clear', face: 'F3' }, target: 'Empty-pallet stack' }]);
    // The empty pallet's ghost on top of the stack.
    expect(simulation.moves('reach-truck', 'replen:F3').options[0].previews).toEqual([expect.objectContaining({ ghost: pallet, yaw: Math.PI / 2 })]);
    game.command('reach-truck', { kind: 'clear', face: 'F3' });
    game.until(() => game.queue('reach-truck').length === 0);
    game.simulation.advance(1);
    expect(simulation.snapshot().emptyPallets).toBe(stack + 1);
    expect(pallets(simulation).some(node => node.id === pallet)).toBe(false);
    expect(simulation.moves('replenisher', 'flow:F3').refused).toEqual([{ kind: 'decant', target: 'F3 lanes', reason: 'No pallet stands behind F3.' }]);
    simulation.dispose();
  });

  it('waits for room in the pick-face lanes under the goods rules', () => {
    const game = scripted({ capacityRules: true }), { simulation } = game;
    game.command('reach-truck', { kind: 'replenish', pallet: 'pallet:1015' });
    game.command('replenisher', { kind: 'decant', face: 'F3' });
    const lanes = () => game.of('move-waiting').filter(event => event.reason === 'Waits for room in the lanes of F3.');
    game.until(() => lanes().length === 1);
    // F3 had 9 of its 12 lanes filled: three cartons fit, then the replenisher waits for the pickers to free a lane.
    const before = game.of('replenished').length;
    expect(before).toBe(3);
    expect(simulation.snapshot().occupancy.F3).toBe(12);
    expect(actor(simulation, 'replenisher')).toMatchObject({ move: { kind: 'decant', face: 'F3' }, waiting: 'Waits for room in the lanes of F3.' });
    // It goes on by itself once a lane is free, and waits again when the lanes are full.
    game.until(() => lanes().length === 2, 900);
    expect(game.of('replenished').length).toBeGreaterThan(before);
    expect(game.queue('replenisher')).toEqual([{ kind: 'decant', face: 'F3' }]);
    simulation.dispose();
  });

  it('restocks a department from its pick face until it is full', () => {
    const game = scripted(), { simulation } = game;
    expect(bare(simulation.moves('shelf-filler', 'flow:F4').options)).toEqual([{ move: { kind: 'restock', department: 'toys', source: 'face' }, target: 'Toys · from F4' }]);
    expect(bare(simulation.moves('shelf-filler', 'gondola:outdoor:1').options)).toEqual([{ move: { kind: 'restock', department: 'outdoor', source: 'face' }, target: 'Outdoor · from F3' }]);
    // A carton's ghost at each of the department's four gondolas, built from the carton model.
    const previews = simulation.moves('shelf-filler', 'flow:F4').options[0].previews!;
    expect(previews).toHaveLength(4);
    expect(previews[0]).toMatchObject({ ghost: { asset: 'parcel', scale: [.4, .4, .4] }, size: [.7, .7, .7] });
    expect(simulation.check('shelf-filler', { kind: 'restock', department: 'kitchen', source: 'transfer' })).toEqual({ ok: false, wait: false, reason: 'No shop transfer waits for Kitchen.' });
    // Sport (two gondolas, 37 of 48 facings) fills before S2 reaches its minimum.
    expect(bare(simulation.moves('shelf-filler', 'flow:S2').options)).toEqual([{ move: { kind: 'restock', department: 'sport', source: 'face' }, target: 'Sport · from S2' }]);
    game.command('shelf-filler', { kind: 'restock', department: 'sport', source: 'face' });
    game.until(() => game.queue('shelf-filler').length === 0, 300);
    const [end] = game.of('move-ended');
    expect(end).toMatchObject({ actor: 'shelf-filler', outcome: 'filled', reason: 'Sport is full.' });
    expect(game.of('restocked').length).toBeGreaterThanOrEqual(2);
    expect(game.of('restocked').every(event => event.department === 'sport' && !event.transfer)).toBe(true);
    expect(simulation.snapshot().shop.facings.sport).toBe(48);
    simulation.dispose();
  });

  it('ships a roll cage only onto its carrier\'s truck, and the truck leaves when the director sends it', () => {
    const game = scripted(), { simulation } = game;
    expect(simulation.moves('dispatcher', 'cage:parcelo-1').refused).toEqual([{ kind: 'ship', target: 'Truck at D3', reason: 'The truck at D3 is SwiftPost\'s; parcelo-1 goes with Parcelo.' }]);
    game.command('dispatcher', { kind: 'ship', cage: 'parcelo-1' }, { kind: 'ship', cage: 'swift-1' });
    game.until(() => game.queue('dispatcher').length === 0);
    expect(game.of('move-ended').map(event => event.outcome)).toEqual(['refused', 'done']);
    expect(game.of('shipped')).toEqual([expect.objectContaining({ carrier: 'swift' })]);
    expect(game.of('shipped')[0].orders).toHaveLength(9);
    simulation.advance(120);
    expect(simulation.snapshot().docks.find(dock => dock.id === 'D3')!.status).toBe('loading');
    game.depart();
    simulation.advance(1);
    expect(simulation.snapshot().docks.find(dock => dock.id === 'D3')!.status).toBe('departed');
    expect(simulation.check('dispatcher', { kind: 'ship', cage: 'swift-1' })).toEqual({ ok: false, wait: false, reason: 'No truck is loading at the outbound dock.' });
    simulation.dispose();
  });

  it('refuses a move of another role and names the commanded actors', () => {
    const simulation = createEcommerceSimulation('peak', 7, { director: { job: () => undefined } });
    expect(simulation.check('forklift', { kind: 'put-away', pallet: 'pallet:1038', rack: 'R05' })).toEqual({ ok: false, wait: false, reason: 'The forklift does not put away; that is a move of the reach truck.' });
    expect(simulation.check('reach-truck', { kind: 'put-away', pallet: 'pallet:1038', rack: 'F1' })).toEqual({ ok: false, wait: false, reason: 'F1 is not a reserve rack.' });
    expect(simulation.check('reach-truck', { kind: 'replenish', pallet: 'cage:swift-1' })).toEqual({ ok: false, wait: false, reason: 'cage:swift-1 is not a pallet.' });
    expect(simulation.moves('forklift', 'pallet:1038')).toEqual({ options: [], refused: [] });
    expect(() => simulation.moves('picker:0', 'pallet:1038')).toThrow('picker:0 is not a commanded actor; commanded actors now: forklift, reach-truck, replenisher, dispatcher, shelf-filler.');
    expect(() => simulation.check('robot:0', { kind: 'unload', dock: 'D1' })).toThrow('robot:0 is not a commanded actor');
    simulation.dispose();
  });

  it('gives the same shift for the same commands', () => {
    const play = () => {
      const game = scripted({ capacityRules: true });
      game.command('forklift', { kind: 'unload', dock: 'D1' });
      game.command('reach-truck', { kind: 'put-away', pallet: 'pallet:1038', rack: 'R12' }, { kind: 'replenish', pallet: 'pallet:1015' });
      game.command('replenisher', { kind: 'decant', face: 'F3' });
      game.command('shelf-filler', { kind: 'restock', department: 'outdoor', source: 'face' });
      game.simulation.advance(300);
      const result = JSON.stringify({ events: game.events, snapshot: game.simulation.snapshot(), actors: game.simulation.actors() });
      game.simulation.dispose();
      return result;
    };
    expect(play()).toBe(play());
  });
});

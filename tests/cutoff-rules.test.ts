import { describe, expect, it } from 'vitest';
import type { Move } from '../apps/site/src/features/ecommerce/simulation';
import { CHANNELS, POINTS, QUEUE_LIMIT, SHIFT_LEVELS, SHIFT_SECONDS, createShiftGame, type SalesChannel, type ShiftGame, type ShiftNotice, type ShiftScenario } from '../apps/site/src/features/cutoff/rules';
/** Move options without their ghost places, which the tests of previews check on their own. */
const bare = <T extends { previews?: unknown }>(items: readonly T[]) => items.map(item => { const { previews, ...rest } = item; void previews; return rest; });

type Command = readonly [number, (game: ShiftGame) => void];
/** Play a shift with commands at their times. */
function play(scenario: ShiftScenario, commands: readonly Command[] = [], slice = 1) {
  const game = createShiftGame({ scenario, seed: 1 }), notices: ShiftNotice[] = [];
  game.subscribe(notice => notices.push(notice));
  const queue = [...commands].sort((a, b) => a[0] - b[0]);
  while (!game.over) {
    while (queue.length && queue[0][0] <= game.time + 1e-9) queue.shift()![1](game);
    game.advance(slice);
  }
  return { game, notices, report: game.report() };
}
/** Run until the condition holds or the shift ends. */
function until(game: ShiftGame, done: () => boolean, limit = SHIFT_SECONDS) { while (!done() && game.time < limit && !game.over) game.advance(.5); return done(); }
const line = (game: ShiftGame, id: SalesChannel) => game.score().lines.find(item => item.id === id)!;
const channel = (game: ShiftGame, id: SalesChannel) => game.channels().find(item => item.id === id)!;
const actor = (game: ShiftGame, id: string) => game.actors().find(item => item.id === id)!;
const staging = (game: ShiftGame) => game.snapshot().units.filter(unit => unit.kind === 'pallet' && unit.at === 'On the floor').map(unit => unit.id);
/** The best put-away of a pallet in staging. */
const putAway = (game: ShiftGame, pallet: string) => game.options(pallet, 'reach-truck')[0].options[0].move;
const ended = (notices: readonly ShiftNotice[], actorId: string) => notices.filter((notice): notice is Extract<ShiftNotice, { type: 'move-ended' }> => notice.type === 'move-ended' && notice.actor === actorId);
const scored = (notices: readonly ShiftNotice[]) => notices.filter((notice): notice is Extract<ShiftNotice, { type: 'scored' }> => notice.type === 'scored');

describe('Cut-off shift game', () => {
  it('runs a level from its start to the end of the shift, then stops', () => {
    expect(Object.keys(SHIFT_LEVELS)).toEqual(['steady', 'peak']);
    for (const scenario of ['steady', 'peak'] as const) {
      const game = createShiftGame({ scenario, seed: 1 }), notices: ShiftNotice[] = [];
      game.subscribe(notice => notices.push(notice));
      expect(game.clock).toBe('10:00');
      game.advance(90);
      expect(game.clock).toBe('11:30');
      game.advance(SHIFT_SECONDS);
      expect([game.over, game.time, game.clock]).toEqual([true, SHIFT_SECONDS, '18:00']);
      expect(notices.filter(notice => notice.type === 'shift-ended')).toHaveLength(1);
      expect(() => game.move('forklift', { kind: 'unload', dock: 'D1' })).toThrow('The shift is over.');
      game.advance(10);
      expect(game.time).toBe(SHIFT_SECONDS);
      game.dispose();
    }
  });

  it('scores only items sold, each with the points of its channel', () => {
    expect(CHANNELS.map(item => [item.id, item.points])).toEqual([['checkout', 1], ['counter', 2], ['lockers', 3], ['bike', 3], ['truck', 2]]);
    const { game, notices, report } = play('peak');
    // Every point comes from a sale; nothing else scores.
    const sales = scored(notices);
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every(notice => notice.points === notice.items * POINTS[notice.channel] && notice.items > 0)).toBe(true);
    expect(report.score.total).toBe(sales.reduce((sum, notice) => sum + notice.points, 0));
    expect(report.score.lines.map(item => item.id)).toEqual(CHANNELS.map(item => item.id));
    for (const item of report.score.lines) expect(item.points).toBe(item.count * POINTS[item.id]);
    // Checkout sales float over their lane, collections over the counter and the lockers.
    expect(sales.find(notice => notice.channel === 'checkout')?.at).toMatch(/^checkout:C[123]$/);
    expect(new Set(sales.filter(notice => notice.channel === 'counter' || notice.channel === 'lockers').map(notice => notice.at))).toEqual(new Set(['collect:counter', 'collect:lockers']));
    // Nobody shipped the carriers' cages or took a cage to the bike.
    expect([line(game, 'truck').count, line(game, 'bike').count]).toEqual([0, 0]);
  });

  it('leaves the crew idle without commands, unless their assist is on', () => {
    const peak = createShiftGame({ scenario: 'peak' });
    expect(peak.actors().map(item => [item.id, item.assist])).toEqual([['forklift', false], ['reach-truck', false], ['replenisher', false], ['dispatcher', false], ['shelf-filler', false]]);
    peak.advance(60);
    expect(peak.actors().filter(item => item.task)).toEqual([]);
    expect(peak.report().unloaded).toBe(0);
    // With its assist on, the forklift unloads by itself.
    peak.assist('forklift', true);
    peak.advance(60);
    expect(peak.report().unloaded).toBeGreaterThan(0);
    expect(() => peak.assist('picker:0', true)).toThrow('Unknown actor: picker:0; actors on this shift: forklift, reach-truck, replenisher, dispatcher, shelf-filler.');
    peak.dispose();
    // Quiet Tuesday starts with every assist on, as a tutorial.
    const steady = createShiftGame({ scenario: 'steady' });
    expect(steady.actors().every(item => item.assist)).toBe(true);
    expect(until(steady, () => steady.actors().some(item => item.task))).toBe(true);
    steady.dispose();
  });

  it('queues commands per actor, checks them and drops each one when it ends', () => {
    const game = createShiftGame({ scenario: 'peak' }), notices: ShiftNotice[] = [], [a, b, c, d] = staging(game);
    game.subscribe(notice => notices.push(notice));
    const moves: Move[] = [putAway(game, a), putAway(game, b), putAway(game, c)];
    for (const move of moves) game.move('reach-truck', move);
    expect(actor(game, 'reach-truck').queue).toEqual(moves);
    // The queue holds three commands, each once, and a refused move is not queued.
    expect(() => game.move('reach-truck', putAway(game, d))).toThrow(`Reach truck already has ${QUEUE_LIMIT} commands; cancel one first.`);
    game.cancelMove('reach-truck', 2);
    expect(() => game.move('reach-truck', moves[1])).toThrow('Reach truck already has this command.');
    expect(() => game.move('reach-truck', { kind: 'put-away', pallet: d, rack: 'R04', position: 1 })).toThrow('A position in R04 needs a level and is 1 or 2.');
    expect(() => game.move('forklift', moves[0])).toThrow('The forklift does not put away; that is a move of the reach truck.');
    expect(() => game.move('dispatcher', { kind: 'ship', cage: 'parcelo-1' })).toThrow('The truck at D3 is SwiftPost\'s; parcelo-1 goes with Parcelo.');
    expect(() => game.move('dispatcher', { kind: 'ship', cage: 'bike-1' })).toThrow('No parcels for the delivery bike are packed.');
    expect(() => game.cancelMove('reach-truck', 0)).toThrow('Reach truck works on command 0; stop it instead.');
    expect(() => game.cancelMove('reach-truck', 2)).toThrow('Reach truck has no waiting command 2; waiting commands: 1 to 1.');
    expect(() => game.stop('forklift')).toThrow('Forklift has no command to stop.');
    expect(until(game, () => actor(game, 'reach-truck').queue.length === 0)).toBe(true);
    expect(ended(notices, 'reach-truck').map(notice => notice.outcome)).toEqual(['done', 'done']);
    expect(game.report().putAway).toBe(2);
    game.dispose();
  });

  it('repeats an unload until the truck is empty, and stops it after the current pallet', () => {
    const game = createShiftGame({ scenario: 'peak' }), notices: ShiftNotice[] = [];
    game.subscribe(notice => notices.push(notice));
    game.assist('reach-truck', true);
    game.move('forklift', { kind: 'unload', dock: 'D1' });
    expect(until(game, () => actor(game, 'forklift').queue.length === 0)).toBe(true);
    expect(ended(notices, 'forklift')).toEqual([expect.objectContaining({ outcome: 'emptied', reason: 'The truck at D1 is empty.' })]);
    expect(game.report().unloaded).toBe(6);
    game.dispose();

    const stopped = createShiftGame({ scenario: 'peak' });
    stopped.assist('reach-truck', true);
    stopped.move('forklift', { kind: 'unload', dock: 'D1' });
    expect(until(stopped, () => stopped.report().unloaded === 1)).toBe(true);
    stopped.stop('forklift');
    stopped.advance(60);
    expect(stopped.report().unloaded).toBeLessThanOrEqual(2);
    expect(actor(stopped, 'forklift').queue).toEqual([]);
    stopped.dispose();
  });

  it('accepts a decant while its pallet is still to come, and holds it until the pallet arrives', () => {
    const game = createShiftGame({ scenario: 'peak' });
    const pallet = game.snapshot().units.find(unit => unit.kind === 'pallet' && unit.sku === 'OUT-142' && unit.at === 'Rack R04')!.id;
    expect(game.options('flow:F3', 'replenisher')[0].refused).toEqual([{ kind: 'decant', target: 'F3 lanes', reason: 'No pallet stands behind F3.' }]);
    expect(() => game.move('replenisher', { kind: 'decant', face: 'F3' })).toThrow('No pallet stands behind F3.');
    game.move('reach-truck', { kind: 'replenish', pallet });
    expect(game.options('flow:F3', 'replenisher')[0].options).toEqual([{ move: { kind: 'decant', face: 'F3' }, target: 'F3 lanes', waits: 'Waits for the pallet for F3.' }]);
    game.move('replenisher', { kind: 'decant', face: 'F3' });
    game.advance(.5);
    expect(actor(game, 'replenisher').waiting).toMatch(/^Waits for the pallet (for|behind) F3\.$/);
    expect(until(game, () => game.report().replenished > 0)).toBe(true);
    game.dispose();
  });

  it('lists the moves of every actor for a scene node', () => {
    const game = createShiftGame({ scenario: 'peak' }), [pallet] = staging(game);
    expect(game.options(pallet).map(item => item.actor.id)).toEqual(['reach-truck']);
    expect(game.options('dock:D1').map(item => ({ ...item, options: bare(item.options) }))).toEqual([{ actor: { id: 'forklift', role: 'forklift', label: 'Forklift' }, options: [{ move: { kind: 'unload', dock: 'D1' }, target: 'Staging lane' }], refused: [] }]);
    expect(game.options('flow:F3').map(item => [item.actor.id, item.options.map(option => option.target)])).toEqual([['reach-truck', []], ['replenisher', []], ['shelf-filler', ['Outdoor · from F3']]]);
    expect(game.options('cage:swift-1').map(item => item.options.map(option => option.move))).toEqual([[{ kind: 'ship', cage: 'swift-1' }]]);
    expect(game.options('checkout:C1')).toEqual([]);
    expect(game.options(pallet, 'forklift')).toEqual([]);
    // The outlet cages go to their outlet once a packer has put a parcel in; the ghost stands where the cage is unloaded.
    expect(game.options('cage:lockers-1')[0].refused).toEqual([{ kind: 'ship', target: 'Parcel lockers', reason: 'No parcels for the parcel lockers are packed.' }]);
    expect(until(game, () => channel(game, 'counter').cage > 0)).toBe(true);
    expect(game.options('cage:counter-1').map(item => bare(item.options))).toEqual([[{ move: { kind: 'ship', cage: 'counter-1' }, target: 'Click & collect counter' }]]);
    expect(game.options('cage:counter-1')[0].options[0].previews).toEqual([{ position: [-10.55, expect.any(Number), .4], yaw: -Math.PI / 2, size: [1, 2, 1], ghost: 'cage:counter-1' }]);
    game.dispose();
  });

  it('sends the outbound truck at its cut-off or when the player says, and scores the items it takes', () => {
    const game = createShiftGame({ scenario: 'peak' }), notices: ShiftNotice[] = [];
    game.subscribe(notice => notices.push(notice));
    const parcels = channel(game, 'truck').cage;
    game.move('dispatcher', { kind: 'ship', cage: 'swift-1' });
    expect(until(game, () => actor(game, 'dispatcher').queue.length === 0)).toBe(true);
    expect(channel(game, 'truck').cage).toBeLessThan(parcels);
    expect(scored(notices).filter(notice => notice.channel === 'truck')).toEqual([expect.objectContaining({ at: 'dock:D3', points: 2 * line(game, 'truck').count })]);
    // It stays until the SwiftPost cut-off at 11:30, 90 minutes into the shift.
    until(game, () => notices.some(notice => notice.type === 'departed'));
    expect(notices.find(notice => notice.type === 'departed')).toMatchObject({ carrier: 'swift', sent: false, time: expect.closeTo(90, 0) });
    expect(() => game.depart()).toThrow('No truck is loading at the outbound dock.');
    // The Parcelo truck docks next; the player sends it early.
    expect(until(game, () => game.carriers()[1].loading)).toBe(true);
    game.depart();
    expect(game.departing).toBe(true);
    game.advance(1);
    expect(notices.filter(notice => notice.type === 'departed').at(-1)).toMatchObject({ carrier: 'parcelo', sent: true });
    expect(game.departing).toBe(false);
    game.dispose();
  });

  it('takes outlet cages to the counter and the lockers, where customers collect the parcels for points', () => {
    for (const outlet of ['counter', 'lockers'] as const) {
      const game = createShiftGame({ scenario: 'peak' }), notices: ShiftNotice[] = [];
      game.subscribe(notice => notices.push(notice));
      expect(until(game, () => channel(game, outlet).cage > 0)).toBe(true);
      const before = channel(game, outlet), sold = line(game, outlet).count;
      game.move('dispatcher', { kind: 'ship', cage: `${outlet}-1` });
      expect(until(game, () => notices.some(notice => notice.type === 'delivered'))).toBe(true);
      // Packers may add parcels to the cage while the dispatcher walks to it.
      const delivered = notices.find(notice => notice.type === 'delivered');
      expect(delivered).toMatchObject({ outlet });
      expect(delivered?.type === 'delivered' && delivered.parcels).toBeGreaterThanOrEqual(before.cage);
      expect(channel(game, outlet).there).toBeGreaterThan(0);
      expect(until(game, () => line(game, outlet).count > sold)).toBe(true);
      expect(scored(notices).filter(notice => notice.channel === outlet).at(-1)).toMatchObject({ at: outlet === 'counter' ? 'collect:counter' : 'collect:lockers' });
      game.dispose();
    }
  });

  it('loads the delivery bike, which leaves on its round with the parcels and comes back', () => {
    // Outlets are drawn at random per order; in this seed's peak shift a bike parcel is packed early enough to ship it.
    const game = createShiftGame({ scenario: 'peak', seed: 3 }), notices: ShiftNotice[] = [];
    game.subscribe(notice => notices.push(notice));
    expect(game.bike()).toEqual({ away: false, next: 45 });
    expect(until(game, () => channel(game, 'bike').cage > 0)).toBe(true);
    game.move('dispatcher', { kind: 'ship', cage: 'bike-1' });
    expect(until(game, () => channel(game, 'bike').there > 0)).toBe(true);
    const loaded = channel(game, 'bike').there;
    expect(until(game, () => game.bike().away)).toBe(true);
    // It left with every parcel loaded: their items score the bike's points over the bike as it rides off.
    expect(scored(notices).filter(notice => notice.channel === 'bike')).toEqual([expect.objectContaining({ at: 'courier-bike', points: 3 * line(game, 'bike').count, text: `Delivery bike left with ${loaded} ${loaded === 1 ? 'parcel' : 'parcels'}` })]);
    expect(channel(game, 'bike').there).toBe(0);
    // While it is out, a cage for it waits.
    expect(game.bike().next).toBeCloseTo(25, 0);
    expect(until(game, () => !game.bike().away)).toBe(true);
    game.dispose();
  });

  it('reports the channels, carriers and revisions the HUD reads', () => {
    const game = createShiftGame({ scenario: 'peak' }), records = game.recordsRevision;
    expect(game.channels().map(item => [item.id, item.capacity])).toEqual([['checkout', 0], ['counter', 8], ['lockers', 16], ['bike', 6], ['truck', 0]]);
    // The shelves start less than half full; six parcels wait in the lockers.
    expect(channel(game, 'checkout').there).toBeLessThan(240);
    expect(channel(game, 'lockers').there).toBe(6);
    expect(game.carriers()).toMatchObject([{ carrier: 'swift', cutoff: '11:30', remaining: 90, loading: true }, { carrier: 'parcelo', cutoff: '16:00', remaining: 360, loading: false }]);
    game.move('forklift', { kind: 'unload', dock: 'D1' });
    expect(game.recordsRevision).toBeGreaterThan(records);
    const scene = game.sceneRevision;
    game.advance(100);
    expect(game.sceneRevision).toBeGreaterThan(scene);
    expect(game.carriers()[0].remaining).toBeNull();
    expect(game.carriers()[1].remaining).toBeCloseTo(260);
    game.dispose();
  });

  it('scores a scripted shift on every level', () => {
    const all = (game: ShiftGame) => { for (const item of game.actors()) game.assist(item.id, true); };
    const scripts: Record<ShiftScenario, readonly Command[]> = {
      // Quiet Tuesday runs on assist; the player sends the Parcelo truck once its parcels are out.
      steady: [[300, game => { if (game.carriers()[1].loading) game.depart(); }]],
      peak: [
        [0, game => { game.move('dispatcher', { kind: 'ship', cage: 'swift-1' }); game.move('dispatcher', { kind: 'ship', cage: 'swift-2' }); game.move('forklift', { kind: 'unload', dock: 'D1' }); }],
        [1, game => { for (const pallet of staging(game).slice(0, 3)) game.move('reach-truck', putAway(game, pallet)); }],
        [100, all],
      ],
    };
    const totals = Object.fromEntries((Object.keys(scripts) as ShiftScenario[]).map(scenario => {
      const { report } = play(scenario, scripts[scenario]);
      return [scenario, [report.score.total, ...report.score.lines.map(item => item.count), report.putAway, report.replenished, report.restocked]];
    }));
    expect(totals).toEqual(RECORDED_TOTALS);
  });

  it('gives the same result for the same seed and commands, however time is sliced', () => {
    const commands: readonly Command[] = [[0, game => { game.move('forklift', { kind: 'unload', dock: 'D1' }); game.assist('reach-truck', true); }], [12.5, game => game.assist('replenisher', true)], [60, game => game.move('dispatcher', { kind: 'ship', cage: 'swift-1' })], [200, game => { game.assist('shelf-filler', true); game.assist('dispatcher', true); }]];
    const a = play('peak', commands, .5), b = play('peak', commands, .5), c = play('peak', commands, .1);
    expect(b.report).toEqual(a.report);
    expect(b.notices).toEqual(a.notices);
    expect(c.report).toEqual(a.report);
    expect(b.game.snapshot()).toEqual(a.game.snapshot());
    // Another seed gives another shift.
    const other = createShiftGame({ scenario: 'peak', seed: 2 }); other.advance(SHIFT_SECONDS);
    expect(other.report().score).not.toEqual(play('peak').report.score);
  });
});

/**
 * Score; items sold at the checkouts, at the counter, from the lockers, by bike and by truck; pallets put away, cartons
 * replenished and cartons restocked of each scripted shift. Record new ones only when the rules are meant to change.
 */
const RECORDED_TOTALS = { steady: [149, 69, 6, 7, 3, 19, 0, 2, 6], peak: [263, 134, 16, 9, 0, 35, 8, 11, 5] };

import { describe, expect, it } from 'vitest';
import type { AssetNode } from '@opsorama/core';
import type { EcommerceScenario } from '../apps/site/src/features/ecommerce/model';
import type { Move } from '../apps/site/src/features/ecommerce/simulation';
import { QUEUE_LIMIT, SHIFT_SECONDS, createShiftGame, type ShiftEvent, type ShiftEventKind, type ShiftGame, type ShiftNotice } from '../apps/site/src/features/cutoff/rules';

type Command = readonly [number, (game: ShiftGame) => void];
/**
 * Play a shift: commands at their times, and each event answered with the choice given for its kind (unlisted kinds run out to
 * their default).
 */
function play(scenario: EcommerceScenario, commands: readonly Command[] = [], answers: Partial<Record<ShiftEventKind, string>> = {}, slice = 1) {
  const game = createShiftGame({ scenario, seed: 1 }), notices: ShiftNotice[] = [], pending: ShiftEvent[] = [];
  game.subscribe(notice => { notices.push(notice); if (notice.type === 'event-opened' && answers[notice.event.kind]) pending.push(notice.event); });
  const queue = [...commands].sort((a, b) => a[0] - b[0]);
  while (!game.over) {
    while (queue.length && queue[0][0] <= game.time + 1e-9) queue.shift()![1](game);
    for (const event of pending.splice(0)) game.answer(event.id, answers[event.kind]!);
    game.advance(slice);
  }
  return { game, notices, report: game.report() };
}
/** Run until the condition holds or the shift ends. */
function until(game: ShiftGame, done: () => boolean, limit = SHIFT_SECONDS) { while (!done() && game.time < limit && !game.over) game.advance(.5); return done(); }
const opened = (game: ShiftGame, kind: ShiftEventKind) => { let event: ShiftEvent | undefined; const stop = game.subscribe(notice => { if (notice.type === 'event-opened' && notice.event.kind === kind) event = notice.event; }); expect(until(game, () => !!event)).toBe(true); stop(); return event!; };
const dock = (game: ShiftGame, id: string) => game.snapshot().docks.find(item => item.id === id)!;
const points = (game: ShiftGame, id: string) => game.score().lines.find(line => line.id === id)!;
const actor = (game: ShiftGame, id: string) => game.actors().find(item => item.id === id)!;
const robot = (game: ShiftGame) => game.nodes().find(node => node.id === 'robot:0') as AssetNode;
const staging = (game: ShiftGame) => game.snapshot().units.filter(unit => unit.kind === 'pallet' && unit.at === 'On the floor').map(unit => unit.id);
/** The best put-away of a pallet in staging. */
const putAway = (game: ShiftGame, pallet: string) => game.options(pallet, 'reach-truck')[0].options[0].move;
const ended = (notices: readonly ShiftNotice[], actorId: string) => notices.filter((notice): notice is Extract<ShiftNotice, { type: 'move-ended' }> => notice.type === 'move-ended' && notice.actor === actorId);

describe('Cut-off shift game', () => {
  it('runs a level from its start to the end of the shift, then stops', () => {
    for (const [scenario, start, end] of [['steady', '10:00', '18:00'], ['peak', '10:00', '18:00'], ['night', '22:00', '06:00']] as const) {
      const game = createShiftGame({ scenario, seed: 1 }), notices: ShiftNotice[] = [];
      game.subscribe(notice => notices.push(notice));
      expect(game.clock).toBe(start);
      game.advance(90);
      expect(game.clock).toBe(scenario === 'night' ? '23:30' : '11:30');
      game.advance(SHIFT_SECONDS);
      expect([game.over, game.time, game.clock]).toEqual([true, SHIFT_SECONDS, end]);
      expect(notices.filter(notice => notice.type === 'shift-ended')).toHaveLength(1);
      expect(() => game.move('forklift', { kind: 'unload', dock: 'D1' })).toThrow('The shift is over.');
      game.advance(10);
      expect(game.time).toBe(SHIFT_SECONDS);
      game.dispose();
    }
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
    expect(() => game.move('reach-truck', { kind: 'put-away', pallet: d, rack: 'R04' })).toThrow(/^R04 holds Outdoor goods and does not take/);
    expect(() => game.move('forklift', moves[0])).toThrow('The forklift does not put away; that is a move of the reach truck.');
    expect(() => game.move('dispatcher', { kind: 'ship', cage: 'parcelo-1' })).toThrow('The truck at D3 is SwiftPost\'s; parcelo-1 goes with Parcelo.');
    expect(() => game.cancelMove('reach-truck', 0)).toThrow('Reach truck works on command 0; stop it instead.');
    expect(() => game.cancelMove('reach-truck', 2)).toThrow('Reach truck has no waiting command 2; waiting commands: 1 to 1.');
    expect(() => game.stop('forklift')).toThrow('Forklift has no command to stop.');
    expect(until(game, () => actor(game, 'reach-truck').queue.length === 0)).toBe(true);
    expect(ended(notices, 'reach-truck').map(notice => notice.outcome)).toEqual(['done', 'done']);
    expect(points(game, 'put-away').count).toBe(2);
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
    expect(game.options('dock:D1')).toEqual([{ actor: { id: 'forklift', role: 'forklift', label: 'Forklift' }, options: [{ move: { kind: 'unload', dock: 'D1' }, target: 'Staging lane' }], refused: [] }]);
    expect(game.options('flow:F3').map(item => [item.actor.id, item.options.map(option => option.target)])).toEqual([['reach-truck', []], ['replenisher', []], ['shelf-filler', ['Outdoor · from F3']]]);
    expect(game.options('cage:swift-1').map(item => item.options.map(option => option.move))).toEqual([[{ kind: 'ship', cage: 'swift-1' }]]);
    expect(game.options('checkout:C1')).toEqual([]);
    expect(game.options(pallet, 'forklift')).toEqual([]);
    game.dispose();
  });

  it('charges docked trucks that nobody unloads', () => {
    const idle = play('peak'), unloaded = play('peak', [[0, game => { game.move('forklift', { kind: 'unload', dock: 'D1' }); game.assist('reach-truck', true); }]], { 'late-truck': 'expedite' });
    expect(dock(idle.game, 'D2')).toMatchObject({ status: 'expected', pallets: { done: 0 } });
    expect(points(unloaded.game, 'truck-waiting').count).toBeLessThan(points(idle.game, 'truck-waiting').count);
    expect(points(idle.game, 'truck-waiting').count).toBeGreaterThan(30);
  });

  it('sends the outbound truck at its cut-off or when the player says, and scores what it ships', () => {
    const game = createShiftGame({ scenario: 'peak' }), notices: ShiftNotice[] = [];
    game.subscribe(notice => notices.push(notice));
    game.move('dispatcher', { kind: 'ship', cage: 'swift-1' });
    expect(until(game, () => actor(game, 'dispatcher').queue.length === 0)).toBe(true);
    expect(points(game, 'on-time').count).toBeGreaterThan(0);
    // It stays until the SwiftPost cut-off at 11:30, 90 minutes into the shift.
    until(game, () => notices.some(notice => notice.type === 'departed'));
    expect(notices.find(notice => notice.type === 'departed')).toMatchObject({ carrier: 'swift', sent: false, time: expect.closeTo(90, 0) });
    expect(() => game.depart()).toThrow('No truck is loading at the outbound dock.');
    // The Parcelo truck docks next; the player sends it early.
    expect(until(game, () => game.carriers()[1].loading)).toBe(true);
    game.depart();
    expect(game.decisions().departing).toBe(true);
    game.advance(1);
    expect(notices.filter(notice => notice.type === 'departed').at(-1)).toMatchObject({ carrier: 'parcelo', sent: true });
    expect(game.decisions().departing).toBe(false);
    game.dispose();
  });

  it('robot breakdown: the technician brings it back sooner for points', () => {
    for (const [choice, back] of [['repair', 30], ['wait', 150]] as const) {
      const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'robot-breakdown');
      expect(robot(game).state).toBe('critical');
      game.answer(event.id, choice);
      const at = event.opened + back;
      until(game, () => game.time >= at - 1); expect(robot(game).state).toBe('critical');
      until(game, () => game.time >= at + .5); expect(robot(game).state).toBeUndefined();
      expect(points(game, 'events').points).toBe(choice === 'repair' ? -8 : 0);
      game.dispose();
    }
  });

  it('short pick: replenishing queues the reach truck and the replenisher, cancelling removes the order', () => {
    const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'short-pick');
    expect(event.choices.map(choice => choice.id)).toEqual(['replenish', 'cancel', 'wait']);
    expect(event.text).toBe('Order #50419 waits: OUT-215 is out at pick face F3.');
    game.move('reach-truck', putAway(game, staging(game)[0]));
    game.answer(event.id, 'replenish');
    // The replenishment goes right after the command the reach truck works on.
    expect(actor(game, 'reach-truck').queue.map(move => move.kind)).toEqual(['put-away', 'replenish']);
    expect(actor(game, 'replenisher').queue).toEqual([{ kind: 'decant', face: 'F3' }]);
    expect(until(game, () => game.report().replenished > 0)).toBe(true);
    game.dispose();
    for (const choice of ['cancel', 'wait']) {
      const other = createShiftGame({ scenario: 'peak' }), short = opened(other, 'short-pick');
      other.answer(short.id, choice);
      expect(other.snapshot().orders.some(order => order.id === short.subject)).toBe(choice === 'wait');
      expect(points(other, 'events').points).toBe(choice === 'cancel' ? -6 : 0);
      other.dispose();
    }
  });

  it('late truck: a priority slot costs points, waiting holds its unload for 90 minutes', () => {
    for (const choice of ['expedite', 'wait']) {
      const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'late-truck');
      game.move('forklift', { kind: 'unload', dock: event.subject as never });
      game.advance(.5);
      expect(actor(game, 'forklift').waiting).toBe(`The truck at ${event.subject} is late; answer its event first.`);
      game.answer(event.id, choice);
      game.advance(.5);
      if (choice === 'wait') expect(actor(game, 'forklift').waiting).toMatch(new RegExp(`^The truck at ${event.subject} is late; it may unload from \\d\\d:\\d\\d\\.$`));
      until(game, () => game.report().unloaded > 0);
      expect(game.time >= event.opened + 90).toBe(choice === 'wait');
      expect(points(game, 'events').points).toBe(choice === 'expedite' ? -10 : 0);
      game.dispose();
    }
  });

  it('store rush: restocking puts the two emptiest departments first for the shelf filler', () => {
    const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'store-rush');
    expect(event.choices.map(choice => choice.id)).toEqual(['restock', 'ride']);
    const facings = game.snapshot().shop.facings;
    game.answer(event.id, 'restock');
    const queue = actor(game, 'shelf-filler').queue;
    expect(queue).toHaveLength(2);
    expect(queue.every(move => move.kind === 'restock' && move.source === 'face')).toBe(true);
    const [first, second] = queue.map(move => move.kind === 'restock' ? facings[move.department] : -1);
    expect(first).toBeLessThanOrEqual(second);
    expect(points(game, 'events').points).toBe(0);
    game.dispose();
  });

  it('key customer: a promise puts the order first and pays off only before the cut-off', () => {
    const shipping: readonly Command[] = [[0, game => game.assist('dispatcher', true)]];
    const promised = play('peak', shipping, { 'vip-order': 'first' }), declined = play('peak', shipping, { 'vip-order': 'decline' });
    const result = (notices: readonly ShiftNotice[]) => notices.flatMap(notice => notice.type === 'scored' && notice.line === 'events' && /Key customer/.test(notice.text) ? [notice.points] : []);
    expect(result(promised.notices)).toHaveLength(1);
    expect([20, -10]).toContain(result(promised.notices)[0]);
    expect(result(declined.notices)).toEqual([]);
    const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'vip-order');
    expect(() => game.answer(event.id, 'maybe')).toThrow('Key customer has no choice maybe; choices: first, decline.');
    game.answer(event.id, 'first');
    expect(() => game.answer(event.id, 'first')).toThrow(`No open event ${event.id}.`);
    game.dispose();
  });

  it('reports the carriers, conditions and revisions the HUD reads', () => {
    const game = createShiftGame({ scenario: 'peak' }), records = game.recordsRevision;
    expect(game.carriers()).toMatchObject([{ carrier: 'swift', cutoff: '11:30', remaining: 90, loading: true }, { carrier: 'parcelo', cutoff: '16:00', remaining: 360, loading: false }]);
    game.move('forklift', { kind: 'unload', dock: 'D1' });
    expect(game.recordsRevision).toBeGreaterThan(records);
    expect(game.decisions()).toEqual({ late: {}, stopped: {}, departing: false });
    const scene = game.sceneRevision;
    game.advance(100);
    expect(game.sceneRevision).toBeGreaterThan(scene);
    expect(game.carriers()[0].remaining).toBeNull();
    expect(game.carriers()[1].remaining).toBeCloseTo(260);
    game.dispose();
    const night = createShiftGame({ scenario: 'night' });
    expect(night.carriers().map(item => item.remaining)).toEqual([null, null]);
    night.dispose();
  });

  it('applies the default choice when an event is not answered in time', () => {
    const { report } = play('night');
    expect(report.events).toEqual([{ kind: 'late-truck', choice: 'wait', auto: true }]);
  });

  it('scores a scripted shift on every level', () => {
    const all = (game: ShiftGame) => { for (const item of game.actors()) game.assist(item.id, true); };
    const scripts: Record<EcommerceScenario, readonly Command[]> = {
      // Quiet Tuesday runs on assist; the player sends the Parcelo truck once its parcels are out.
      steady: [[300, game => { if (game.carriers()[1].loading) game.depart(); }]],
      peak: [
        [0, game => { game.move('dispatcher', { kind: 'ship', cage: 'swift-1' }); game.move('dispatcher', { kind: 'ship', cage: 'swift-2' }); game.move('forklift', { kind: 'unload', dock: 'D1' }); }],
        [1, game => { for (const pallet of staging(game).slice(0, 3)) game.move('reach-truck', putAway(game, pallet)); }],
        [100, all],
      ],
      night: [[0, all]],
    };
    const answers = { 'robot-breakdown': 'repair', 'late-truck': 'expedite', 'store-rush': 'restock', 'vip-order': 'first', 'short-pick': 'replenish' } as const;
    const totals = Object.fromEntries((Object.keys(scripts) as EcommerceScenario[]).map(scenario => {
      const { game, report } = play(scenario, scripts[scenario], answers);
      // The night bonus goes to a shift that ends with every pick face at or above its minimum.
      expect(points(game, 'stocked').count, scenario).toBe(scenario === 'night' && !game.snapshot().alerts.length ? 1 : 0);
      return [scenario, [report.score.total, report.shipped, report.putAway, report.replenished, report.restocked]];
    }));
    expect(totals).toEqual(RECORDED_TOTALS);
  });

  it('gives the same result for the same seed and commands, however time is sliced', () => {
    const commands: readonly Command[] = [[0, game => { game.move('forklift', { kind: 'unload', dock: 'D1' }); game.assist('reach-truck', true); }], [12.5, game => game.assist('replenisher', true)], [60, game => game.move('dispatcher', { kind: 'ship', cage: 'swift-1' })], [200, game => game.assist('shelf-filler', true)]];
    const answers = { 'robot-breakdown': 'repair', 'store-rush': 'restock' } as const;
    const a = play('peak', commands, answers, .5), b = play('peak', commands, answers, .5), c = play('peak', commands, answers, .1);
    expect(b.report).toEqual(a.report);
    expect(b.notices).toEqual(a.notices);
    expect(c.report).toEqual(a.report);
    expect(b.game.snapshot()).toEqual(a.game.snapshot());
    // Another seed gives another shift.
    const other = createShiftGame({ scenario: 'peak', seed: 2 }); other.advance(SHIFT_SECONDS);
    expect(other.report().score).not.toEqual(play('peak').report.score);
  });
});

/** Score, orders shipped, pallets put away, cartons replenished and cartons restocked of each scripted shift; record new ones only when the rules are meant to change. */
const RECORDED_TOTALS = { steady: [112, 14, 0, 2, 3], peak: [247, 33, 7, 13, 5], night: [44, 0, 11, 1, 0] };

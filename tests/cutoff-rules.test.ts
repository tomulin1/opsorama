import { describe, expect, it } from 'vitest';
import type { AssetNode } from '@opsorama/core';
import type { EcommerceScenario } from '../apps/site/src/features/ecommerce/model';
import { SHIFT_SECONDS, createShiftGame, type ShiftEvent, type ShiftEventKind, type ShiftGame, type ShiftNotice } from '../apps/site/src/features/cutoff/rules';

type Command = readonly [number, (game: ShiftGame) => void];
/**
 * Play a shift: commands at their times, and each event answered with the choice
 * given for its kind (unlisted kinds run out to their default).
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
const lane = (game: ShiftGame, id: string) => game.snapshot().shop.checkouts.find(item => item.id === id)!;
const dock = (game: ShiftGame, id: string) => game.snapshot().docks.find(item => item.id === id)!;
const points = (game: ShiftGame, id: string) => game.score().lines.find(line => line.id === id)!;
const robot = (game: ShiftGame) => game.nodes().find(node => node.id === 'robot:0') as AssetNode;

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
      expect(() => game.setCheckout('C1', true)).toThrow('The shift is over.');
      game.advance(10);
      expect(game.time).toBe(SHIFT_SECONDS);
      game.dispose();
    }
  });

  it('moves a person to another zone between tasks', () => {
    const game = createShiftGame({ scenario: 'peak' });
    game.assign('packer:K3', 'restocking');
    expect(until(game, () => game.staff().find(person => person.id === 'packer:K3')!.zone === 'restocking')).toBe(true);
    expect(until(game, () => game.snapshot().tasks.some(task => task.id === 'packer:K3' && task.what.startsWith('Restocking')))).toBe(true);
    expect(() => game.assign('picker:0', 'packing')).toThrow('Picker 1 cannot move to packing now; possible zones: picking.');
    expect(() => game.assign('forklift', 'packing')).toThrow('Unknown person: forklift.');
    game.dispose();
  });

  it('puts a prioritized carrier or order first and clears priorities', () => {
    const picks = (game: ShiftGame) => game.snapshot().tasks.filter(task => task.id.startsWith('picker:')).map(task => task.what.slice(8));
    const first = (setup: (game: ShiftGame) => void) => {
      const game = createShiftGame({ scenario: 'peak' }), seen: string[] = [];
      setup(game);
      while (seen.length < 8 && game.time < 300) { game.advance(.5); for (const id of picks(game)) if (!seen.includes(id)) seen.push(id); }
      game.dispose();
      return seen;
    };
    // The first three picks start with the shift; after them the priorities apply.
    const plain = first(() => {});
    expect(plain).toEqual(['#50421', '#50424', '#50426', '#50431', '#50432', '#50419', '#50433', '#50434']);
    // A SwiftPost order placed later is picked before the released Parcelo order #50432.
    expect(first(game => game.prioritize('swift'))).toEqual(['#50421', '#50424', '#50426', '#50431', '#50434', '#50419', '#50432', '#50433']);
    // One order goes before everything else, and clearing the priorities restores the order of arrival.
    expect(first(game => game.prioritize('#50432'))[3]).toBe('#50432');
    expect(first(game => { game.prioritize('#50432'); game.prioritize(null); })).toEqual(plain);
    const game = createShiftGame({ scenario: 'peak' });
    expect(() => game.prioritize('#1')).toThrow('#1 is neither a parcel carrier nor an order still in work.');
    expect(() => game.prioritize('freight')).toThrow('neither a parcel carrier');
    game.prioritize(null);
    game.dispose();
  });

  it('opens and closes checkouts, and staffed lanes cost points', () => {
    const game = createShiftGame({ scenario: 'peak' });
    game.setCheckout('C3', true); game.setCheckout('C1', false);
    game.advance(.1);
    expect(lane(game, 'C3')).toMatchObject({ open: true, cashier: 'Ada' });
    expect(until(game, () => !lane(game, 'C1').open)).toBe(true);
    game.advance(60);
    // Two lanes for a minute of play: four lane half hours.
    expect(points(game, 'lane-open').count).toBeGreaterThanOrEqual(4);
    expect(() => game.setCheckout('C9' as never, true)).toThrow('Unknown checkout: C9.');
    expect(() => createShiftGame({ scenario: 'night' }).setCheckout('C1', true)).toThrow('The shop is closed on this shift.');
    game.dispose();
  });

  it('unloads a truck only when told, and a waiting truck costs points', () => {
    const idle = play('peak'), unloaded = play('peak', [[0, game => game.unloadTruck('D2')]], { 'late-truck': 'expedite' });
    expect(dock(idle.game, 'D2')).toMatchObject({ status: 'expected', pallets: { done: 0 } });
    // The forklift starts on D2 once D1 is done; the full staging lane then sets the pace.
    expect(dock(unloaded.game, 'D2').status).toBe('unloading');
    expect(points(unloaded.game, 'truck-waiting').count).toBeLessThan(points(idle.game, 'truck-waiting').count);
    const game = createShiftGame({ scenario: 'peak' });
    expect(() => game.unloadTruck('D3')).toThrow('D3 is not an inbound dock.');
    // Before a booking, the permission waits for the next truck.
    const night = createShiftGame({ scenario: 'night' });
    night.unloadTruck('D1');
    expect(until(night, () => dock(night, 'D1').status === 'unloading')).toBe(true);
    night.dispose();
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

  it('short pick: cancelling removes the order for points, waiting keeps it', () => {
    for (const choice of ['cancel', 'wait']) {
      const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'short-pick');
      game.answer(event.id, choice);
      expect(game.snapshot().orders.some(order => order.id === event.subject)).toBe(choice === 'wait');
      expect(points(game, 'events').points).toBe(choice === 'cancel' ? -6 : 0);
      game.dispose();
    }
  });

  it('late truck: a priority slot costs points, waiting holds the unload for 90 minutes', () => {
    for (const choice of ['expedite', 'wait']) {
      const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'late-truck');
      game.unloadTruck(event.subject as never);
      game.answer(event.id, choice);
      until(game, () => dock(game, event.subject).status === 'unloading');
      expect(game.time >= event.opened + 90).toBe(choice === 'wait');
      expect(points(game, 'events').points).toBe(choice === 'expedite' ? -10 : 0);
      game.dispose();
    }
  });

  it('store rush: temporary cashiers open every lane for the rush', () => {
    for (const choice of ['temp', 'ride']) {
      const game = createShiftGame({ scenario: 'peak' }), event = opened(game, 'store-rush');
      game.answer(event.id, choice);
      game.advance(1);
      expect(lane(game, 'C3').open).toBe(choice === 'temp');
      expect(points(game, 'events').points).toBe(choice === 'temp' ? -6 : 0);
      // After the rush the lane takes no new customers and closes once they are served.
      if (choice === 'temp') {
        until(game, () => game.time >= event.opened + 90);
        expect(game.snapshot().events.map(item => item.text)).toContain('Checkout 3 closes once its queue is served.');
      }
      game.dispose();
    }
  });

  it('key customer: a promise puts the order first and pays off only before the cut-off', () => {
    const promised = play('peak', [], { 'vip-order': 'first' }), declined = play('peak', [], { 'vip-order': 'decline' });
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

  it('reports the decisions, carrier countdowns and revisions the HUD reads', () => {
    const game = createShiftGame({ scenario: 'peak' }), records = game.recordsRevision;
    expect(game.carriers()).toMatchObject([{ carrier: 'swift', cutoff: '11:30', remaining: 90 }, { carrier: 'parcelo', cutoff: '16:00', remaining: 360 }]);
    game.assign('packer:K3', 'restocking'); game.prioritize('swift'); game.setCheckout('C3', true); game.unloadTruck('D2');
    expect(game.recordsRevision).toBeGreaterThan(records);
    expect(game.decisions()).toMatchObject({ moving: { 'packer:K3': 'restocking' }, carrier: 'swift', orders: [], lanes: { C1: true, C2: true, C3: true }, unload: ['D1', 'D2'] });
    const scene = game.sceneRevision;
    game.advance(100);
    expect(game.sceneRevision).toBeGreaterThan(scene);
    expect(game.decisions().moving).toEqual({});
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
    const scripts: Record<EcommerceScenario, readonly Command[]> = {
      steady: [[0, game => game.prioritize('parcelo')], [5, game => game.assign('replenisher', 'packing')], [150, game => game.setCheckout('C2', true)]],
      peak: [[0, game => { game.unloadTruck('D2'); game.setCheckout('C3', true); }], [10, game => game.assign('shelf-filler', 'replenishing')], [100, game => game.prioritize('parcelo')]],
      night: [[0, game => game.unloadTruck('D1')], [30, game => game.assign('replenisher', 'restocking')]],
    };
    const answers = { 'robot-breakdown': 'repair', 'late-truck': 'expedite', 'store-rush': 'temp', 'vip-order': 'first', 'short-pick': 'cancel' } as const;
    const totals = Object.fromEntries((Object.keys(scripts) as EcommerceScenario[]).map(scenario => { const { report } = play(scenario, scripts[scenario], answers); return [scenario, [report.score.total, report.shipped, report.served, report.putAway]]; }));
    expect(totals).toEqual(RECORDED_TOTALS);
  });

  it('gives the same result for the same seed and commands, however time is sliced', () => {
    const commands: readonly Command[] = [[0, game => game.unloadTruck('D2')], [12.5, game => game.assign('packer:K2', 'replenishing')], [60, game => game.prioritize('swift')], [200, game => game.setCheckout('C3', true)]];
    const answers = { 'robot-breakdown': 'repair', 'store-rush': 'temp' } as const;
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

/** Score, orders shipped, customers served and pallets put away of each scripted shift; record new ones only when the rules are meant to change. */
const RECORDED_TOTALS = { steady: [135, 17, 28, 0], peak: [250, 31, 38, 4], night: [37, 0, 0, 11] };

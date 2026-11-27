import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { EcommerceScenario } from '../apps/site/src/features/ecommerce/model';
import { automaticDirector, createEcommerceSimulation, type EcommerceDirector, type EcommerceSimulation, type StaffZone } from '../apps/site/src/features/ecommerce/simulation';

const CHECKPOINTS = [0, 120, 600, 1200, 3000];
/**
 * Digests of the records and scene nodes at each checkpoint of a seed-7 shift. They were recorded from the scheduler before
 * it became the automatic director, again when the shop changed to six departments of goods, again when every pick
 * face became a carton flow rack, again when the area signs left the scene,
 * again when S1 and S2 moved up beside F4, and again when the courier's cargo bike got its rider. They change only when the simulation is meant to
 * behave differently; record new ones then.
 */
const RECORDED: Readonly<Record<EcommerceScenario, readonly string[]>> = {
  peak: ['1e8ef8b2da4d7640', 'a74548b9bbfc169f', 'a52425f82740c86c', '70282f2627ef84eb', '1a556e874a58f08e'],
  steady: ['6f43c0ca5b994859', '1a1ee27b9c6a42af', '48d968701a1e1091', '7eee113c88253097', 'c16178dc66b55ecf'],
  night: ['de50c265dae45748', '152b5391238a55a8', '301bd28b024805e2', 'e6a7613712b59f85', 'a5e6b608d3c5e1fe'],
};
function digests(simulation: EcommerceSimulation): string[] {
  return CHECKPOINTS.map(at => {
    simulation.advance(at - simulation.time);
    return createHash('sha256').update(JSON.stringify({ snapshot: simulation.snapshot(), nodes: simulation.nodes() })).digest('hex').slice(0, 16);
  });
}
/** Advance in steps and collect what the given agents were doing. */
function watch(simulation: EcommerceSimulation, ids: readonly string[], seconds: number): string[] {
  const seen = new Set<string>();
  for (let elapsed = 0; elapsed < seconds; elapsed += 2) { simulation.advance(2); for (const task of simulation.snapshot().tasks) if (ids.includes(task.id)) seen.add(`${task.id}: ${task.what}`); }
  return [...seen];
}
const picking = (simulation: EcommerceSimulation) => simulation.snapshot().tasks.filter(task => task.id.startsWith('picker:')).map(task => task.what);

describe('e-commerce director', () => {
  it('reproduces the recorded shift with the automatic director in every scenario', () => {
    for (const scenario of Object.keys(RECORDED) as EcommerceScenario[]) {
      // A director that answers like the automatic one through its own functions takes the same decisions.
      const echo: EcommerceDirector = { zone: person => automaticDirector.zone(person), priority: order => automaticDirector.priority(order), checkoutOpen: lane => automaticDirector.checkoutOpen(lane), unload: dock => automaticDirector.unload(dock), running: machine => automaticDirector.running(machine), shoppers: usual => automaticDirector.shoppers(usual), job: (actor, auto) => automaticDirector.job(actor, auto), depart: dock => automaticDirector.depart(dock) };
      for (const simulation of [createEcommerceSimulation(scenario), createEcommerceSimulation(scenario, 7, { director: echo })]) {
        expect(digests(simulation), scenario).toEqual(RECORDED[scenario]);
        simulation.dispose();
      }
    }
  }, 60000);

  it('lists the people on shift with the zones each can move to', () => {
    const simulation = createEcommerceSimulation('peak'), staff = simulation.staff(), of = (id: string) => staff.find(person => person.id === id)!;
    expect(of('picker:0')).toMatchObject({ zone: 'picking', zones: ['picking'] });
    expect(of('sorter:P2')).toMatchObject({ zone: 'sorting', zones: ['sorting'], station: 'P2' });
    expect(of('dispatcher')).toMatchObject({ zone: 'dispatch', zones: ['dispatch'] });
    // All three benches are taken, so only a packer can pack.
    expect(of('packer:K3')).toMatchObject({ zone: 'packing', zones: ['packing', 'replenishing', 'restocking'], station: 'K3', busy: true });
    expect(of('replenisher')).toMatchObject({ zone: 'replenishing', zones: ['replenishing', 'restocking'] });
    expect(staff.map(person => person.id)).not.toContain('forklift');
    simulation.dispose();
  });

  it('moves a person to another zone once their current work is done', () => {
    const peak = createEcommerceSimulation('peak', 7, { director: { zone: person => person.id === 'packer:K3' ? 'restocking' : person.zone } });
    // The packer finishes the order already on the bench, then restocks the shop.
    const done = watch(peak, ['packer:K3'], 600);
    expect(done[0]).toBe('packer:K3: Packing #50409');
    expect(done.slice(1).length).toBeGreaterThan(0);
    expect(done.slice(1).every(task => task.startsWith('packer:K3: Restocking'))).toBe(true);
    expect(peak.staff().find(person => person.id === 'packer:K3')).toMatchObject({ zone: 'restocking', zones: ['packing', 'replenishing', 'restocking'] });
    peak.dispose();

    // On the steady shift two benches are free: the replenisher takes the first and packs there.
    const steady = createEcommerceSimulation('steady', 7, { director: { zone: person => person.id === 'replenisher' ? 'packing' : person.zone } });
    expect(steady.staff().find(person => person.id === 'replenisher')).toMatchObject({ zone: 'packing', station: 'K2' });
    const work = watch(steady, ['replenisher'], 300);
    expect(work.some(task => task.includes('Packing'))).toBe(true);
    expect(work.some(task => task.includes('Fetching'))).toBe(true);
    expect(work.every(task => /Packing|Fetching/.test(task))).toBe(true);
    steady.dispose();
  });

  it('rejects a zone a person cannot work in', () => {
    const zone = (id: string, to: StaffZone) => () => createEcommerceSimulation('peak', 7, { director: { zone: person => person.id === id ? to : person.zone } }).advance(60);
    expect(zone('picker:0', 'packing')).toThrow('Picker 1 cannot move to packing now; possible zones: picking.');
    // Every bench has its packer, so the replenisher cannot pack.
    expect(zone('replenisher', 'packing')).toThrow('Replenisher cannot move to packing now; possible zones: replenishing, restocking.');
  });

  it('lets pickers take a prioritized carrier first', () => {
    const automatic = createEcommerceSimulation('peak'), prioritized = createEcommerceSimulation('peak', 7, { director: { priority: order => order.carrier === 'parcelo' ? 1 : 0 } });
    // The click & collect order #50424 waits; the released Parcelo order #50432 goes first.
    expect(picking(automatic)).toEqual(['Picking #50421', 'Picking #50424', 'Picking #50426']);
    expect(picking(prioritized)).toEqual(['Picking #50421', 'Picking #50426', 'Picking #50432']);
    automatic.dispose(); prioritized.dispose();
  });

  it('closes a checkout once its queue is served and opens a closed one', () => {
    let open: Partial<Record<string, boolean>> = { C1: false, C3: true };
    const simulation = createEcommerceSimulation('peak', 7, { director: { checkoutOpen: lane => open[lane.id] ?? lane.open } }), lane = (id: string) => simulation.snapshot().shop.checkouts.find(item => item.id === id)!;
    // C3 opens at once with a cashier; C1 keeps serving the customers already on their way to it.
    expect(lane('C3')).toMatchObject({ open: true, cashier: 'Ada' });
    expect(lane('C1').open).toBe(true);
    let closedAt = -1, joined = 0, queue = lane('C1').queue;
    for (let elapsed = 0; elapsed < 300; elapsed += 1) {
      simulation.advance(1);
      if (closedAt < 0 && !lane('C1').open) closedAt = simulation.time;
      if (closedAt >= 0 && lane('C1').queue > 0) joined++;
      queue = Math.max(queue, lane('C3').queue);
    }
    expect(closedAt).toBeGreaterThan(0);
    expect(joined).toBe(0);
    expect(queue).toBeGreaterThan(0);
    expect(simulation.nodes().some(node => node.id === 'cashier:C1')).toBe(false);
    expect(simulation.nodes().some(node => node.id === 'cashier:C3')).toBe(true);
    // Reopened, C1 takes customers again.
    open = { C1: true, C3: true };
    simulation.advance(1);
    expect(lane('C1').open).toBe(true);
    simulation.dispose();
  });

  it('holds a docked truck until the forklift may unload it', () => {
    let allowed = false;
    const simulation = createEcommerceSimulation('peak', 7, { director: { unload: () => allowed } }), dock = (id: string) => simulation.snapshot().docks.find(item => item.id === id)!;
    simulation.advance(120);
    // D1 was unloading and pauses; the truck expected at D2 docks and waits.
    expect(dock('D1')).toMatchObject({ status: 'unloading', pallets: { done: 8, total: 14 } });
    expect(dock('D2')).toMatchObject({ status: 'expected', note: 'Docked; waits for the unload.', pallets: { done: 0 } });
    expect(simulation.nodes().some(node => node.id === 'truck:D2')).toBe(true);
    allowed = true;
    simulation.advance(1);
    expect(dock('D2').status).toBe('unloading');
    simulation.advance(120);
    expect(dock('D1').pallets!.done).toBeGreaterThan(8);
    simulation.dispose();
  });
});

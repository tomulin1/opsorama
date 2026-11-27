import { Clock3, Package, Store, Trophy } from 'lucide-react';
import type { Tone } from '@opsorama/react/ui';
import type { HudMetric } from '../example-hud';
import { DEPARTMENTS, departmentCapacity, type EcommerceSnapshot } from '../ecommerce/model';
import type { BikeStatus, CarrierStatus, ChannelStatus, ShiftScore } from './rules';

export const toneOf = (value: number): Tone => value > 0 ? 'success' : value < 0 ? 'critical' : 'neutral';
export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** How stocked the shop's shelves are, and its empty departments. */
export function shelfState(snapshot: EcommerceSnapshot) {
  const capacity = DEPARTMENTS.reduce((sum, item) => sum + departmentCapacity(item.id), 0), facings = DEPARTMENTS.reduce((sum, item) => sum + snapshot.shop.facings[item.id], 0);
  return { percent: Math.round(facings / capacity * 100), empty: DEPARTMENTS.filter(item => snapshot.shop.facings[item.id] === 0).map(item => item.label) };
}

/** What the shift's top panels read from the game. */
export interface ShiftMetricsView { snapshot: EcommerceSnapshot; score: ShiftScore; channels: readonly ChannelStatus[]; carriers: readonly CarrierStatus[]; bike: BikeStatus }

/** The four panels over the top of the Cut-off HUD: score, shop shelves, parcels waiting and the next departure. */
export function cutoffHudMetrics({ snapshot, score, channels, carriers, bike }: ShiftMetricsView): readonly HudMetric[] {
  const sold = score.lines.reduce((sum, line) => sum + line.count, 0);
  const shelves = shelfState(snapshot), truck = carriers.find(item => item.loading), parcelChannels = channels.filter(item => item.id !== 'checkout');
  const waiting = parcelChannels.reduce((sum, item) => sum + item.cage, 0);
  return [
    { id: 'score', title: 'Score', value: score.total, tone: toneOf(score.total), comparison: `${plural(sold, 'item')} sold`, icon: <Trophy size={16} /> },
    { id: 'shelves', title: 'Shop shelves', value: `${shelves.percent}%`, tone: shelves.empty.length ? 'critical' : shelves.percent < 30 ? 'warning' : 'success', comparison: shelves.empty.length ? `Empty: ${shelves.empty.join(', ')}` : 'Every department has goods', icon: <Store size={16} /> },
    { id: 'parcels', title: 'Parcels in cages', value: waiting, tone: waiting > 8 ? 'warning' : 'neutral', comparison: parcelChannels.map(item => `${item.id === 'truck' ? 'trucks' : item.id} ${item.cage}`).join(' · '), icon: <Package size={16} /> },
    { id: 'leaves', title: bike.away ? 'Bike back in' : 'Bike leaves in', value: `${Math.ceil(bike.next)} min`, tone: !bike.away && channels.find(item => item.id === 'bike')!.cage && bike.next < 15 ? 'warning' : 'neutral', comparison: truck ? `${truck.name} truck leaves ${truck.remaining !== null ? `at ${truck.cutoff}` : 'when you send it'}` : 'No truck at D3', icon: <Clock3 size={16} /> },
  ];
}

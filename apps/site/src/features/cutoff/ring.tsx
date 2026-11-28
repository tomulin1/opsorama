import type { ReactNode } from 'react';
import { Move as MoveIcon, Square, Truck, X } from 'lucide-react';
import type { RingAction } from '@opsorama/react/ui';
import type { ActorView, CarrierStatus, ShiftGame } from './rules';
import { moveLabel } from './scene';

/** The commanded machines, whose ring is amber; the people's is green. */
export const MACHINES = new Set(['forklift', 'reach-truck']);
/** What the ring reads from the game besides the actor: the truck loading for the dispatcher and whether it is leaving. */
export interface RingView { carriers: readonly CarrierStatus[]; departing: boolean }
/**
 * The commands of the action ring over the commanded actor: stop or cancel its commands, switch its assist, send the truck
 * (the dispatcher), and Move, which lights what it can take in the scene. A click elsewhere or Escape closes the ring.
 */
export function actorActions(actor: ActorView, view: RingView, game: ShiftGame, run: (action: () => void, text: string) => void, move: { picking: boolean; available: boolean; toggle: () => void }): RingAction<ReactNode>[] {
  const loading = actor.role === 'dispatcher' ? view.carriers.find(item => item.loading) : undefined, [current, next] = actor.queue;
  return [
    ...(current ? [{ id: 'stop', label: 'Stop', icon: <Square fill="currentColor" />, tone: 'critical' as const, ariaLabel: `Stop after this one: ${moveLabel(current)}`, onSelect: () => run(() => game.stop(actor.id), `${actor.label} stops after the current task.`) }] : []),
    ...(next ? [{ id: 'cancel', label: 'Cancel next', icon: <X />, tone: 'warning' as const, ariaLabel: `Cancel the next command: ${moveLabel(next)}`, onSelect: () => run(() => game.cancelMove(actor.id, 1), 'Command cancelled.') }] : []),
    { id: 'auto', label: 'Auto', switch: true, pressed: actor.assist, ariaLabel: 'Work by yourself', onSelect: () => run(() => game.assist(actor.id, !actor.assist), `${actor.label} ${actor.assist ? 'waits for your commands' : 'works by itself without a command'}.`) },
    ...(loading ? [{ id: 'send', label: 'Send truck', icon: <Truck />, tone: 'info' as const, disabled: view.departing, ariaLabel: `Send the ${loading.name} truck now`, onSelect: () => run(() => game.depart(), `The ${loading.name} truck leaves once no cage is on its way to it.`) }] : []),
    // Move lights what the actor can take; pressed while choosing, a second press puts it away.
    { id: 'move', label: 'Move', icon: <MoveIcon />, tone: 'success', primary: true, pressed: move.picking, disabled: !move.available && !move.picking, onSelect: move.toggle },
  ];
}

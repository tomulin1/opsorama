'use client';
import { useState } from 'react';
import { Check, Hand, MapPin, Search, Thermometer, UserPlus, Wrench } from 'lucide-react';
import { ActionRing } from '@opsorama/react/ui';
import '@opsorama/ui/styles.css';
import './panels.css';

/**
 * Live action rings without a scene: a person with three commands, a machine with a switch, and lone round pills for the
 * sources of a command in progress. The last command run is shown below.
 */
export function ActionRingDemo() {
  const [last, setLast] = useState('Nothing yet'), [auto, setAuto] = useState(false);
  const run = (text: string) => () => setLast(text);
  return <section className="action-ring-demo" aria-label="Action ring examples">
    <div className="action-ring-stage">
      <figure><ActionRing title="Server" tone="success" label="Commands of Server" actions={[
        { id: 'assign', label: 'Assign', icon: <UserPlus />, onSelect: run('Assign the server') },
        { id: 'move', label: 'Move', icon: <MapPin />, onSelect: run('Move the server') },
        { id: 'inspect', label: 'Inspect', icon: <Search />, onSelect: run('Inspect the server') },
      ]} /><figcaption>A person</figcaption></figure>
      <figure><ActionRing title="Walk-in cooler" tone="warning" actions={[
        { id: 'readings', label: 'Readings', icon: <Thermometer />, onSelect: run('Show the readings') },
        { id: 'service', label: 'Service', icon: <Wrench />, onSelect: run('Call service') },
        { id: 'auto', label: 'Auto', switch: true, pressed: auto, onSelect: () => { setAuto(value => !value); setLast(auto ? 'Auto off' : 'Auto on'); } },
        { id: 'done', label: 'Done', icon: <Check />, onSelect: run('Done') },
      ]} /><figcaption>A machine with a switch</figcaption></figure>
      <figure className="action-ring-pills">{['1038', '1039', '1040'].map(pallet => <ActionRing key={pallet} density="compact" tone="info" arc={0} label={`Take pallet ${pallet}`} actions={[{ id: pallet, icon: <Hand />, ariaLabel: `Take pallet ${pallet}`, onSelect: run(`Take pallet ${pallet}`) }]} />)}
        <figcaption>Lone round pills over sources</figcaption></figure>
    </div>
    <p className="action-ring-last" role="status">Last command: <strong>{last}</strong></p>
  </section>;
}

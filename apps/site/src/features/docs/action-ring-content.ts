import type { DocArticle } from './content';

/** The action ring: command pills over the chosen object in a scene. */
export const actionRingArticle: DocArticle = {
  slug: 'action-ring', title: 'Action ring', category: 'COMPONENTS',
  description: 'Command pills in a gentle arc over a name pill, shown over the person or machine the user picked in the scene. It is for giving commands, not for showing information: details belong in a panel beside the scene.',
  sections: [
    { id: 'purpose', title: 'Commands, not information', paragraphs: [
      'Pick the action ring when a click on an object in the scene should offer what can be done with it: assign a server, move a forklift, inspect a cooler, take a pallet. Keep it to a handful of verbs. What the object is, how it is doing and what it holds goes into a detail panel (EntityInspector or your own DataPanel), usually on the right, so the ring stays small enough not to hide the scene.',
      'Show the ring only while its object is chosen, and only for objects that have commands. A lone action works too: a ring without a title is a single pill, for example a "Take" or "Bring here" pill over every valid source or target of a command in progress. Give such pills an icon and an accessible name and omit the label, and they become small round buttons.',
    ], demo: 'action-ring' },
    { id: 'place', title: 'Over a node', paragraphs: [
      'The ring is plain HTML from the panel package, so it works over a scene and in an ordinary page. To keep it over a node while the node and the camera move, render it inside NodeHtml (React, Vue) or attach it with renderer.attachHtml in plain JavaScript; align above (the default) puts the name pill just over the node and the actions over the name. Clicks on the ring never reach the scene. Attached HTML stacks in the order it was attached, so attach the chosen object\'s ring after any pills over other nodes when they may overlap.',
      'When a command moves something, the scene shows the rest: renderer.setHighlights tints what the object can pick up, and setPickTargets with ghosts shows where it can bring it (see Handling compatibility, Picking up and moving). The ring keeps to the verbs.',
    ], code: `import { NodeHtml } from '@opsorama/react';
import { ActionRing } from '@opsorama/react/ui';
import { MapPin, Search, UserPlus } from 'lucide-react';

{selected === 'server' && <NodeHtml nodeId="server">
  <ActionRing title="Server" tone="success" label="Commands of Server" actions={[
    { id: 'assign', label: 'Assign', icon: <UserPlus />, onSelect: () => assign('server') },
    { id: 'move', label: 'Move', icon: <MapPin />, onSelect: () => startMove('server') },
    { id: 'inspect', label: 'Inspect', icon: <Search />, onSelect: () => openDetail('server') },
  ]} />
</NodeHtml>}`, language: 'tsx' },
    { id: 'vue', title: 'Native Vue and plain JavaScript', paragraphs: [
      'Vue takes the same input in an options prop; plain JavaScript builds the tree with actionRing and mounts it with mountPanel into an element you attach over the node.',
    ], code: `<!-- Vue -->
<NodeHtml node-id="cooler">
  <ActionRing :options="{ title: 'Walk-in cooler', tone: 'warning', actions: [
    { id: 'readings', label: 'Readings', onSelect: showReadings },
    { id: 'service', label: 'Service', onSelect: callService },
  ] }" />
</NodeHtml>

// Plain JavaScript
import { actionRing } from '@opsorama/ui';
import { mountPanel } from '@opsorama/ui/dom';
const element = document.createElement('div');
const ring = mountPanel(element, actionRing({ title: 'Walk-in cooler', tone: 'warning', actions }));
const handle = renderer.attachHtml('cooler', element);
// Later: ring.update(actionRing({ ...next })); handle.remove(); ring.dispose();`, language: 'typescript' },
    { id: 'behavior', title: 'Behavior and accessibility', list: [
      'The ring is a toolbar of native buttons named by their label or ariaLabel; tab moves through them and Enter or Space runs one. Add your own Escape handling to close it.',
      'pressed makes an action a switch (aria-pressed), disabled shows it dimmed and does not call onSelect.',
      'The actions rise in an arc toward the middle; arc sets the rise in pixels (default 18, 0 for a straight row).',
      'Tones color the name pill\'s outline and each action\'s icon and outline: neutral, info, success, warning and critical. An action may have its own tone. Colors read --ring-info and the other --ring-* variables, then the panel colors.',
      'IDs must be unique; an action without a label needs icon and ariaLabel. Invalid input throws an error that names the fix.',
    ] },
    { id: 'reference', title: 'Reference', headers: ['Input', 'Type', 'Default', 'Meaning'], rows: [
      ['title', 'node', 'none', 'The name pill under the actions; omit it for a lone action.'],
      ['icon', 'node', 'none', 'Icon in the name pill.'],
      ['actions', '[{ id, label?, icon?, tone?, ariaLabel?, pressed?, disabled?, onSelect? }]', 'required', 'The commands, left to right.'],
      ['tone', 'Tone', 'info', 'Outline of the name pill and the default tone of the actions.'],
      ['label', 'string', 'the title when it is text', 'Accessible name of the toolbar.'],
      ['arc', 'number', '18', 'Pixels by which the middle actions rise above the outer ones.'],
      ['className / style', 'string / CSS properties', 'none', 'Host styling of the ring.'],
    ] },
  ],
};

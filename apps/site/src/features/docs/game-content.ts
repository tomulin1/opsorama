import type { DocArticle } from './content';

/** How the Cut-off shift game is built from the dashboard's simulation, scene and panels. */
export const gameArticle: DocArticle = {
  slug: 'game', title: 'Building a game', category: 'RECIPES',
  description: 'Turn a simulated operation into a management game: a director inside the simulation, rules in plain TypeScript, commands in three clicks (actor, source, target), a HUD from the panel package and feedback from existing scene features, all deterministic and unit-tested.',
  sections: [
    { id: 'example', title: 'The example', paragraphs: [
      '/examples/cutoff is Cut-off, a shift game on the online shop and warehouse of the e-commerce recipe. The player keeps the shop and its outlets supplied for eight hours that pass in eight minutes. Goods sell through five channels, and every item sold scores the points of its channel: the shop\'s checkouts 1, the click & collect counter 2, the parcel lockers 3, the delivery bike 3 and the carriers\' trucks 2. Nothing else scores. To sell, the shelves need goods (unload trucks, put pallets away into any free rack position, replenish the pick faces, restock the departments), and the packed parcels have to reach their outlet in time: the dispatcher pushes a roll cage to the counter, the lockers or the bike before customers come and before the bike leaves on its round, and the carriers\' cages onto their truck before its cut-off. The forklift, the reach truck, the replenisher, the shelf filler and the dispatcher move material only on the player\'s commands, or by themselves while their assist is on; picking, packing and the customers run automatically. Two levels reuse the recipe\'s scenarios: a quiet day with every assist on, and the peak.',
      'The game adds no model, effect or package. It runs the same simulation, scene, feed loop and HUD panels as the dashboard, which keeps working unchanged. The game\'s source lives in src/features/cutoff of the website. Its rules and scene glue import nothing from the website, so they can move into a package or a starter later; only the page uses the site\'s header and HUD helpers.',
    ], headers: ['Part', 'Owns', 'File'], rows: [
      ['Simulation', 'Units, agents, records and a director that takes the shift\'s decisions', 'features/ecommerce/simulation.ts'],
      ['Rules', 'Commands, sales channels, score, clock and report; no renderer', 'features/cutoff/rules.ts'],
      ['Scene glue', 'Command labels, goods colors, markers, target lights, floating points, lighting by the clock', 'features/cutoff/scene.ts'],
      ['Commands', 'Sources of an actor, targets of a source, clicks', 'features/cutoff/menu.ts'],
      ['Page', 'The command steps, the action ring and pills, the shift panel that folds into the bottom bar, the HUD and the loop', 'features/cutoff/CutoffGame.tsx'],
    ] },
    { id: 'director', title: 'A director in the simulation', paragraphs: [
      'A dashboard simulation decides everything itself. A game needs those decisions to come from the player. The e-commerce simulation therefore asks a director: which zone each person works in, which orders go first, which checkout lanes are open, when a docked truck may unload, whether a machine runs and how many customers come in. The dashboard passes none and gets automaticDirector, which reproduces the previous scheduler exactly; the game passes a director that reads the player\'s commands. A director answers again every time it is asked, so it changes its mind by answering differently.',
      'The director can also command every move of material. job(actor, auto) gives the next move of the forklift, the reach truck, the replenisher, the shelf filler or the dispatcher, asked whenever the actor is free, and auto() returns what the automatic director would do. Each automatic job is split into choosing a move and building its task, so the automatic director and a player\'s commands run the same code. A repeating move such as unloading a truck continues while the director returns it, and the simulation reports when a move ended, waits for room or was refused, which is what a command queue needs.',
      'A person changes zone only between tasks. The behavior runner can replace an agent\'s steps at any time: it releases the slot reservation, leaves its queue and keeps carried items on the agent. The simulation\'s tasks, however, change records as they run (claimed orders, booked places, units waiting for their hand-over), and nothing undoes them halfway. Waiting for the end of a task keeps every record consistent.',
    ], code: `const simulation = createEcommerceSimulation('peak', seed, {
  director: {
    // The player's next command for this actor, or the automatic move while its assist is on.
    job: (actor, auto) => queues.get(actor.id)?.[0] ?? (assist.has(actor.id) ? auto() : undefined),
    depart: dock => sent || cutoffPassed(dock.partner),
  },
  // Parcels go into the roll cage of their outlet, and customers come for them; the bike rides its rounds.
  capacityRules: true, directorDeparts: true, salesChannels: true,
  // A command leaves its queue the moment it ends, before its actor asks for the next one.
  onEvent: event => { if (event.type === 'move-ended') queues.get(event.actor)?.shift(); inbox.push(event); },
});`, language: 'typescript' },
    { id: 'sales', title: 'Sales channels in the simulation', paragraphs: [
      'The simulation\'s salesChannels option turns the shop into five sales channels; the dashboard leaves it off. New orders go to the click & collect counter, the parcel lockers, the delivery bike or a carrier\'s truck. Packers put each parcel into the roll cage of its outlet, three cages west of the packing benches, and only the dispatcher\'s ship move takes an outlet cage to its outlet, where it hands over as many parcels as there is room for. Customers come for parcels at the counter and the lockers. The bike leaves on a round every 45 minutes with what is loaded and comes back 25 minutes later; it rides off along the road and returns from the other side. In the shop, shoppers come for a department whatever it holds and take two or three items from each gondola, so an empty department loses sales; the shelves start less than half full. The simulation reports every sale as an event (served with the items paid, collected, bike-left, shipped), which the rules score.',
    ] },
    { id: 'rules', title: 'Rules in plain TypeScript', paragraphs: [
      'createShiftGame({ scenario, seed }) wraps the simulation and holds the game: queued commands per actor, assist switches, a shift clock, the five sales channels with their points, and an end-of-shift report. A command is checked when it is queued and again when it starts; one that has to wait for room is accepted and waits, and options(nodeId) lists what every actor can do with a scene node, best target first, with the reasons for the targets it may not use. It has no renderer and no framework, so the rules run in a unit test, a React page, a Vue page or a script alike. Commands validate their input and throw a readable error; every sale is also reported as a notice, which the page floats over the place it happened.',
    ], code: `const game = createShiftGame({ scenario: 'peak', seed: 1 });
game.subscribe(notice => { if (notice.type === 'scored') float(notice.at, notice.points); });  // a sale
game.move('forklift', { kind: 'unload', dock: 'D1' });  // repeats until the truck is empty
const [best] = game.options('pallet:1038', 'reach-truck')[0].options;
game.move('reach-truck', best.move);                     // R12 · level 1 · Toys
game.assist('replenisher', true);                        // works by itself without a command
game.move('dispatcher', { kind: 'ship', cage: 'lockers-1' });  // packed parcels to the lockers
game.depart();                                           // send the outbound truck now
game.advance(30);                                        // any slices; fixed steps inside
game.channels();                           // per channel: items sold, parcels in its cage and at the outlet
game.score();                              // { total, lines: items and points per channel }`, language: 'typescript' },
    { id: 'commands', title: 'Commands in three clicks: actor, source, target', paragraphs: [
      'The player commands one of the crew at a time. A click on the forklift, the reach truck, the replenisher, the shelf filler or the dispatcher (in the scene or on its portrait) opens its command card; its Move command tints everything it can technically take: actorSources asks game.options for every dock, pallet, pick face and roll cage and keeps those with a possible move, including moves that would wait, without material that already has a queued command of the same kind. A click on a tinted source shows a ghost of what it would bring at each of its targets: the pallet at its free rack position, behind the pick face or on the empty-pallet stack, a pallet from the truck in the free staging spot, a carton in the pick face lanes or at each gondola of a department, the roll cage at the outbound dock, the counter, the lockers or the bike. The simulation gives these places with each move option (previews), as renderer pick targets with a ghost. A click on a ghost queues the move, and the actor stays commanded for the next one; a target that would have to wait shows no ghost and is tinted green instead. Escape goes back one step.',
      'The page shows each step with the panel package\'s ActionRing inside NodeHtml. Over the commanded actor a ring offers its commands (Stop, Cancel next, Auto, Send truck for the dispatcher, Move), green for people and amber for machines; what each of the crew does shows on its portrait in the shift panel. The sources glow cyan through renderer.setHighlights, a light that brightens any goods color and stands apart from all of them, and the ghosts come from setPickTargets; the problem markers step aside while a command is given. For the keyboard, every source has a Take pill and every target a Bring here pill with its name, hidden until it gets focus, so a shift can be played without a mouse too. Clicks on the scene nodes work through onPointer with preventSelection(): a click on a pallet standing in a rack counts for the rack, and a click anywhere else ends the command, so the ring hides, and selects what was clicked. The ring is a compact translucent card with a leader line to the actor: Stop in red, Auto as a switch and Move filled in green, pressed while the player chooses; after a move is queued the card stays open for the next Move. The card unfolds out of the label of the actor, which hides while the card is open; the card title has the size of the label.',
    ], code: `// Step 1: the actor's sources; step 2: the chosen source's targets; step 3: queue the move.
const sources = actorSources(actor, snapshot, (subject, who) => game.options(subject, who), queued);
renderer.setHighlights(source ? targetTints(source, snapshot) : sourceTints(sources));   // tint what can be taken
renderer.setPickTargets(source ? source.options.flatMap(option => option.previews ?? []) : null, (target, index) => bring(index));   // ghosts
onPointer: event => {
  const nodes = clickedNodes(event.nodeId, event.ancestors, snapshot);
  if (!source) setSource(sources.find(item => nodes.includes(item.node)));
  else { const found = pickTarget(source, nodes, snapshot); if (found && 'option' in found) game.move(actor, found.option.move); }
}`, language: 'tsx' },
    { id: 'hud', title: 'A HUD from the panel package', paragraphs: [
      'The HUD is the same set of panels as the dashboards: DataPanel for the shift panel on the left (the sales channels with what each holds and has sold, the crew, stock, and receiving with the free rack positions and the pallet colors) and the dialogs, and MetricCard for the score, the shop\'s shelves, the parcels waiting in cages and the bike\'s next departure. The shift panel folds into the bottom bar, where a tab with the score opens it again, so the scene gets the whole width. The game only passes data and handlers in. Pause and speed are the scene settings paused and speed: the loop that advances the game reads them every frame, as the dashboard\'s feed loop does, so the scene and the rules stop and speed up together.',
    ] },
    { id: 'feedback', title: 'Feedback with existing scene features', paragraphs: [
      'The game uses no post-processing. Time of day is the lighting setting: studio by day and dusk from 16:00. Each type of goods has a color, the tone of its iconic item in the shop, which the game applies to the e-commerce scene while the dashboard keeps neutral colors: a pallet\'s cartons through the node\'s color, the cartons in a pick face\'s lanes through materials.surface and a gondola through its color, so the scene shows where goods belong without new models. What is about to lose sales shows as marker nodes attached to the object it concerns: an empty department, a counter or lockers with nothing to hand over while their parcels wait in the cage, the bike or a truck about to leave with parcels still in their cages, a truck waiting to unload, an actor waiting for room. The markers follow their object as it moves. Sales are billboard text nodes attached above the place they happened; they rise a little on every publish and are removed after two and a half seconds of play, which stands in for a fade.',
    ] },
    { id: 'testing', title: 'Determinism and testing', paragraphs: [
      'The simulation and the rules run in fixed steps of 0.1 seconds from a seed, and every event time is drawn from the seed when a shift starts. The same seed and the same commands at the same times therefore give the same shift, however advance is sliced. That makes the game testable without a browser.',
    ], list: [
      'Every command, its effect and its errors, in a unit test that plays part of a shift.',
      'Each sales channel: parcels taken to the counter, the lockers and the bike, and the points of what customers collect and what the bike and the trucks take.',
      'The score of a scripted shift per level, recorded and compared.',
      'Determinism: the same report, notices and snapshot for two runs, and for different slices of time.',
      'The dashboard unchanged: digests of its records and scene nodes, recorded before the director and the sales channels existed, still match.',
    ] },
    { id: 'limits', title: 'Current limits', list: [
      'Command mode is built in the page from selection, NodeHtml and onPointer; there is no generic "select, then a target" helper yet.',
      'A person keeps their agent kind: pickers only pick, and a warehouse person cannot staff a till, because cashiers are not agents.',
      'Tasks cannot be cancelled halfway; a command stops after the current pallet or carton.',
      'Text nodes have no opacity, so floating points disappear instead of fading.',
      'The shift clock lives in the rules beside the scene clock, and a shift cannot be saved or restored.',
    ] },
  ],
};

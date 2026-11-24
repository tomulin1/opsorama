import type { DocArticle } from './content';

/** How the Cut-off shift game is built from the dashboard's simulation, scene and panels. */
export const gameArticle: DocArticle = {
  slug: 'game', title: 'Building a game', category: 'RECIPES',
  description: 'Turn a simulated operation into a management game: a director inside the simulation, rules in plain TypeScript, commands from pointer events and selection, a HUD from the panel package and feedback from existing scene features, all deterministic and unit-tested.',
  sections: [
    { id: 'example', title: 'The example', paragraphs: [
      '/examples/cutoff is Cut-off, a shift game on the online shop and warehouse of the e-commerce recipe. The player is the shift lead for eight hours that pass in eight minutes: move staff between zones, put a carrier first, open and close checkouts, let trucks unload and answer events, to ship orders before each carrier\'s cut-off and keep the shop served. Three levels reuse the recipe\'s scenarios: a quiet day, the peak and the night shift.',
      'The game adds no model, effect or package. It runs the same simulation, scene, feed loop and HUD panels as the dashboard, which keeps working unchanged. The game\'s source lives in src/features/cutoff of the website. Its rules and scene glue import nothing from the website, so they can move into a package or a starter later; only the page uses the site\'s header and HUD helpers.',
    ], headers: ['Part', 'Owns', 'File'], rows: [
      ['Simulation', 'Units, agents, records and a director that takes the shift\'s decisions', 'features/ecommerce/simulation.ts'],
      ['Rules', 'Commands, events, score, clock and report; no renderer', 'features/cutoff/rules.ts'],
      ['Scene glue', 'Selectable people, target pins, markers, floating points, lighting by the clock', 'features/cutoff/scene.ts'],
      ['Page', 'Pointer commands, the HUD and the loop', 'features/cutoff/CutoffGame.tsx'],
    ] },
    { id: 'director', title: 'A director in the simulation', paragraphs: [
      'A dashboard simulation decides everything itself. A game needs those decisions to come from the player. The e-commerce simulation therefore asks a director: which zone each person works in, which orders go first, which checkout lanes are open, when a docked truck may unload, whether a machine runs and how many customers come in. The dashboard passes none and gets automaticDirector, which reproduces the previous scheduler exactly; the game passes a director that reads the player\'s commands. A director answers again every time it is asked, so it changes its mind by answering differently.',
      'A person changes zone only between tasks. The behavior runner can replace an agent\'s steps at any time: it releases the slot reservation, leaves its queue and keeps carried items on the agent. The simulation\'s tasks, however, change records as they run (claimed orders, booked places, units waiting for their hand-over), and nothing undoes them halfway. Waiting for the end of a task keeps every record consistent.',
    ], code: `const simulation = createEcommerceSimulation('peak', seed, {
  director: {
    zone: person => wanted.get(person.id) ?? person.zone,
    priority: order => order.carrier === first ? 1 : 0,
    checkoutOpen: lane => lanes.get(lane.id) ?? lane.open,
    unload: dock => allowed.has(dock.id),
  },
  walkOutAt: 3,                        // customers leave a queue this long
  onEvent: event => inbox.push(event), // shipped, served, short-pick, put-away…
});`, language: 'typescript' },
    { id: 'rules', title: 'Rules in plain TypeScript', paragraphs: [
      'createShiftGame({ scenario, seed }) wraps the simulation and holds the game: player commands, a shift clock, five events with choices, scoring and an end-of-shift report. It has no renderer and no framework, so the rules run in a unit test, a React page, a Vue page or a script alike. Commands validate their input and throw a readable error; every point change is also reported as a notice, which the page shows in a log and over the scene.',
    ], code: `const game = createShiftGame({ scenario: 'peak', seed: 1 });
game.subscribe(notice => { if (notice.type === 'scored') log(notice.text, notice.points); });
game.assign('packer:K3', 'restocking');   // after the current task
game.prioritize('swift');
game.setCheckout('C3', true);
game.unloadTruck('D2');
game.advance(30);                          // any slices; fixed steps inside
for (const event of game.events()) game.answer(event.id, event.fallback);
game.score();                              // { total, lines }`, language: 'typescript' },
    { id: 'commands', title: 'Commands from pointer events and selection', paragraphs: [
      'The page uses the scene\'s own selection for "select, then a target". The store sets selectionStyle: \'glow\', so the chosen person is tinted. While one is selected, the nodes the page publishes mark the zones the person can go to: their area pins switch to the busy state and read "Send here", and the other pins are dimmed. onPointer receives every click with the node under the pointer; when it is a target, the handler sends the command and calls preventSelection(), so the click does not select the pin. A second click on the person or Escape clears the selection. The same commands are buttons in the command panel, for the keyboard and for phones.',
    ], code: `<SceneCanvas assets={catalogAssets} onPointer={event => {
  if (event.type !== 'click' || !selected || !event.nodeId) return;
  const zone = zoneAt(event.nodeId);    // area, pin, bench, pick face or gondola
  if (!zone) return;
  event.preventSelection();
  game.assign(selected, zone);
  store.select(null);
}} />`, language: 'tsx' },
    { id: 'hud', title: 'A HUD from the panel package', paragraphs: [
      'The HUD is the same set of panels as the dashboards: DataPanel for the shift, commands, events and dialogs, MetricCard for score, cut-off countdown, customers and open events, ActivityFeed for the shift log and StatusBadge for point changes. The game only passes data and handlers in. Pause and speed are the scene settings paused and speed: the loop that advances the game reads them every frame, as the dashboard\'s feed loop does, so the scene and the rules stop and speed up together.',
    ] },
    { id: 'feedback', title: 'Feedback with existing scene features', paragraphs: [
      'The game uses no post-processing. Time of day is the lighting setting: studio by day, dusk from 16:00 and night for the night shift. Problems are marker nodes attached to the object they concern (a stopped robot, a late truck, a long queue, an empty department, a near cut-off), so they follow it as it moves. Point changes are billboard text nodes attached above the place they happened; they rise a little on every publish and are removed after two and a half seconds of play, which stands in for a fade.',
    ] },
    { id: 'testing', title: 'Determinism and testing', paragraphs: [
      'The simulation and the rules run in fixed steps of 0.1 seconds from a seed, and every event time is drawn from the seed when a shift starts. The same seed and the same commands at the same times therefore give the same shift, however advance is sliced. That makes the game testable without a browser.',
    ], list: [
      'Every command, its effect and its errors, in a unit test that plays part of a shift.',
      'Each choice of each event, by playing until the event opens and answering it.',
      'The score of a scripted shift per level, recorded and compared.',
      'Determinism: the same report, notices and snapshot for two runs, and for different slices of time.',
      'The dashboard unchanged: digests of its records and scene nodes, recorded before the director existed, still match.',
      'One end-to-end test that plays a short shift in the browser: assign a person, put a carrier first, open a checkout, answer an event and reach the report.',
    ] },
    { id: 'limits', title: 'Current limits', list: [
      'Command mode is built in the page from selection and onPointer; there is no generic "select, then a target" helper yet.',
      'A person keeps their agent kind: pickers only pick, and a warehouse person cannot staff a till, because cashiers are not agents. Opening a lane costs points instead.',
      'Tasks cannot be cancelled halfway; people move between tasks.',
      'Text nodes have no opacity, so floating points disappear instead of fading.',
      'The shift clock lives in the rules beside the scene clock, and a shift cannot be saved or restored.',
    ] },
  ],
};

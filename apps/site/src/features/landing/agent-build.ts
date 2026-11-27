import { createSceneStore, validateScene, type SceneNode, type SceneStore } from '@opsorama/core';
import { assetValidator } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { SCENARIOS } from '../office/model';
import { officeNodes } from '../office/scene';

/**
 * An illustration of a coding agent building a scene: the office example's own nodes are added to the store one at a time,
 * in the order an agent would work (structure, furniture, details, people, labels), while a log shows the prompt, the
 * catalog searches and every node added. At the end the finished scene is checked with the real `validateScene`, then
 * the build starts again. Visitors who prefer reduced motion get the finished scene and a short log at once.
 */
export interface AgentLogLine { id: number; kind: 'prompt' | 'command' | 'add' | 'result'; text: string }
export interface AgentLog { getSnapshot(): readonly AgentLogLine[]; subscribe(listener: () => void): () => void }

const PROMPT = 'Build an open-plan office: team desks, meeting rooms, focus pods, a kitchen and reception, with people at work.';
/** Lines the log keeps; older ones scroll away. */
const LOG_LINES = 8;
/** Zoom that shows the whole office while it is built; the office example itself starts closer, at 1.25. */
const BUILD_ZOOM = .85;
/** Pause after the finished scene before the agent starts again, in milliseconds. */
const HOLD = 7000;

/** The agent's phases: what it searches the catalog for, which nodes it then adds and how quickly. */
const PHASES: readonly { query: string; delay: number; assets: readonly string[] | null }[] = [
  { query: 'floor wall', delay: 55, assets: ['floor', 'wall-segment'] },
  { query: 'desk meeting table focus pod counter', delay: 150, assets: ['desk-pod', 'meeting-table', 'focus-pod', 'dining-table', 'bar-counter', 'espresso-machine', 'host-stand', 'bench', 'whiteboard'] },
  { query: 'plant board bin', delay: 90, assets: ['potted-plant', 'information-board', 'waste-bin'] },
  { query: 'worker robot', delay: 90, assets: ['worker', 'mobile-robot'] },
  { query: 'map pin', delay: 120, assets: null },
];
const assetOf = (node: SceneNode) => node.kind === 'asset' ? node.asset : node.kind;
/** The phase a node belongs to; nodes no phase names go to the last one. */
const phaseOf = (node: SceneNode) => { const index = PHASES.findIndex(phase => phase.assets?.includes(assetOf(node))); return index < 0 ? PHASES.length - 1 : index; };

type Step = { wait: number } & ({ type: 'log'; kind: AgentLogLine['kind']; text: string } | { type: 'add'; node: SceneNode } | { type: 'check' });

function createLog() {
  let lines: readonly AgentLogLine[] = [], next = 1;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    log: { getSnapshot: () => lines, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } } satisfies AgentLog,
    push(kind: AgentLogLine['kind'], text: string) { lines = [...lines, { id: next++, kind, text }].slice(-LOG_LINES); emit(); },
    clear() { lines = []; emit(); },
  };
}

export function createAgentBuild(): { store: SceneStore; zoom: number; log: AgentLog; run(): () => void; dispose(): void } {
  const nodes = officeNodes(SCENARIOS.planning), [ground, ...rest] = nodes;
  const store = createSceneStore({ schemaVersion: 1, nodes: [ground] }, { zoom: BUILD_ZOOM });
  const { log, push, clear } = createLog();
  const check = () => {
    const problems = validateScene({ schemaVersion: 1, nodes: store.getSnapshot().nodes }, { validateAsset: assetValidator(catalogAssets) });
    const errors = problems.filter(problem => problem.severity === 'error').length;
    push('result', errors ? `${errors} problem${errors === 1 ? '' : 's'} to fix` : `✓ ${store.getSnapshot().nodes.length} nodes, no problems`);
  };
  const steps: Step[] = [{ type: 'log', kind: 'prompt', text: PROMPT, wait: 1200 }];
  PHASES.forEach((phase, index) => {
    const added = rest.filter(node => phaseOf(node) === index);
    if (!added.length) return;
    steps.push({ type: 'log', kind: 'command', text: `npx opsorama catalog search ${phase.query}`, wait: 700 });
    added.forEach(node => steps.push({ type: 'add', node, wait: phase.delay }));
  });
  steps.push({ type: 'log', kind: 'command', text: 'npx opsorama check office.json', wait: 900 }, { type: 'check', wait: HOLD });

  const reset = () => { store.replace([ground]); clear(); push('add', `+ ground  ${ground.id}`); };
  return {
    store, zoom: BUILD_ZOOM, log,
    run() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        store.replace(nodes); clear(); push('prompt', PROMPT); push('result', `Added ${nodes.length} nodes from the catalog`); check();
        return () => {};
      }
      let index = 0, timer = 0;
      reset();
      const tick = () => {
        if (index >= steps.length) { index = 0; reset(); }
        const step = steps[index++];
        if (step.type === 'log') push(step.kind, step.text);
        else if (step.type === 'add') { store.upsert(step.node); push('add', `+ ${assetOf(step.node)}  ${step.node.id}`); }
        else check();
        timer = window.setTimeout(tick, step.wait);
      };
      timer = window.setTimeout(tick, 400);
      return () => window.clearTimeout(timer);
    },
    dispose: () => store.dispose(),
  };
}

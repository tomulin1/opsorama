import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SceneSettings, SceneStore } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, useSceneFrame } from '@opsorama/react';
import type { RendererPlugin, ScenePointerEvent } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CLICK_READOUT_CLASS, clickReadout, createRobotDispatch, destinationRingPlugin, FIXED_STEP, HOVER_READOUT_CLASS, hoverReadout, makeEngineHooksStore, sendRobot, STEP_READOUT_CLASS, stepReadout, type EngineHooksCallbacks, type EngineHooksSession, type RobotDispatch } from './engine-hooks-data';

/** A fixed-step listener under the provider; it writes the element directly, so 60 steps a second cause no re-render. */
function StepReadout() {
  const output = useRef<HTMLOutputElement>(null);
  useSceneFrame(frame => { if (output.current) output.current.textContent = stepReadout(frame); }, { step: FIXED_STEP });
  return <output ref={output} className={STEP_READOUT_CLASS}>{stepReadout(null)}</output>;
}

/** The scene with an inline `onPointer` handler: a new function each render, read through a ref without remounting. */
function EngineHooksScene({ store, dispatch, plugins, callbacks }: { store: SceneStore; dispatch: RobotDispatch; plugins: readonly RendererPlugin[]; callbacks: EngineHooksCallbacks }) {
  const [click, setClick] = useState(clickReadout(null)), [hovered, setHovered] = useState<string | null>(null);
  const onPointer = (event: ScenePointerEvent) => {
    if (event.type === 'click') setClick(clickReadout(event, sendRobot(store, dispatch, event)));
    else if (event.type === 'enter') setHovered(event.nodeId);
    else if (event.type === 'leave') setHovered(current => current === event.nodeId ? null : current);
  };
  return <SceneCanvas assets={catalogAssets} wheelZoom plugins={plugins} onPointer={onPointer} style={{ height: 420 }} onReady={callbacks.ready}>
    <StepReadout />
    <output className={CLICK_READOUT_CLASS}>{click}</output>
    <output className={HOVER_READOUT_CLASS}>{hoverReadout(hovered)}</output>
  </SceneCanvas>;
}

/** React: `useSceneFrame`, the `onPointer` prop and the mount-time `plugins` prop under one `DashboardProvider`. */
export function mountEngineHooksReact(container: HTMLElement, settings: Partial<SceneSettings>, callbacks: EngineHooksCallbacks): EngineHooksSession {
  // The plugin list is created once per mount and stays the same array: a new array would remount the renderer.
  const store = makeEngineHooksStore(settings), dispatch = createRobotDispatch(), plugins = [destinationRingPlugin(dispatch, callbacks.lifecycle)], root = createRoot(container);
  root.render(<DashboardProvider store={store}><EngineHooksScene store={store} dispatch={dispatch} plugins={plugins} callbacks={callbacks} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}

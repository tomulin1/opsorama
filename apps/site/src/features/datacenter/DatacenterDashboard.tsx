'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { datacenterRecords, datacenterRoomForNode, makeDatacenterStore, setDatacenterRoom, setDatacenterScenario, updateDatacenter, type DatacenterScenario } from '../../../examples/datacenter-data';
import { DatacenterViewport } from './DatacenterViewport';
import { catalogAssets } from '@opsorama/objects';

const DEFAULT_ZOOM = 1.05;

/** Host state for the datacenter domain example: one native React scene, fixture controls and selection. */
export function DatacenterDashboard() {
  const [store, setStore] = useState<SceneStore | null>(null);
  const [ports, setPorts] = useState(12), [modules, setModules] = useState(4), [motion, setMotion] = useState(true);
  const [selected, setSelected] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<DatacenterScenario>('incident');
  const [room, setRoom] = useState('overview'), [rackPage, setRackPage] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const session = useRef<SceneStore | null>(null), renderer = useRef<SceneRenderer | null>(null);
  const latest = useRef({ ports, modules, motion, scenario, room, zoom }); latest.current = { ports, modules, motion, scenario, room, zoom };
  const changeZoom = (value: number) => {
    const next = Math.max(.65, Math.min(5, Math.round(value * 100) / 100));
    latest.current.zoom = next; setZoom(next); session.current?.configure({ zoom: next });
  };
  const focusRoom = useCallback((next: string) => {
    latest.current.room = next; latest.current.zoom = DEFAULT_ZOOM; setZoom(DEFAULT_ZOOM); setRoom(next); setRackPage(0);
    if (session.current) { session.current.configure({ zoom: DEFAULT_ZOOM }); setDatacenterRoom(session.current, next); }
    if (next === 'overview') renderer.current?.overview(); else renderer.current?.frame(next, { fit: true });
  }, []);
  const onReady = useCallback((value: SceneRenderer) => {
    renderer.current = value;
    queueMicrotask(() => {
      const view = session.current; if (!view || renderer.current !== value) return;
      // Fit at the baseline before restoring the host's zoom after a remount.
      const zoom = latest.current.zoom; view.configure({ zoom: DEFAULT_ZOOM });
      if (latest.current.room !== 'overview') value.frame(latest.current.room, { fit: true });
      view.configure({ zoom });
    });
  }, []);
  const onError = useCallback((failure: Error) => setError(failure.message), []);
  // The store starts from the host's current controls, scenario and room.
  useEffect(() => {
    let previousId: string | null = null;
    const view = makeDatacenterStore(), config = latest.current;
    updateDatacenter(view, config.ports, config.modules, config.motion); setDatacenterScenario(view, config.scenario); setDatacenterRoom(view, config.room);
    session.current = view; setStore(view); setError(null); setSelected(null);
    const unsubscribe = view.subscribe(() => {
      // Wheel zoom writes the store directly.
      const wheelZoom = view.getSnapshot().settings.zoom;
      if (wheelZoom !== latest.current.zoom) { latest.current.zoom = wheelZoom; setZoom(wheelZoom); }
      const id = view.getSnapshot().selection?.nodeId ?? null;
      if (id !== previousId) { previousId = id; setSelected(id); }
    });
    // The canvas leaves the tree in the same commit, so its renderer is disposed before this store.
    return () => { unsubscribe(); session.current = null; renderer.current = null; setStore(null); view.dispose(); };
  }, []);
  useEffect(() => { if (session.current) updateDatacenter(session.current, ports, modules, motion); }, [ports, modules, motion]);
  useEffect(() => { if (session.current) setDatacenterScenario(session.current, scenario); }, [scenario]);
  const resetView = () => { focusRoom('overview'); session.current?.select(null); };
  // Picking in the scene only selects, as in the other examples; a list has no scene context, so it also goes to the room.
  const select = (id: string) => {
    const targetRoom = datacenterRoomForNode(id); if (targetRoom && targetRoom !== room) focusRoom(targetRoom);
    const target = datacenterRecords.find(record => record.id === id);
    if (target) setRackPage(Math.floor(datacenterRecords.filter(record => record.roomId === target.roomId).findIndex(record => record.id === id) / 8));
    session.current?.select(id, 'keyboard'); renderer.current?.frame(id);
  };
  const scene = store ? <DashboardProvider store={store}><SceneCanvas assets={catalogAssets} className="datacenter-canvas" wheelZoom onReady={onReady} onError={onError} /></DashboardProvider> : null;
  return <main className="hud-page datacenter-page"><SiteHeader /><DatacenterViewport
    scene={scene} ports={ports} modules={modules} motion={motion} zoom={zoom}
    scenario={scenario} room={room} rackPage={rackPage} selected={selected} error={error} rendererRef={renderer}
    onPortsChange={setPorts} onModulesChange={setModules} onMotionChange={setMotion}
    onZoomChange={changeZoom} onZoomReset={() => changeZoom(DEFAULT_ZOOM)}
    onScenarioChange={setScenario} onFocusRoom={focusRoom} onResetView={resetView} onRackPageChange={setRackPage} onSelect={select}
  /></main>;
}

'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { DataPanel, FieldList, MetricCard } from '@opsorama/react/ui';
import type { SceneRenderer } from '@opsorama/three';
import { PERFORMANCE_FIXTURE_VERSION, summarizeThroughput, type ThroughputSample } from './model';

type Diagnostics = ReturnType<SceneRenderer['getDiagnostics']>;
/** A run warms for 3 seconds, then records at least 15 real seconds. Timer delays extend the sample. */
const WARMUP_MS = 3000, RECORD_MS = 15000;
interface Configuration { preset: string; instances: number; instancing: boolean; motion: boolean; shadows: boolean; labels: boolean; zoom: number; }
interface Run { started: number; recording: boolean; samples: ThroughputSample[]; }

/** Polls counters once per second. No extra animation loop or per-frame React updates. */
export function PerformanceReadout({ rendererRef, surfaceRef, mounted, configuration, invalidation }: {
  rendererRef: RefObject<SceneRenderer | null>; surfaceRef: RefObject<HTMLDivElement | null>;
  mounted: boolean; configuration: Configuration; invalidation: number;
}) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null), [fps, setFps] = useState<number | null>(null);
  const [status, setStatus] = useState('Ready to record'), [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ filename: string; json: string; average: number; configuration: Configuration } | null>(null);
  const run = useRef<Run | null>(null), latest = useRef(configuration); latest.current = configuration;
  const signature = JSON.stringify(configuration);

  useEffect(() => {
    let previous: { renderer: SceneRenderer; frames: number; time: number } | null = null;
    const cancel = (message: string) => { if (run.current) { run.current = null; setRecording(false); setStatus(message); } };
    cancel('Run cancelled: configuration or camera changed'); setDiagnostics(null); setFps(null);
    const sample = () => {
      const renderer = rendererRef.current;
      if (document.hidden || !mounted || !renderer || renderer.getDiagnostics().disposed) { previous = null; setFps(null); setDiagnostics(null); cancel('Run cancelled: scene unavailable or tab hidden'); return; }
      const current = renderer.getDiagnostics(), now = performance.now(); setDiagnostics(current);
      const interval = previous?.renderer === renderer ? { frames: current.renderedFrames - previous.frames, elapsedMs: now - previous.time } : null;
      if (previous && previous.renderer !== renderer) cancel('Run cancelled: renderer changed');
      previous = { renderer, frames: current.renderedFrames, time: now };
      setFps(interval && interval.elapsedMs > 0 ? interval.frames * 1000 / interval.elapsedMs : null);
      const active = run.current; if (!active) return;
      if (!active.recording) {
        if (now - active.started < WARMUP_MS) { setStatus(`Warming up · ${Math.ceil((WARMUP_MS - now + active.started) / 1000)} s`); return; }
        active.recording = true; setStatus('Recording · 15 s'); return;
      }
      if (interval && interval.elapsedMs > 0) active.samples.push(interval);
      const summary = summarizeThroughput(active.samples);
      if (!summary || summary.elapsedMs < RECORD_MS) { setStatus(`Recording · ${Math.ceil((RECORD_MS - (summary?.elapsedMs ?? 0)) / 1000)} s`); return; }
      const canvas = surfaceRef.current?.querySelector('canvas'), bounds = canvas?.getBoundingClientRect();
      const report = {
        fixture: PERFORMANCE_FIXTURE_VERSION, recordedAt: new Date().toISOString(), configuration: latest.current,
        throughput: summary, diagnostics: current,
        environment: { userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, viewport: bounds ? { width: bounds.width, height: bounds.height } : null, drawingBuffer: canvas ? { width: canvas.width, height: canvas.height } : null, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches },
        notes: ['Completed render calls per elapsed second; interval minima/maxima are not frame-time percentiles.', 'Draw calls describe the latest main pass and exclude the preceding shadow pass.', 'Geometry/texture diagnostics are counts, not GPU memory bytes.', 'Record build mode, hardware and power mode separately. Camera navigation cancels recording; keep viewport and zoom equal when comparing runs.'],
      };
      setResult({ filename: `performance-${latest.current.preset}-${Date.now()}.json`, json: JSON.stringify(report, null, 2), average: summary.averageFps, configuration: { ...latest.current } });
      run.current = null; setRecording(false); setStatus('Recording complete');
    };
    const visibility = () => { previous = null; setFps(null); cancel('Run cancelled: tab visibility changed'); };
    const resize = () => cancel('Run cancelled: viewport changed');
    const observer = new ResizeObserver(resize); if (surfaceRef.current) observer.observe(surfaceRef.current);
    document.addEventListener('visibilitychange', visibility);
    sample(); const timer = window.setInterval(sample, 1000);
    return () => { window.clearInterval(timer); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [rendererRef, surfaceRef, mounted, signature, invalidation]);

  return <DataPanel className="perf-diagnostics" title="Live diagnostics" density="compact">
    <div className="perf-metrics"><MetricCard size="m" title="Rendered FPS" value={fps === null ? null : Math.round(fps)} comparison="Completed frames / elapsed time" /><MetricCard size="m" title="Main-pass draws" value={diagnostics?.drawCalls ?? null} comparison="Latest frame · shadows excluded" /></div>
    <FieldList fields={[{ id: 'objects', label: 'Mounted scene nodes', value: diagnostics?.objects ?? null }, { id: 'geometries', label: 'Geometry resources', value: diagnostics?.geometries ?? null }, { id: 'textures', label: 'Texture resources', value: diagnostics?.textures ?? null }]} />
    <div className="perf-actions"><button type="button" disabled={!mounted || !diagnostics || recording} onClick={() => { run.current = { started: performance.now(), recording: false, samples: [] }; setRecording(true); setStatus('Warming up · 3 s'); }}>Record 15 seconds</button>{recording && <button type="button" onClick={() => { run.current = null; setRecording(false); setStatus('Recording stopped'); }}>Stop recording</button>}</div>
    <p role="status">{status}</p>
    {result && <p>Last result ({result.configuration.preset}, instancing {result.configuration.instancing ? 'on' : 'off'}, motion {result.configuration.motion ? 'on' : 'off'}, shadows {result.configuration.shadows ? 'on' : 'off'}, labels {result.configuration.labels ? 'on' : 'off'}): <strong>{result.average.toFixed(1)} FPS</strong> · <a download={result.filename} href={`data:application/json;charset=utf-8,${encodeURIComponent(result.json)}`}>Download JSON</a></p>}
    <p className="perf-note">Keep the camera still while recording. Changing controls, viewport or tab visibility cancels the run. Resource counts are not memory sizes.</p>
  </DataPanel>;
}

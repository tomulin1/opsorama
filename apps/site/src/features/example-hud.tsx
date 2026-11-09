'use client';
import { useCallback, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { NodePreview, useRendererFps, useScene, useSceneZoom } from '@opsorama/react';
import { MetricCard, ZoomControl, type MetricCardProps, type MetricSize } from '@opsorama/react/ui';
import { previewNodes, type SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

/** A short panel of a domain HUD. The host owns tone, visual and action; size comes from the shared size control. */
export type HudMetric = Omit<MetricCardProps<ReactNode>, 'size' | 'slots'> & { id: string; icon: ReactNode };

const METRIC_SIZES: readonly { size: MetricSize; label: string }[] = [{ size: 's', label: 'Small' }, { size: 'm', label: 'Medium' }];
const PHONE_QUERY = '(max-width: 760px)';

/** False during server rendering, so the first client render matches the server markup. */
function useMediaQuery(query: string) {
  const subscribe = useCallback((change: () => void) => {
    const media = matchMedia(query);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, [query]);
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

/** The metric size of a domain HUD. Hosts choose the size: phones always use the smallest. */
export function useHudMetricSize() {
  const [chosen, setChosen] = useState<MetricSize>('m');
  return { metricSize: useMediaQuery(PHONE_QUERY) ? 's' as const : chosen, setMetricSize: setChosen };
}

export function HudMetrics({ label, size, metrics }: { label: string; size: MetricSize; metrics: readonly HudMetric[] }) {
  return <section className="hud-summary" aria-label={label}>{metrics.map(({ id, icon, ...metric }) => <MetricCard key={id} size={size} {...metric} slots={{ icon }} />)}</section>;
}

export function MetricSizeControl({ size, onChange }: { size: MetricSize; onChange(size: MetricSize): void }) {
  return <div className="hud-toolbar-group hud-metric-sizes" role="group" aria-label="Metric panel size"><span>Metrics</span>{METRIC_SIZES.map(item => <button type="button" key={item.size} aria-label={`${item.label} metric panels`} aria-pressed={size === item.size} onClick={() => onChange(item.size)}>{item.size.toUpperCase()}</button>)}</div>;
}

/** Owns the FPS sample so its once-per-second update re-renders only the zoom bar. Reads the scene store through the React adapter. */
export function HudZoom({ rendererRef, defaultZoom }: { rendererRef: RefObject<SceneRenderer | null>; defaultZoom: number }) {
  const zoom = useSceneZoom(), fps = useRendererFps(rendererRef, true);
  return <ZoomControl {...zoom} className="hud-zoom" step={.2} reset onReset={() => zoom.onChange(defaultZoom)} caption="Zoom" fps={fps} labels={{ group: 'Camera zoom' }} />;
}

/**
 * A live 3D copy of the inspected scene node at the top of an inspector. It mirrors the node's state, counts and animation
 * from the provider's scene and renders nothing for a selection without geometry, such as an HTML marker.
 */
export function HudNodePreview({ nodeId }: { nodeId: string | null }) {
  const nodes = useScene().nodes;
  if (nodeId === null || previewNodes(nodes, nodeId, 1).length === 0) return null;
  return <figure className="hud-node-preview"><NodePreview nodeId={nodeId} assets={catalogAssets} className="hud-node-preview-canvas" /><figcaption>Live 3D copy · drag to turn</figcaption></figure>;
}

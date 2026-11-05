import { createRoot } from 'react-dom/client';
import { ZoomControl } from '@opsorama/react/ui';
import { zoomOptions, type ZoomSample } from './zoom-control-fixture';
export function mountZoomControlReact(container: HTMLElement, initial: ZoomSample) {
  const root = createRoot(container);
  const update = (sample: ZoomSample) => root.render(<ZoomControl {...zoomOptions(sample, <span className="zoom-host-content">Host content</span>)} />);
  update(initial);
  return { update, dispose() { queueMicrotask(() => root.unmount()); } };
}

import { zoomControl } from '@opsorama/ui';
import { mountPanel, type DOMContent } from '@opsorama/ui/dom';
import { zoomOptions, type ZoomSample } from './zoom-control-fixture';
export function mountZoomControlJavaScript(container: HTMLElement, initial: ZoomSample) {
  // Host-owned slot content; the mount moves this Node and never clones it.
  const extra = container.ownerDocument.createElement('span'); extra.className = 'zoom-host-content'; extra.textContent = 'Host content';
  const view = mountPanel(container, zoomControl<DOMContent>(zoomOptions<DOMContent>(initial, extra)));
  return { update(sample: ZoomSample) { view.update(zoomControl<DOMContent>(zoomOptions<DOMContent>(sample, extra))); }, dispose() { view.dispose(); } };
}

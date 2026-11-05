import { dataPanel, metricCard, entityInspector, processTracker, resourceList, capacityCard, activityFeed, statusBadge, valueMeter, zoomControl, type PanelNode } from '@opsorama/ui';
import { mountPanel, type DOMContent } from '@opsorama/ui/dom';
import { panelSample, type PanelSample } from './panels-fixture';
export function mountPanelsJavaScript(container: HTMLElement, initial: PanelSample, onSelect: (id: string) => void, onZoom?: (value: number) => void) {
  const grid = container.ownerDocument.createElement('div'); grid.className = 'panel-samples-grid'; container.append(grid);
  const custom = container.ownerDocument.createElement('button'); custom.type = 'button'; custom.textContent = 'Custom action';
  const select = () => onSelect('custom'); custom.addEventListener('click', select);
  const badge = container.ownerDocument.createElement('span');
  const badgeView = mountPanel(badge, statusBadge({ label: 'Custom badge', tone: 'info' }));
  function trees(value: PanelSample): PanelNode<DOMContent>[] {
    const p = panelSample(value, onSelect, onZoom);
    return [dataPanel<DOMContent>({ ...p.panel, slots: { actions: badge, footer: custom } }), metricCard(p.metric), ...p.sizedMetrics.map(options => metricCard<DOMContent>(options)), entityInspector(p.inspector), processTracker(p.process), resourceList(p.resources), capacityCard(p.capacity), activityFeed(p.activity), dataPanel<DOMContent>({ title: 'ValueMeter' }, [valueMeter({ label: 'Custom range', value: value.value, min: 10, max: 80 })])];
  }
  const views = trees(initial).map(tree => mountPanel(grid, tree));
  const zooms = container.ownerDocument.createElement('div'); zooms.className = 'zoom-samples'; grid.append(zooms);
  const zoomViews = panelSample(initial, onSelect, onZoom).zoom.map(options => mountPanel(zooms, zoomControl<DOMContent>(options)));
  return { update(value: PanelSample) { trees(value).forEach((tree, index) => views[index].update(tree)); panelSample(value, onSelect, onZoom).zoom.forEach((options, index) => zoomViews[index].update(zoomControl<DOMContent>(options))); }, dispose() { views.forEach(view => view.dispose()); zoomViews.forEach(view => view.dispose()); badgeView.dispose(); custom.removeEventListener('click', select); grid.remove(); } };
}

import { defineComponent, h, mergeProps, type PropType, type VNodeChild, type SlotsType } from 'vue';
import { dataPanel, metricCard, statusBadge, fieldList, entityInspector, processTracker, resourceList, valueMeter, capacityCard, activityFeed, zoomControl, type PanelNode, type DataPanelProps, type MetricCardProps, type StatusBadgeProps, type FieldListProps, type EntityInspectorProps, type ProcessTrackerProps, type ResourceListProps, type ValueMeterProps, type CapacityCardProps, type ActivityFeedProps, type ZoomControlProps, type PanelSlots } from '@opsorama/ui';
export type * from '@opsorama/ui';

function render(node: PanelNode<VNodeChild>, attrs: Record<string, unknown> = {}): VNodeChild {
  if (node.kind === 'content') return node.value;
  return h(node.tag, mergeProps({ ...node.attrs, key: node.key, style: node.style, onClick: node.onClick, onInput: node.onInput && ((event: Event) => node.onInput!((event.target as HTMLInputElement).value)) }, attrs), node.children.map(child => render(child)));
}
type NativeSlots = { default?: () => VNodeChild } & { [Key in keyof PanelSlots<VNodeChild>]?: () => VNodeChild };
/** Typed options prop shares the exact JS/React contract; native slots override content. */
function component<P>(name: string, build: (props: P) => PanelNode<VNodeChild>) {
  return defineComponent({
    name, inheritAttrs: false, props: { options: { type: Object as PropType<P>, required: true } }, slots: Object as SlotsType<NativeSlots>,
    setup(props, { attrs, slots }) {
      return () => {
        const options = props.options as P & DataPanelProps<VNodeChild>;
        const overrides: PanelSlots<VNodeChild> = { ...options.slots };
        for (const key of ['header', 'icon', 'actions', 'footer', 'loading', 'empty', 'error'] as const) if (slots[key]) overrides[key] = slots[key]!();
        const tree = build({ ...options, slots: overrides, ...(overrides.icon !== undefined ? { icon: overrides.icon } : {}), children: slots.default ? slots.default() : options.children });
        // Class/style/accessible attributes are optional host extension points on the root.
        return render(tree, attrs);
      };
    },
  });
}
export const DataPanel = component<DataPanelProps<VNodeChild>>('DataPanel', dataPanel);
export const MetricCard = component<MetricCardProps<VNodeChild>>('MetricCard', metricCard);
export const StatusBadge = component<StatusBadgeProps<VNodeChild>>('StatusBadge', statusBadge);
export const FieldList = component<FieldListProps<VNodeChild>>('FieldList', fieldList);
export const EntityInspector = component<EntityInspectorProps<VNodeChild>>('EntityInspector', entityInspector);
export const ProcessTracker = component<ProcessTrackerProps<VNodeChild>>('ProcessTracker', processTracker);
export const ResourceList = component<ResourceListProps<VNodeChild>>('ResourceList', resourceList);
export const ValueMeter = component<ValueMeterProps>('ValueMeter', valueMeter);
export const CapacityCard = component<CapacityCardProps<VNodeChild>>('CapacityCard', capacityCard);
export const ActivityFeed = component<ActivityFeedProps<VNodeChild>>('ActivityFeed', activityFeed);
export const ZoomControl = component<ZoomControlProps<VNodeChild>>('ZoomControl', zoomControl);

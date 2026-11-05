'use client';
import { createElement, type ReactNode } from 'react';
import { dataPanel, metricCard, statusBadge, fieldList, entityInspector, processTracker, resourceList, valueMeter, capacityCard, activityFeed, zoomControl, type PanelNode, type DataPanelProps, type MetricCardProps, type StatusBadgeProps, type FieldListProps, type EntityInspectorProps, type ProcessTrackerProps, type ResourceListProps, type ValueMeterProps, type CapacityCardProps, type ActivityFeedProps, type ZoomControlProps } from '@opsorama/ui';
export type * from '@opsorama/ui';

function render(node: PanelNode<ReactNode>): ReactNode {
  if (node.kind === 'content') return node.value;
  const { class: className, datetime: dateTime, ...attrs } = node.attrs;
  return createElement(node.tag, { ...attrs, className, dateTime, key: node.key, style: node.style, onClick: node.onClick, onChange: node.onInput && ((event: { currentTarget: { value: string } }) => node.onInput!(event.currentTarget.value)) }, ...node.children.map((child, index) => child.kind === 'element' ? render({ ...child, key: child.key ?? String(index) }) : render(child)));
}
export function DataPanel(props: DataPanelProps<ReactNode>) { return render(dataPanel(props)); }
export function MetricCard(props: MetricCardProps<ReactNode>) { return render(metricCard(props)); }
export function StatusBadge(props: StatusBadgeProps<ReactNode>) { return render(statusBadge(props)); }
export function FieldList(props: FieldListProps<ReactNode>) { return render(fieldList(props)); }
export function EntityInspector(props: EntityInspectorProps<ReactNode>) { return render(entityInspector(props)); }
export function ProcessTracker(props: ProcessTrackerProps<ReactNode>) { return render(processTracker(props)); }
export function ResourceList(props: ResourceListProps<ReactNode>) { return render(resourceList(props)); }
export function ValueMeter(props: ValueMeterProps) { return render(valueMeter<ReactNode>(props)); }
export function CapacityCard(props: CapacityCardProps<ReactNode>) { return render(capacityCard(props)); }
export function ActivityFeed(props: ActivityFeedProps<ReactNode>) { return render(activityFeed(props)); }
export function ZoomControl(props: ZoomControlProps<ReactNode>) { return render(zoomControl(props)); }

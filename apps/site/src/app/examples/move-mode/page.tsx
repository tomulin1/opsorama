import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { MoveModeExample } from '@/features/docs/MoveModeExample';
import '../datacenter/datacenter.css';
import './move-mode.css';

export const metadata = { title: 'Move mode · Opsorama' };
export default function MoveModePage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">OPTIONAL INTERACTION</span><h1>Move mode</h1><p>Select a unit to see where it fits, then choose a place in the scene or in the list below. Compatibility comes from the object declarations; the host decides whether each request goes ahead. This is an optional way to add interactivity, not a part of the domain dashboards.</p><MoveModeExample /></div></main>;
}

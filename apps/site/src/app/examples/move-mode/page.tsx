import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { MoveModeExample } from '@/features/docs/MoveModeExample';
import '../datacenter/datacenter.css';
import './move-mode.css';
import { exampleMetadata } from '@/features/examples/catalog';

export const metadata = exampleMetadata('/examples/move-mode');
export default function MoveModePage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">OPTIONAL INTERACTION</span><h1>Move mode</h1><p>Units that can move are tinted. Select one, and a ghost of it stands at each place it fits; choose a ghost in the scene or a place in the list below. Compatibility comes from the object declarations; the host decides whether each request goes ahead. This is an optional way to add interactivity, not a part of the domain dashboards.</p><MoveModeExample /></div></main>;
}

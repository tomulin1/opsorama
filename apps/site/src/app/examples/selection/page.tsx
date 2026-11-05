import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { SelectionStylesExample } from '@/features/docs/SelectionStylesExample';
import '../datacenter/datacenter.css';

export const metadata = { title: 'Selection styles · Opsorama' };
export default function SelectionStylesPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SCENE SETTING</span><h1>Selection styles</h1><p>Mark the selected and hovered object with floor brackets, which objects in front hide, or a colored glow. The sample covers objects from a parcel to a silo, a moving robot, instanced parcels, and warning and critical states.</p><SelectionStylesExample /></div></main>;
}

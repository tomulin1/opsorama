import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { LogisticsExample } from '@/features/docs/LogisticsExample';
import '../datacenter/datacenter.css';

export const metadata = { title: 'Logistics objects · Opsorama' };
export default function LogisticsPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SHARED OBJECT DEFINITIONS</span><h1>Logistics objects</h1><p>A forklift, loading dock and shipping container preserved from the retired warehouse prototype. All three are static, palette-aware models; cargo, routes and operations belong to the host. The pallet reuses the existing catalog definition.</p><LogisticsExample /></div></main>;
}

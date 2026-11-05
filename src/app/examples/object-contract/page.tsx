import Link from 'next/link';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ObjectContractExample } from '@/features/docs/ObjectContractExample';
export const metadata = { title: 'Object contract · Opsorama' };
export default function ObjectContractPage() {
  return <main className="adapter-page"><SiteHeader /><div><Link href="/docs/objects/parcel">Parcel contract in the catalog →</Link><h1>Object contract</h1><p>The parcel is the first definition with the complete common object contract. One definition runs through native React, Vue and plain JavaScript. Switch between two scene palettes while an instance override and the legacy color stay in place. Status tints survive styling and selection survives rebuilds. Moves interpolate only while motion is on. The readout comes from the renderer itself, including geometry counts before and after a cycle of updates.</p><ObjectContractExample /></div></main>;
}

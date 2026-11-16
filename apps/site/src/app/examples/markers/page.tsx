import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { MarkerExample } from '@/features/docs/MarkerExample';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/markers');
export default function MarkersPage() { return <main className="adapter-page"><SiteHeader /><div><h1>Scene markers</h1><MarkerExample /></div></main>; }

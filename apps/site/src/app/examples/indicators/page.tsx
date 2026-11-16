import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { IndicatorExample } from '@/features/docs/IndicatorExample';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/indicators');
export default function IndicatorsPage() { return <main className="adapter-page"><SiteHeader /><div><h1>Measured indicators</h1><IndicatorExample /></div></main>; }

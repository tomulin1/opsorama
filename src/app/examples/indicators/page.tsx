import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { IndicatorExample } from '@/features/docs/IndicatorExample';
export const metadata = { title: 'Measured indicators · Opsorama' };
export default function IndicatorsPage() { return <main className="adapter-page"><SiteHeader /><div><h1>Measured indicators</h1><IndicatorExample /></div></main>; }

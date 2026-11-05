import Link from 'next/link';
import { DisplayExample } from '@/features/docs/DisplayExample';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
export default function Page() {
  return <main className="adapter-page"><SiteHeader /><div><Link href="/docs/displays">Display API guide →</Link><h1>Displays, clocks and timers</h1><p>Shared models with native React, Vue and JavaScript updates and cleanup.</p><DisplayExample /></div></main>;
}

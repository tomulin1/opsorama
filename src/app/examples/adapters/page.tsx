import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { AdapterExamples } from '@/features/docs/AdapterExamples';
import Link from 'next/link';
export const metadata = { title: 'Framework examples · Opsorama' };
export default function AdapterPage() { return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">FRAMEWORK PARITY</span><h1>One scene. Your framework.</h1><p>Switch between actual React, Vue, and plain JavaScript implementations. Each mounts its own shared Three.js renderer and uses the same scene definition.</p><AdapterExamples /><Link href="/docs/api/react">Read the adapter API →</Link></div></main>; }

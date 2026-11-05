import Link from 'next/link';
import { PanelExamples } from '@/features/docs/PanelExamples';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
export default function Page() {
  return <main className="adapter-page"><SiteHeader /><div><Link href="/docs/data-panels">Data panel API guide →</Link><h1>Generic data panels</h1><p>Basic presentation primitives. Your application supplies the content, data, statuses, actions and layout.</p><PanelExamples /></div></main>;
}

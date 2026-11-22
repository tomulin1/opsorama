import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { PrimitivesExample } from '@/features/docs/PrimitivesExample';
import { exampleMetadata } from '@/features/examples/catalog';
import './primitives.css';

export const metadata = exampleMetadata('/examples/primitives');
export default function PrimitivesPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">ENGINE</span><h1>Primitives and groups</h1><p>Build a scene from your own data without catalog models: box, sphere and cylinder shapes, lines and tubes, and groups that move, turn and select their contents together. The bar chart regroups its bars per series, the shuttle is a group of shapes on a route, and every adapter uses the same nodes: <code>Group</code>, <code>Shape</code> and <code>Line</code> in React and Vue, plain node objects in JavaScript.</p><PrimitivesExample /></div></main>;
}

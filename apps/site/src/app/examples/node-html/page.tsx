import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { NodeHtmlExample } from '@/features/docs/NodeHtmlExample';
import { exampleMetadata } from '@/features/examples/catalog';
import './node-html.css';

export const metadata = exampleMetadata('/examples/node-html');
export default function NodeHtmlPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">ENGINE</span><h1>HTML over nodes</h1><p>Show your own HTML over a scene node, such as a context menu, a tooltip or quick actions: the renderer keeps it over the node every frame, while the node moves and the camera pans or zooms. Click a forklift, a rack or a pallet to open its menu; every adapter uses the same renderer feature: <code>NodeHtml</code> in React and Vue, or <code>renderer.attachHtml</code>.</p><NodeHtmlExample /></div></main>;
}

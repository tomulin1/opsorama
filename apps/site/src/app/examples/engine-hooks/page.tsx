import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { EngineHooksExample } from '@/features/docs/EngineHooksExample';
import { exampleMetadata } from '@/features/examples/catalog';
import './engine-hooks.css';

export const metadata = exampleMetadata('/examples/engine-hooks');
export default function EngineHooksPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">ENGINE</span><h1>Engine hooks</h1><p>Extend the renderer from your own code: pointer events with the node and world point under the pointer, a frame hook with a fixed simulation step, and renderer plugins that add their own Three.js objects and clean them up. Click the floor to send the robot; every adapter uses the same hooks: <code>onPointer</code>, <code>plugins</code> and <code>useSceneFrame</code> or <code>renderer.onFrame</code>.</p><EngineHooksExample /></div></main>;
}

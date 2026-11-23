import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { LightingExample } from '@/features/docs/LightingExample';
import { exampleMetadata } from '@/features/examples/catalog';
import './lighting.css';

export const metadata = exampleMetadata('/examples/lighting');
export default function LightingPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">CONTENT</span><h1>Lighting, sky, fog and quality</h1><p>Choose how a scene is lit with scene settings: five lighting presets (studio, daylight, overcast, dusk and night), each with a light and a midnight variant, a sky gradient, distance fog, and a quality profile for large scenes and weak devices. The settings change lights, background and resolution, never the models, and every adapter sets them on the same store.</p><LightingExample /></div></main>;
}

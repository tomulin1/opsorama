import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { ModelsExample } from '@/features/docs/ModelsExample';
import { exampleMetadata } from '@/features/examples/catalog';
import './models.css';

export const metadata = exampleMetadata('/examples/models');
export default function ModelsPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">CONTENT</span><h1>glTF models</h1><p>Bring your own 3D models as glTF or GLB files and place them next to catalog models. <code>gltfAsset</code> from <code>@opsorama/three/gltf</code> turns a file into an asset factory: the file loads once, every node shares its geometry, materials and textures, repeated parts render as instanced batches, and an animation clip plays while scene motion is on. Every adapter uses the same registry: <code>Asset</code> in React and Vue, plain node objects in JavaScript.</p><ModelsExample /></div></main>;
}

import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { CameraExample } from '@/features/docs/CameraExample';
import { exampleMetadata } from '@/features/examples/catalog';
import './cameras.css';

export const metadata = exampleMetadata('/examples/cameras');
export default function CamerasPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">CAMERA</span><h1>Cameras</h1><p>Switch between the orthographic overview and a perspective camera, turn the view with yaw and pitch, and fly to objects and back to the overview with timed transitions. Every adapter reads the same camera view: React and Vue with <code>useCameraView</code>, plain JavaScript with <code>onCameraChange</code>.</p><CameraExample /></div></main>;
}

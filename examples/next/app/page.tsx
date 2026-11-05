import { Dashboard } from './Dashboard';

// A server component page; the 3D scene lives in a client component.
export default function Page() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Opsorama starter · Next.js</h1>
      <Dashboard />
    </main>
  );
}

import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { SurfacesExample } from '@/features/docs/SurfacesExample';
import '../datacenter/datacenter.css';

export const metadata = { title: 'Street & site surfaces · Opsorama' };
export default function SurfacesPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SHARED OBJECT DEFINITIONS</span><h1>Street & site surfaces</h1><p>Road tiles, sized sidewalks with curbs, floors and outdoor terrain composed on one Ground. Surfaces share an elevation convention, so they overlap without flicker and objects on a sidewalk stand at its 0.12 m level. All surfaces are static and carry no traffic, routing or occupancy meaning.</p><SurfacesExample /></div></main>;
}

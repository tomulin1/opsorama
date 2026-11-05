import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { BuildingExample } from '@/features/docs/BuildingExample';
import './buildings.css';
export const metadata = { title: 'Building containers · Opsorama' };
export default function BuildingsPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SHARED BUILDING OBJECT</span><h1>Buildings you can look inside.</h1><BuildingExample /></div></main>;
}

import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { SiteEnergyExample } from '@/features/docs/SiteEnergyExample';
import '../datacenter/datacenter.css';

export const metadata = { title: 'Site, energy and automation objects · Opsorama' };
export default function SiteEnergyPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SHARED OBJECT DEFINITIONS</span><h1>Site, energy and automation objects</h1><p>A robot cell, an energy yard and site equipment built from twelve shared models: mobile robot, robot arm, machine tool, security camera, EV chargers, solar array, wind turbine, storage tank, pump unit, fence, waste bins and traffic cones. States are local fixture toggles; production, energy and security data belong to the host.</p><SiteEnergyExample /></div></main>;
}

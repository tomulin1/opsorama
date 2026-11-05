import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { DomainKitsExample } from '@/features/docs/DomainKitsExample';
import '../datacenter/datacenter.css';

export const metadata = { title: 'Domain kit objects · Opsorama' };
export default function DomainKitsPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SHARED OBJECT DEFINITIONS</span><h1>Domain kit objects</h1><p>An airport stand, a port and construction area, a farm, a care and kitchen area and an events area built from twelve shared models: aircraft, baggage carts, tower and gantry cranes, valve, grain silo, tractor, hospital beds, service cart, kitchen stations, event stage and exhibition booths, staffed by illustrative people from the person catalog (construction workers, a doctor, a nurse, chefs, a security guard and visitors). Flight, patient, crop, production, event and staff data belong to the host.</p><DomainKitsExample /></div></main>;
}

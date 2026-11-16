import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { WarehouseObjectsExample } from '@/features/docs/WarehouseObjectsExample';
import '../datacenter/datacenter.css';
import { exampleMetadata } from '@/features/examples/catalog';

export const metadata = exampleMetadata('/examples/warehouse-objects');
export default function WarehouseObjectsPage() {
  return <main className="adapter-page"><SiteHeader /><div><span className="docs-eyebrow">SHARED OBJECT DEFINITIONS</span><h1>Warehouse objects</h1><p>A storage and picking area built from shared models: pallet-rack bays, a reach truck, carton flow racks, a stretch wrapper, a pallet stack, safety barriers, IBC tanks, drums and bulk bags, next to the existing forklift. Counts are decorative capacity; stock, orders and equipment data belong to the host.</p><WarehouseObjectsExample /></div></main>;
}

import { WarehouseDashboard } from '@/features/warehouse/WarehouseDashboard';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/warehouse');
export default function WarehousePage() { return <WarehouseDashboard />; }

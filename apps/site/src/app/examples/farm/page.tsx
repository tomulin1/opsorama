import { FarmDashboard } from '@/features/farm/FarmDashboard';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/farm');
export default function FarmPage() { return <FarmDashboard />; }

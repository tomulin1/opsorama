import { AquaticsDashboard } from '@/features/aquatics/AquaticsDashboard';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/aquatics');
export default function AquaticsPage() { return <AquaticsDashboard />; }

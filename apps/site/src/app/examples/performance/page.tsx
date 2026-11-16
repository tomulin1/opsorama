import { PerformanceDashboard } from '@/features/performance/PerformanceDashboard';
import { exampleMetadata } from '@/features/examples/catalog';

export const metadata = exampleMetadata('/examples/performance');
export default function PerformancePage() { return <PerformanceDashboard />; }

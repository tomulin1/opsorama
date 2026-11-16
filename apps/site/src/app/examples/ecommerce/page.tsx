import { EcommerceDashboard } from '@/features/ecommerce/EcommerceDashboard';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/ecommerce');
export default function EcommercePage() { return <EcommerceDashboard />; }

import { OfficeDashboard } from '@/features/office/OfficeDashboard';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/office');
export default function OfficePage() { return <OfficeDashboard />; }

import { DatacenterDashboard } from '@/features/datacenter/DatacenterDashboard';
import './datacenter.css';
import { exampleMetadata } from '@/features/examples/catalog';

export const metadata = exampleMetadata('/examples/datacenter');
export default function DatacenterPage() { return <DatacenterDashboard />; }

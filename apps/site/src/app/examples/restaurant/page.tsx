import { RestaurantDashboard } from '@/features/restaurant/RestaurantDashboard';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/restaurant');
export default function RestaurantPage() { return <RestaurantDashboard />; }

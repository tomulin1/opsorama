import { CutoffGame } from '@/features/cutoff/CutoffGame';
import { exampleMetadata } from '@/features/examples/catalog';
export const metadata = exampleMetadata('/examples/cutoff');
export default function CutoffPage() { return <CutoffGame />; }

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Example } from '@/features/examples/catalog';

/** One gallery card: the example's preview, title, description and action, linking to the example page. */
export function ExampleCard({ example }: { example: Example }) {
  return <Link className="examples-card" href={example.href} prefetch={false} aria-label={example.action}>
    <div className="examples-card-preview">
      <Image src={`/example-previews/${example.preview}.webp`} alt="" width={768} height={480} unoptimized />
    </div>
    <div className="examples-card-body">
      <h3>{example.title}</h3>
      <p>{example.description}</p>
      <span className="examples-card-action">{example.action}<ArrowUpRight size={15} aria-hidden="true" /></span>
    </div>
  </Link>;
}

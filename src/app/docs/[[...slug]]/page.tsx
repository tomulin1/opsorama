import { notFound } from 'next/navigation';
import { docs } from '@/features/docs/content';
import { DocsPage } from '@/features/docs/DocsPage';
export function generateStaticParams() { return docs.map(article => ({ slug: article.slug ? article.slug.split('/') : [] })); }
export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) { const { slug } = await params; const article = docs.find(doc => doc.slug === (slug?.join('/') || '')); return { title: `${article?.title || 'Documentation'} · Opsorama` }; }
export default async function DocumentationPage({ params }: { params: Promise<{ slug?: string[] }> }) { const { slug } = await params; const article = docs.find(doc => doc.slug === (slug?.join('/') || '')); if (!article) notFound(); return <DocsPage article={article} />; }

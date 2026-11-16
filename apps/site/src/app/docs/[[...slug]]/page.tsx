import { notFound } from 'next/navigation';
import { docs } from '@/features/docs/content';
import { DocsPage } from '@/features/docs/DocsPage';
import { JsonLd } from '@/features/seo/JsonLd';
import { docMetadata, docStructuredData } from '@/features/seo/docs';
const findArticle = (slug?: string[]) => docs.find(doc => doc.slug === (slug?.join('/') || ''));
export function generateStaticParams() { return docs.map(article => ({ slug: article.slug ? article.slug.split('/') : [] })); }
export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) { const article = findArticle((await params).slug); return article ? docMetadata(article) : { title: { absolute: 'Page not found · Opsorama' } }; }
export default async function DocumentationPage({ params }: { params: Promise<{ slug?: string[] }> }) { const article = findArticle((await params).slug); if (!article) notFound(); return <><JsonLd data={docStructuredData(article)} /><DocsPage article={article} /></>; }

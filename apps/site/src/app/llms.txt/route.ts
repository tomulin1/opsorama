import { llmsIndex } from '@/features/docs/llms';

/** Static llms.txt index of the documentation, generated from the typed docs content at build time. */
export const dynamic = 'force-static';
export function GET() { return new Response(llmsIndex(), { headers: { 'content-type': 'text/plain; charset=utf-8' } }); }

import { llmsFull } from '@/features/docs/llms';

/** Static full-text version of the documentation and object list for language models. */
export const dynamic = 'force-static';
export function GET() { return new Response(llmsFull(), { headers: { 'content-type': 'text/plain; charset=utf-8' } }); }

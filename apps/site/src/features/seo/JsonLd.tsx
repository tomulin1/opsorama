/**
 * Renders schema.org structured data as a JSON-LD script. `<` is escaped so text in the data cannot close the script element.
 * Server component: the data is part of the prerendered HTML that crawlers read.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

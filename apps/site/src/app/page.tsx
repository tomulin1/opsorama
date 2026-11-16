import { LandingPage } from '@/features/landing/LandingPage';
import { projectIdentity } from '@/features/brand/project';
import { JsonLd } from '@/features/seo/JsonLd';
import { authorSchema, pageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TITLE } from '@/features/seo/site';

export const metadata = pageMetadata({ title: SITE_TITLE, description: SITE_DESCRIPTION, path: '/' });

/** The website and the open-source toolkit it documents, as schema.org data. */
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, url: `${SITE_ORIGIN}/`, name: SITE_NAME, description: SITE_DESCRIPTION, inLanguage: 'en', publisher: authorSchema },
    { '@type': 'SoftwareSourceCode', '@id': `${SITE_ORIGIN}/#toolkit`, name: SITE_NAME, description: SITE_DESCRIPTION, url: `${SITE_ORIGIN}/`, codeRepository: projectIdentity.repositoryUrl, license: 'https://opensource.org/licenses/MIT', programmingLanguage: ['TypeScript', 'JavaScript'], runtimePlatform: 'Web browser', keywords: '3D dashboard, operations dashboard, Three.js, React, Vue, digital twin, warehouse visualization', author: authorSchema },
  ],
};

export default function Home() { return <><JsonLd data={structuredData} /><LandingPage /></>; }

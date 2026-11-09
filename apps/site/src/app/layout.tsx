import type { Metadata } from 'next';
import { projectIdentity } from '@/features/brand/project';
import { HydrationMarker } from './hydration-marker';
import './palette.css';
import './globals.css';
import './toolkit.css';
import './hud.css';
import './ecommerce.css';
import './office.css';
import './restaurant.css';
import './aquatics.css';
import './farm.css';
import './warehouse.css';
import './examples.css';
import './objects.css';
import './measurements.css';
import './motion.css';
import './brand.css';
import './landing.css';
export const metadata: Metadata = {
  title: 'Opsorama — A clear view of your operations',
  applicationName: 'Opsorama',
  authors: [{ name: projectIdentity.authorName, url: projectIdentity.repositoryUrl }],
  creator: projectIdentity.authorName,
  description: 'Opsorama brings operations into view with animated 3D dashboards for commerce, logistics, HR and other domains. Built for React, Vue and JavaScript.',
  icons: { icon: '/brand/opsorama-mark.svg', shortcut: '/brand/opsorama-mark.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}<HydrationMarker /></body></html>; }

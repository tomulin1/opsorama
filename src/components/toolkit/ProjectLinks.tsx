import { Github, Mail } from 'lucide-react';
import { projectIdentity } from '@/features/brand/project';

/** Repository and contact links for the example website's existing footer navigation. */
export function ProjectLinks() {
  return <>
    <a href={projectIdentity.repositoryUrl} target="_blank" rel="noopener noreferrer" aria-label="Opsorama on GitHub (opens in a new tab)"><Github size={14} aria-hidden="true" />GitHub</a>
    <a href={`mailto:${projectIdentity.contactEmail}`} title={projectIdentity.contactEmail}><Mail size={14} aria-hidden="true" />Contact</a>
  </>;
}

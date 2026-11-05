import type { DocArticle } from './content';
import { catalogObjects } from './objects';

export const objectArticles: DocArticle[] = [
  { slug: 'objects', title: 'Object catalog', description: 'Choose the pieces for your next dashboard. Explore real models, try their settings, and use them in your own scene.', category: 'OBJECT LIBRARY', sections: [] },
  ...catalogObjects.map(item => ({ slug: `objects/${item.slug}`, title: item.name, description: item.description, category: `OBJECT LIBRARY / ${item.category.toUpperCase()}`, sections: [] })),
];

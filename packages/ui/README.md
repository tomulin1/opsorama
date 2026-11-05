# @opsorama/ui

Optional presentation building blocks for Opsorama dashboards: framework-neutral panel builders (metric card, data panel, entity inspector, process tracker, resource list, capacity card, activity feed, status badge, field list, value meter), a DOM mount and scoped CSS. Your application supplies the data, meanings and actions; nothing binds to the scene automatically.

## Install

```sh
npm install @opsorama/ui
```

## Usage

```ts
import '@opsorama/ui/styles.css';
import { metricCard } from '@opsorama/ui';
import { mountPanel } from '@opsorama/ui/dom';

// Values come from your application; the panel only presents them.
const view = mountPanel(container, metricCard({ title: 'Open orders', value: 128, size: 'm', tone: 'warning' }));
// Later: view.dispose();
```

Builders: `metricCard`, `dataPanel`, `entityInspector`, `processTracker`, `resourceList`, `capacityCard`, `activityFeed`, `statusBadge`, `fieldList`, `valueMeter`, `zoomControl`. Each takes typed props described in its declarations. React and Vue components with the same contracts are in `@opsorama/react/ui` and `@opsorama/vue/ui`. The stylesheet is the only side effect of this package.

## Links

- [Opsorama on GitHub](https://github.com/tomulin1/opsorama): documentation website source, object browser, starters and guides.
- [Architecture](https://github.com/tomulin1/opsorama/blob/main/docs/ARCHITECTURE.md) · [Roadmap](https://github.com/tomulin1/opsorama/blob/main/docs/ROADMAP.md)

Pre-release: the API can change before 1.0. ESM only, TypeScript declarations included. MIT License, copyright 2026 Tomas Jirsa.

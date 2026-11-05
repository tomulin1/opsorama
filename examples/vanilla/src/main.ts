import { createSceneRenderer } from '@opsorama/three';
import { assets, createStarterStore, shipOrder } from './scene';

const store = createStarterStore();
const container = document.querySelector<HTMLDivElement>('#scene')!;
const selection = document.querySelector<HTMLSpanElement>('#selection')!;
const ship = document.querySelector<HTMLButtonElement>('#ship')!;

// The renderer ships no models: pass the registry of the kits the scene uses.
const renderer = createSceneRenderer(container, store, { assets, wheelZoom: true });
const unsubscribe = store.subscribe(() => { selection.textContent = `Selected: ${store.getSnapshot().selection?.entityId ?? 'none'}`; });
const onShip = () => shipOrder(store);
ship.addEventListener('click', onShip);

/** Tears the view down in reverse order, for example on a route change. */
export function dispose(): void { ship.removeEventListener('click', onShip); unsubscribe(); renderer.dispose(); store.dispose(); }
if (import.meta.hot) import.meta.hot.dispose(dispose);

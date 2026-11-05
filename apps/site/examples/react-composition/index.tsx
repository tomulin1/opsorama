'use client';
import { createSceneStore } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, Ground, Zone, Asset } from '@opsorama/react';
const store = createSceneStore();
export function MyDashboard() { return <DashboardProvider store={store}><SceneCanvas style={{ height: 420 }}><Ground id="floor" size={[20, 12]} /><Zone id="packing" size={[7, 7]} color="#e4ecff" /><Asset id="order-1" entityId="1" asset="parcel" label="#1" position={[0, .08, 1]} /></SceneCanvas></DashboardProvider>; }

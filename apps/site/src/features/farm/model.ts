import type { VisualState } from '@opsorama/core';
import type { CropStage } from '@opsorama/objects';

/** Mock data for the farm example. A host would load herd records, sensor levels, field records and tasks from its own systems. */
export type Species = 'cow' | 'horse' | 'sheep' | 'pig' | 'chicken';
export type PenId = 'dairy' | 'sheep' | 'horses' | 'pigs' | 'hens';
export type FieldId = 'F1' | 'F2' | 'F3';
export type FarmScenario = 'morning' | 'heat' | 'harvest';
export type TaskStatus = 'done' | 'in-progress' | 'due' | 'overdue';
export type FlagSeverity = 'busy' | 'warning' | 'critical';
export type TractorStatus = 'parked' | 'working' | 'service';
/** x from, x to, z from, z to in metres; every side is a whole number of 3 m fence segments. */
export type Rect = readonly [number, number, number, number];

export interface Pen {
  id: PenId; label: string; species: Species; rect: Rect; capacity: number;
  /** Fence side and segment index of the gate. */ gate: { side: 'north' | 'south' | 'east' | 'west'; segment: number };
  /** Water tank or feed trough of the pen: variant, position [x, z] and yaw. */ trough: { variant: 'water' | 'feed'; at: readonly [number, number]; yaw: number };
  /** At most this many animals are drawn; the headcount stays exact in the panels. */ shown: number;
}
export interface PenRecord { id: PenId; headcount: number; expected: number; /** Trough level in %, from the host's level sensor. */ level: number; note: string; }
export interface AnimalFlag { tag: string; pen: PenId; issue: string; severity: FlagSeverity; note: string; /** Not found at the last count, so not drawn in the scene. */ missing?: boolean; }
export interface Field { id: FieldId; name: string; crop: string; hectares: number; rect: Rect; }
export interface FieldRecord { id: FieldId; stage: CropStage; /** Soil moisture in %, from a mock probe. */ moisture: number; next: string; }
export interface FarmTask { id: string; title: string; /** Scene node the task points at. */ node: string; due: string; status: TaskStatus; who: string; }
export interface FarmSnapshot {
  scenario: FarmScenario; time: string; weather: string;
  pens: readonly PenRecord[]; flags: readonly AnimalFlag[]; fields: readonly FieldRecord[]; tasks: readonly FarmTask[];
  silos: readonly { id: 'S1' | 'S2'; grain: string; fill: number }[];
  tractor: { status: TractorStatus; field?: FieldId; operator?: string; note: string };
  barn: { bales: number; open: boolean }; coop: { open: boolean; eggs: number };
}

export const FARM_NAME = 'Brookfield Farm';
export const SPECIES: Readonly<Record<Species, { label: string; plural: string }>> = {
  cow: { label: 'Dairy cow', plural: 'dairy cows' }, horse: { label: 'Horse', plural: 'horses' }, sheep: { label: 'Sheep', plural: 'sheep' },
  pig: { label: 'Pig', plural: 'pigs' }, chicken: { label: 'Hen', plural: 'hens' },
};
export const PENS: readonly Pen[] = [
  { id: 'horses', label: 'Horse paddock', species: 'horse', rect: [-32, -20, -21, -9], capacity: 6, gate: { side: 'east', segment: 1 }, trough: { variant: 'water', at: [-22.5, -11.5], yaw: Math.PI / 2 }, shown: 5 },
  { id: 'dairy', label: 'Dairy pasture', species: 'cow', rect: [14, 32, -21, -6], capacity: 60, gate: { side: 'west', segment: 3 }, trough: { variant: 'water', at: [16.5, -9], yaw: Math.PI / 2 }, shown: 9 },
  { id: 'sheep', label: 'Sheep paddock', species: 'sheep', rect: [14, 32, -3, 9], capacity: 50, gate: { side: 'west', segment: 1 }, trough: { variant: 'water', at: [16.5, 6.5], yaw: Math.PI / 2 }, shown: 10 },
  { id: 'pigs', label: 'Pig pen', species: 'pig', rect: [-14, -5, -1, 5], capacity: 12, gate: { side: 'east', segment: 0 }, trough: { variant: 'feed', at: [-9.5, 3.7], yaw: 0 }, shown: 6 },
  { id: 'hens', label: 'Hen run', species: 'chicken', rect: [-32, -23, -3, 3], capacity: 40, gate: { side: 'east', segment: 1 }, trough: { variant: 'feed', at: [-30, 1.7], yaw: 0 }, shown: 10 },
];
export const FIELDS: readonly Field[] = [
  { id: 'F1', name: 'North Acre', crop: 'Winter wheat', hectares: 6.4, rect: [-32, -13, 13, 23] },
  { id: 'F2', name: 'Long Meadow', crop: 'Spring barley', hectares: 5.1, rect: [-9, 10, 13, 23] },
  { id: 'F3', name: 'Mill Field', crop: 'Oilseed rape', hectares: 4.2, rect: [14, 32, 13, 23] },
];
/** Trough level thresholds in % for this mock farm. */
export const TROUGH_LIMITS = Object.freeze({ low: 30 });
export const STAGE_LABELS: Readonly<Record<CropStage, string>> = { plowed: 'Plowed', sprouting: 'Sprouting', growing: 'Growing', ripe: 'Ready to harvest', harvested: 'Harvested' };
export const TASK_STATUS: Readonly<Record<TaskStatus, { label: string; state: VisualState }>> = {
  done: { label: 'Done', state: 'normal' }, 'in-progress': { label: 'In progress', state: 'busy' },
  due: { label: 'Due', state: 'inactive' }, overdue: { label: 'Overdue', state: 'critical' },
};

const pen = (id: PenId, headcount: number, expected: number, level: number, note: string): PenRecord => ({ id, headcount, expected, level, note });
const field = (id: FieldId, stage: CropStage, moisture: number, next: string): FieldRecord => ({ id, stage, moisture, next });
const task = (id: string, title: string, node: string, due: string, status: TaskStatus, who: string): FarmTask => ({ id, title, node, due, status, who });

export const SCENARIOS: Readonly<Record<FarmScenario, FarmSnapshot>> = {
  morning: {
    scenario: 'morning', time: '06:40', weather: '9 °C, light mist',
    pens: [pen('horses', 5, 5, 82, 'Turned out after breakfast.'), pen('dairy', 46, 46, 74, 'Back on pasture after milking.'), pen('sheep', 38, 38, 24, 'Trough slow to refill; check the float valve.'), pen('pigs', 9, 9, 15, 'Breakfast not yet fed.'), pen('hens', 32, 32, 68, 'Pop hole opened at 06:15.')],
    flags: [{ tag: 'UK-214', pen: 'dairy', issue: 'Lame, left hind', severity: 'warning', note: 'Walked last from the parlour. Hoof trimmer booked for Thursday.' }],
    fields: [field('F1', 'growing', 31, 'Fungicide spray in 9 days'), field('F2', 'growing', 28, 'Walk the crop on Friday'), field('F3', 'sprouting', 35, 'Slug pellets if damage spreads')],
    tasks: [task('T1', 'Morning milking', 'pin:dairy', '06:00', 'done', 'Tom'), task('T2', 'Feed the pigs', 'trough:pigs', '07:00', 'due', 'Ana'), task('T3', 'Check sheep trough float valve', 'trough:sheep', '08:00', 'due', 'Tom'), task('T4', 'Collect eggs', 'coop', '09:00', 'due', 'Ana'), task('T5', 'Look at UK-214', 'animal:UK-214', '10:00', 'due', 'Tom')],
    silos: [{ id: 'S1', grain: 'Feed barley', fill: 62 }, { id: 'S2', grain: 'Wheat', fill: 18 }],
    tractor: { status: 'parked', note: 'Fuelled and ready by the barn.' }, barn: { bales: 120, open: true }, coop: { open: true, eggs: 0 },
  },
  heat: {
    scenario: 'heat', time: '15:10', weather: '31 °C, no wind',
    pens: [pen('horses', 5, 5, 41, 'Standing in the shade by the trees.'), pen('dairy', 46, 46, 0, 'Tank empty; the cows are crowding the gate.'), pen('sheep', 37, 38, 63, 'Afternoon count one short.'), pen('pigs', 9, 9, 55, 'Wallow topped up at 13:00.'), pen('hens', 32, 32, 22, 'Feeder nearly empty after the morning round.')],
    flags: [
      { tag: 'UK-214', pen: 'dairy', issue: 'Lame, left hind', severity: 'warning', note: 'Resting in the shade; hoof trimmer booked for Thursday.' },
      { tag: 'UK-187', pen: 'dairy', issue: 'Heat stress', severity: 'critical', note: 'Panting and lying apart from the herd. Water first, then call the vet if she does not get up.' },
      { tag: 'EW-033', pen: 'sheep', issue: 'Missing at the afternoon count', severity: 'critical', note: 'Last seen by the north hedge at noon. Walk the boundary.', missing: true },
    ],
    fields: [field('F1', 'ripe', 14, 'Harvest from Thursday'), field('F2', 'ripe', 12, 'Harvest from Saturday'), field('F3', 'growing', 19, 'Irrigate tonight')],
    tasks: [task('T1', 'Refill the dairy tank and check the pump', 'trough:dairy', '15:00', 'overdue', 'Tom'), task('T2', 'Find ewe EW-033', 'pin:sheep', '15:30', 'in-progress', 'Ana'), task('T3', 'Watch UK-187', 'animal:UK-187', '15:30', 'due', 'Tom'), task('T4', 'Top up the hen feeder', 'trough:hens', '16:00', 'due', 'Ana'), task('T5', 'Service the tractor before harvest', 'tractor', '17:00', 'in-progress', 'Jakub')],
    silos: [{ id: 'S1', grain: 'Feed barley', fill: 48 }, { id: 'S2', grain: 'Wheat', fill: 6 }],
    tractor: { status: 'service', operator: 'Jakub', note: 'Oil and filter change before harvest.' }, barn: { bales: 96, open: true }, coop: { open: true, eggs: 27 },
  },
  harvest: {
    scenario: 'harvest', time: '11:20', weather: '24 °C, dry',
    pens: [pen('horses', 5, 5, 77, 'Grazing.'), pen('dairy', 46, 46, 88, 'Pump repaired yesterday.'), pen('sheep', 38, 38, 71, 'Ewe EW-033 found and back with the flock.'), pen('pigs', 9, 9, 64, 'Fed at 07:00.'), pen('hens', 31, 31, 80, 'One hen is in the sick bay and not counted in the run.')],
    flags: [{ tag: 'PG-006', pen: 'pigs', issue: 'Vet visit', severity: 'busy', note: 'Routine vaccination round with the vet this morning.' }],
    fields: [field('F1', 'harvested', 13, 'Bale the straw tomorrow'), field('F2', 'ripe', 12, 'Harvest in progress'), field('F3', 'ripe', 15, 'Harvest next week')],
    tasks: [task('T1', 'Harvest Long Meadow', 'field:F2', '08:00', 'in-progress', 'Jakub'), task('T2', 'Haul grain to silo S2', 'silo:S2', '12:00', 'due', 'Tom'), task('T3', 'Vet visit at the pig pen', 'animal:PG-006', '10:30', 'in-progress', 'Ana'), task('T4', 'Bale North Acre straw', 'field:F1', 'Tomorrow', 'due', 'Jakub')],
    silos: [{ id: 'S1', grain: 'Feed barley', fill: 41 }, { id: 'S2', grain: 'Wheat', fill: 57 }],
    tractor: { status: 'working', field: 'F2', operator: 'Jakub', note: 'Working the rows of Long Meadow.' }, barn: { bales: 84, open: false }, coop: { open: true, eggs: 30 },
  },
};

export const penOf = (id: PenId) => PENS.find(value => value.id === id)!;
export const fieldOf = (id: FieldId) => FIELDS.find(value => value.id === id)!;
export const penRecord = (snapshot: FarmSnapshot, id: PenId) => snapshot.pens.find(value => value.id === id)!;
export const fieldRecord = (snapshot: FarmSnapshot, id: FieldId) => snapshot.fields.find(value => value.id === id)!;
export const flagsOf = (snapshot: FarmSnapshot, id: PenId) => snapshot.flags.filter(flag => flag.pen === id);
/** Scene node of a flagged animal, or its pen pin while the animal is missing. */
export const flagNode = (flag: AnimalFlag) => flag.missing ? `pin:${flag.pen}` : `animal:${flag.tag}`;

/** Empty troughs draw as inactive (empty, unlit); low troughs light amber. */
export function troughState(level: number): VisualState { return level <= 0 ? 'inactive' : level < TROUGH_LIMITS.low ? 'warning' : 'normal'; }
/** A missing animal, an empty trough or a critical flag makes a pen critical; a low trough or any other flag a warning. */
export function penState(snapshot: FarmSnapshot, id: PenId): VisualState {
  const record = penRecord(snapshot, id), flags = flagsOf(snapshot, id);
  if (record.headcount < record.expected || record.level <= 0 || flags.some(flag => flag.severity === 'critical')) return 'critical';
  if (record.level < TROUGH_LIMITS.low || flags.some(flag => flag.severity === 'warning')) return 'warning';
  return 'normal';
}
export function farmMetrics(snapshot: FarmSnapshot) {
  const animals = snapshot.pens.reduce((sum, value) => sum + value.headcount, 0), expected = snapshot.pens.reduce((sum, value) => sum + value.expected, 0);
  const refill = snapshot.pens.filter(value => value.level < TROUGH_LIMITS.low);
  return {
    animals, missing: expected - animals, alerts: snapshot.flags.filter(flag => flag.severity !== 'busy').length, critical: snapshot.flags.filter(flag => flag.severity === 'critical').length,
    refill: refill.length, empty: refill.filter(value => value.level <= 0).length, ripe: snapshot.fields.filter(value => value.stage === 'ripe').length,
    open: snapshot.tasks.filter(value => value.status !== 'done').length, overdue: snapshot.tasks.filter(value => value.status === 'overdue').length,
  };
}

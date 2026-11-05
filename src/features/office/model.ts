/**
 * Host-side mock data for the open-plan office of a fictional product studio.
 * Everything in this file is plain records: the scene, metrics and panels are
 * derived from one `OfficeSnapshot`. The host stays the source of truth for the
 * roster (HR system), tickets (issue tracker), room bookings (calendar) and
 * presence (desk booking and the status people set themselves).
 *
 * Presence is coarse and self-reported: at a desk, in a booked room or pod, at a
 * team stand-up, on a break, remote or off. The dashboard shows who works on
 * which ticket and project; it does not track movement, time on task or scores.
 */
export type OfficeScenario = 'planning' | 'release' | 'hybrid';
export type TeamId = 'platform' | 'web' | 'mobile' | 'design';
export type RoomId = 'M1' | 'M2';
export type FocusPodId = 'P1' | 'P2' | 'P3';
export type HotDeskId = 'H1' | 'H2' | 'H3' | 'H4';
/** Spaces of the floor; each has a selectable status pin in the scene. */
export type AreaId = TeamId | 'hot' | RoomId | 'focus' | 'kitchen' | 'reception';
export type ProjectId = 'ATL' | 'HRB' | 'PLS' | 'ORB' | 'OPS';
export type TicketStatus = 'todo' | 'in-progress' | 'review' | 'blocked' | 'done';
export type TicketType = 'feature' | 'bug' | 'incident' | 'design' | 'research' | 'chore';
export type Priority = 'P1' | 'P2' | 'P3';
/** Where a person is, as reported by desk booking, the room calendar or their own status. */
export type Place = 'desk' | RoomId | FocusPodId | 'huddle' | 'kitchen' | 'remote' | 'off';
export type Tone = 'success' | 'info' | 'warning' | 'critical' | 'neutral';

/** Floor rectangle in metres: [west x, east x, back z, front z]. Positions are illustrative, not a measured plan. */
export type Rect = readonly [number, number, number, number];
export interface AreaLayout { id: AreaId; label: string; kind: 'team' | 'desks' | 'room' | 'pods' | 'kitchen' | 'reception'; description: string; rect: Rect; }

export interface Team { id: TeamId; label: string; mission: string; /** Carpet tint of the team neighbourhood. */ floor: string; }
export const TEAMS: readonly Team[] = [
  { id: 'platform', label: 'Platform', mission: 'APIs, data pipelines, infrastructure and on-call.', floor: '#c9d5e3' },
  { id: 'web', label: 'Web', mission: 'Web shops and client dashboards.', floor: '#c8dbd2' },
  { id: 'mobile', label: 'Mobile', mission: 'iOS and Android apps.', floor: '#e2d6c2' },
  { id: 'design', label: 'Design', mission: 'Product design, research, content and the design system.', floor: '#ddcfe2' },
];
export const team = (id: TeamId) => TEAMS.find(item => item.id === id)!;

export const AREAS: readonly AreaLayout[] = [
  { id: 'M1', label: 'Fjord room', kind: 'room', description: 'Meeting room for eight with a booking screen at the door.', rect: [-18, -11, -11, -5] },
  { id: 'M2', label: 'Delta room', kind: 'room', description: 'Meeting room for six with a booking screen at the door.', rect: [-11, -5, -11, -5] },
  { id: 'focus', label: 'Focus pods', kind: 'pods', description: 'Three single-person booths for calls and focused work.', rect: [-5, 0, -11, -5] },
  { id: 'kitchen', label: 'Kitchen', kind: 'kitchen', description: 'Coffee bar and two tables for breaks and lunch.', rect: [0, 9, -11, -5] },
  { id: 'reception', label: 'Reception', kind: 'reception', description: 'Entrance, visitor check-in and a waiting bench.', rect: [9, 18, -11, -5] },
  { id: 'platform', label: 'Platform team', kind: 'team', description: 'Six assigned desks and the team board.', rect: [-18, -10, -3.5, 7] },
  { id: 'web', label: 'Web team', kind: 'team', description: 'Six assigned desks and the team board.', rect: [-10, -2, -3.5, 7] },
  { id: 'mobile', label: 'Mobile team', kind: 'team', description: 'Six assigned desks and the team board.', rect: [-2, 6, -3.5, 7] },
  { id: 'design', label: 'Design team', kind: 'team', description: 'Six assigned desks and the team board.', rect: [6, 14, -3.5, 7] },
  { id: 'hot', label: 'Hot desks', kind: 'desks', description: 'Four bookable desks for contractors and visiting colleagues.', rect: [14, 18, -3.5, 7] },
];
export const area = (id: AreaId) => AREAS.find(item => item.id === id)!;

export const ROOMS: readonly { id: RoomId; name: string; seats: number }[] = [{ id: 'M1', name: 'Fjord', seats: 8 }, { id: 'M2', name: 'Delta', seats: 6 }];
export const room = (id: RoomId) => ROOMS.find(item => item.id === id)!;
export const FOCUS_PODS: readonly FocusPodId[] = ['P1', 'P2', 'P3'];
export const HOT_DESKS: readonly HotDeskId[] = ['H1', 'H2', 'H3', 'H4'];
/** Desks per team pod; team desk ids are `${team}-1` … `${team}-6`. */
export const TEAM_DESKS = 6;
/** Seats at the two kitchen tables, where people on a break are drawn. */
export const KITCHEN_SEATS = 8;
/** A whiteboard shows at most this many sticky notes, one per open ticket of the team. */
export const BOARD_NOTES = 12;

export interface Project { id: ProjectId; name: string; client: string; color: string; due: string; owner: TeamId; description: string; }
/** Fictional client and internal projects. `color` is the shirt colour of everyone whose current ticket belongs to the project. */
export const PROJECTS: readonly Project[] = [
  { id: 'ATL', name: 'Atlas checkout', client: 'Hearth & Field', color: '#4f7fe0', due: 'Oct 30', owner: 'web', description: 'New web checkout with a click & collect slot picker.' },
  { id: 'HRB', name: 'Harbor app', client: 'Bayline Ferries', color: '#2a9d8f', due: 'Nov 13', owner: 'mobile', description: 'Ferry booking and boarding-pass app for iOS and Android.' },
  { id: 'PLS', name: 'Pulse analytics', client: 'Internal', color: '#e09a3a', due: 'Nov 20', owner: 'platform', description: 'Usage dashboards and an events pipeline for client products.' },
  { id: 'ORB', name: 'Orbit design system', client: 'Internal', color: '#9a6ad6', due: 'Dec 4', owner: 'design', description: 'Shared components, tokens and documentation.' },
  { id: 'OPS', name: 'Platform reliability', client: 'Internal', color: '#d4566a', due: 'Ongoing', owner: 'platform', description: 'On-call, incidents, upgrades and certificates.' },
];
export const project = (id: ProjectId) => PROJECTS.find(item => item.id === id)!;
/** Shirt colour of people without a current ticket. */
export const NO_TICKET_COLOR = '#98a6b5';

export interface Employee { id: string; name: string; role: string; team: TeamId; /** Assigned desk (`platform-3`) or a booked hot desk (`H1`). */ desk: string; }
const E = (id: string, name: string, role: string, team: TeamId, desk: string): Employee => ({ id, name, role, team, desk });
/** The roster from the HR system. Names are fictional. */
export const EMPLOYEES: readonly Employee[] = [
  E('maya', 'Maya Chen', 'Engineering lead', 'platform', 'platform-1'), E('jonas', 'Jonas Berg', 'Backend engineer', 'platform', 'platform-2'),
  E('priya', 'Priya Nair', 'Site reliability engineer', 'platform', 'platform-3'), E('tomas', 'Tomás Novák', 'Backend engineer', 'platform', 'platform-4'),
  E('amara', 'Amara Okafor', 'Data engineer', 'platform', 'platform-5'), E('lukas', 'Lukas Weber', 'DevOps engineer', 'platform', 'platform-6'),
  E('sofia', 'Sofia Rossi', 'Frontend lead', 'web', 'web-1'), E('ethan', 'Ethan Brooks', 'Frontend engineer', 'web', 'web-2'),
  E('hana', 'Hana Kimura', 'Frontend engineer', 'web', 'web-3'), E('noah', 'Noah Fischer', 'Full-stack engineer', 'web', 'web-4'),
  E('leila', 'Leila Haddad', 'QA engineer', 'web', 'web-5'), E('mateo', 'Mateo García', 'Frontend engineer', 'web', 'web-6'),
  E('aisha', 'Aisha Rahman', 'Mobile lead', 'mobile', 'mobile-1'), E('ben', 'Ben Carter', 'iOS engineer', 'mobile', 'mobile-2'),
  E('elena', 'Elena Petrova', 'Android engineer', 'mobile', 'mobile-3'), E('kai', 'Kai Müller', 'Mobile engineer', 'mobile', 'mobile-4'),
  E('zoe', 'Zoe Martin', 'QA engineer', 'mobile', 'mobile-5'), E('ravi', 'Ravi Patel', 'Mobile engineer', 'mobile', 'mobile-6'),
  E('clara', 'Clara Jensen', 'Design lead', 'design', 'design-1'), E('oliver', 'Oliver Grant', 'Product designer', 'design', 'design-2'),
  E('mei', 'Mei Lin', 'UX researcher', 'design', 'design-3'), E('samuel', 'Samuel Adeyemi', 'Product designer', 'design', 'design-4'),
  E('ines', 'Inês Duarte', 'Content designer', 'design', 'design-5'), E('felix', 'Felix Strand', 'Motion designer', 'design', 'design-6'),
  E('daniel', 'Daniel Kowalski', 'Contract backend engineer', 'platform', 'H1'), E('grace', 'Grace Holm', 'Product manager', 'web', 'H2'),
];
export const employee = (id: string) => EMPLOYEES.find(item => item.id === id)!;
export const membersOf = (id: TeamId) => EMPLOYEES.filter(item => item.team === id);

export interface BacklogItem { project: ProjectId; title: string; type: TicketType; points: number; priority: Priority; }
/** Sprint backlog from the issue tracker; statuses and assignees change per snapshot. */
export const BACKLOG: Readonly<Record<string, BacklogItem>> = {
  'ATL-141': { project: 'ATL', title: 'Slot picker for click & collect', type: 'feature', points: 5, priority: 'P2' },
  'ATL-142': { project: 'ATL', title: 'Address autocomplete at checkout', type: 'feature', points: 3, priority: 'P2' },
  'ATL-145': { project: 'ATL', title: 'Retry failed payment webhooks', type: 'bug', points: 3, priority: 'P1' },
  'ATL-147': { project: 'ATL', title: 'Merge baskets after sign-in', type: 'feature', points: 5, priority: 'P2' },
  'ATL-150': { project: 'ATL', title: 'Release checkout v2', type: 'chore', points: 2, priority: 'P1' },
  'ATL-152': { project: 'ATL', title: 'Order confirmation email copy', type: 'design', points: 2, priority: 'P3' },
  'ATL-153': { project: 'ATL', title: 'Accessibility fixes in checkout', type: 'bug', points: 3, priority: 'P2' },
  'ATL-156': { project: 'ATL', title: 'End-to-end checkout tests', type: 'chore', points: 3, priority: 'P2' },
  'ATL-158': { project: 'ATL', title: 'Post-release monitoring dashboard', type: 'chore', points: 2, priority: 'P2' },
  'HRB-208': { project: 'HRB', title: 'Boarding pass wallet export', type: 'feature', points: 5, priority: 'P2' },
  'HRB-211': { project: 'HRB', title: 'Offline timetable cache', type: 'feature', points: 5, priority: 'P2' },
  'HRB-214': { project: 'HRB', title: 'Seat map on Android', type: 'feature', points: 8, priority: 'P2' },
  'HRB-217': { project: 'HRB', title: 'Push notifications for delays', type: 'feature', points: 3, priority: 'P1' },
  'HRB-219': { project: 'HRB', title: 'Crash on cold start on iOS', type: 'bug', points: 2, priority: 'P1' },
  'HRB-222': { project: 'HRB', title: 'Usability test of the booking flow', type: 'research', points: 3, priority: 'P2' },
  'HRB-224': { project: 'HRB', title: 'App store screenshots', type: 'design', points: 2, priority: 'P3' },
  'HRB-226': { project: 'HRB', title: 'Regression test pass for 3.4', type: 'chore', points: 3, priority: 'P2' },
  'PLS-31': { project: 'PLS', title: 'Events ingestion API', type: 'feature', points: 8, priority: 'P2' },
  'PLS-33': { project: 'PLS', title: 'Retention chart', type: 'feature', points: 3, priority: 'P3' },
  'PLS-36': { project: 'PLS', title: 'Warehouse schema migration', type: 'chore', points: 5, priority: 'P2' },
  'PLS-38': { project: 'PLS', title: 'Dashboard filters', type: 'feature', points: 3, priority: 'P3' },
  'ORB-64': { project: 'ORB', title: 'Date picker component', type: 'design', points: 3, priority: 'P2' },
  'ORB-66': { project: 'ORB', title: 'Colour tokens for dark mode', type: 'design', points: 5, priority: 'P2' },
  'ORB-69': { project: 'ORB', title: 'Button motion specs', type: 'design', points: 2, priority: 'P3' },
  'ORB-71': { project: 'ORB', title: 'Search on the docs site', type: 'feature', points: 3, priority: 'P3' },
  'ORB-73': { project: 'ORB', title: 'Icon set refresh', type: 'design', points: 3, priority: 'P3' },
  'OPS-77': { project: 'OPS', title: 'Staging payment gateway timeouts', type: 'incident', points: 3, priority: 'P1' },
  'OPS-80': { project: 'OPS', title: 'Upgrade Postgres to 17', type: 'chore', points: 5, priority: 'P2' },
  'OPS-82': { project: 'OPS', title: 'Rotate API certificates', type: 'chore', points: 2, priority: 'P1' },
  'OPS-84': { project: 'OPS', title: 'Cloud cost report', type: 'chore', points: 2, priority: 'P3' },
};
export const TICKET_STATUSES: readonly { id: TicketStatus; label: string; color: string; tone: Tone }[] = [
  { id: 'todo', label: 'To do', color: '#91a0b5', tone: 'neutral' },
  { id: 'in-progress', label: 'In progress', color: '#4f7fe0', tone: 'info' },
  { id: 'review', label: 'In review', color: '#c98a2e', tone: 'warning' },
  { id: 'blocked', label: 'Blocked', color: '#d4566a', tone: 'critical' },
  { id: 'done', label: 'Done', color: '#38a88a', tone: 'success' },
];
export const ticketStatus = (id: TicketStatus) => TICKET_STATUSES.find(item => item.id === id)!;
/** A person's current ticket is one assigned to them in one of these statuses. */
export const ACTIVE_STATUSES: readonly TicketStatus[] = ['in-progress', 'review', 'blocked'];

export interface PersonState { where: Place; /** Current ticket: assigned to this person and active. */ ticket?: string; /** Until when the status holds, e.g. a pod booking or leave. */ until?: string; note?: string; }
export interface TicketState { id: string; status: TicketStatus; assignee?: string; blocker?: string; }
export interface Booking { id: string; room: RoomId; from: string; to: string; title: string; project?: ProjectId; organizer: string; /** Employees in the room. */ attendees: readonly string[]; /** Employees who join remotely. */ remote?: readonly string[]; /** Visitors in the room, by visitor name. */ visitors?: readonly string[]; }
export interface Visitor { name: string; company: string; host: string; time: string; status: 'expected' | 'arrived' | 'left'; room?: RoomId; }
export interface ActivityEvent { id: string; time: string; text: string; tone?: 'info' | 'success' | 'warning' | 'critical'; }
export interface Ticket extends BacklogItem, TicketState {}

export interface OfficeSnapshot {
  scenario: OfficeScenario; day: string; time: string;
  sprint: { name: string; day: number; length: number };
  people: Readonly<Record<string, PersonState>>;
  tickets: readonly TicketState[];
  bookings: readonly Booking[];
  visitors: readonly Visitor[];
  events: readonly ActivityEvent[];
}

const P = (where: Place, ticket?: string, extra: Omit<PersonState, 'where' | 'ticket'> = {}): PersonState => ({ where, ...(ticket ? { ticket } : {}), ...extra });
const S = (id: string, status: TicketStatus, assignee?: string, blocker?: string): TicketState => ({ id, status, ...(assignee ? { assignee } : {}), ...(blocker ? { blocker } : {}) });

const planning: OfficeSnapshot = {
  scenario: 'planning', day: 'Monday, Oct 26', time: '09:40', sprint: { name: 'Sprint 42', day: 1, length: 10 },
  people: {
    maya: P('huddle', 'OPS-84'), jonas: P('huddle', 'ATL-145'), priya: P('huddle', 'OPS-82'), tomas: P('huddle', 'PLS-31'), amara: P('remote', 'PLS-36'), lukas: P('huddle', 'OPS-80'),
    sofia: P('M1'), ethan: P('M1'), hana: P('M1'), noah: P('desk', 'ATL-142'), leila: P('M1'), mateo: P('off', undefined, { until: 'Oct 28', note: 'Vacation' }),
    aisha: P('desk', 'HRB-217'), ben: P('desk', 'HRB-219'), elena: P('desk', 'HRB-214'), kai: P('remote', 'HRB-211'), zoe: P('desk', 'HRB-226'), ravi: P('desk', 'HRB-208'),
    clara: P('M2'), oliver: P('M2', 'HRB-224'), mei: P('M2', 'HRB-222'), samuel: P('desk', 'ORB-64'), ines: P('kitchen', 'ATL-152'), felix: P('P1', 'ORB-69', { until: '11:00', note: 'Animation prototyping' }),
    daniel: P('desk', 'PLS-38'), grace: P('M1'),
  },
  tickets: [
    S('ATL-141', 'todo', 'ethan'), S('ATL-142', 'in-progress', 'noah'), S('ATL-145', 'in-progress', 'jonas'), S('ATL-147', 'todo', 'hana'), S('ATL-150', 'todo', 'sofia'),
    S('ATL-152', 'in-progress', 'ines'), S('ATL-153', 'todo', 'mateo'), S('ATL-156', 'todo', 'leila'), S('ATL-158', 'todo'),
    S('HRB-208', 'in-progress', 'ravi'), S('HRB-211', 'blocked', 'kai', 'Waiting for timetable API keys from Bayline Ferries.'), S('HRB-214', 'in-progress', 'elena'),
    S('HRB-217', 'in-progress', 'aisha'), S('HRB-219', 'in-progress', 'ben'), S('HRB-222', 'in-progress', 'mei'), S('HRB-224', 'in-progress', 'oliver'), S('HRB-226', 'in-progress', 'zoe'),
    S('PLS-31', 'in-progress', 'tomas'), S('PLS-33', 'todo'), S('PLS-36', 'in-progress', 'amara'), S('PLS-38', 'in-progress', 'daniel'),
    S('ORB-64', 'in-progress', 'samuel'), S('ORB-66', 'todo', 'clara'), S('ORB-69', 'in-progress', 'felix'), S('ORB-71', 'todo'), S('ORB-73', 'todo'),
    S('OPS-77', 'todo'), S('OPS-80', 'in-progress', 'lukas'), S('OPS-82', 'in-progress', 'priya'), S('OPS-84', 'in-progress', 'maya'),
  ],
  bookings: [
    { id: 'b1', room: 'M1', from: '09:30', to: '10:30', title: 'Sprint 42 planning', project: 'ATL', organizer: 'grace', attendees: ['grace', 'sofia', 'ethan', 'hana', 'leila'], visitors: ['Nadia Brook'] },
    { id: 'b2', room: 'M1', from: '13:00', to: '14:00', title: 'Pulse roadmap', project: 'PLS', organizer: 'maya', attendees: ['maya', 'tomas', 'amara', 'daniel'] },
    { id: 'b3', room: 'M2', from: '09:00', to: '10:30', title: 'Booking flow review', project: 'HRB', organizer: 'clara', attendees: ['clara', 'oliver', 'mei'], remote: ['kai'], visitors: ['Ruth Ellis'] },
    { id: 'b4', room: 'M2', from: '14:00', to: '14:30', title: 'Vendor call: Cloudsmith', project: 'OPS', organizer: 'lukas', attendees: ['lukas'], visitors: ['Lars Moen'] },
  ],
  visitors: [
    { name: 'Ruth Ellis', company: 'Bayline Ferries', host: 'clara', time: '09:00', status: 'arrived', room: 'M2' },
    { name: 'Nadia Brook', company: 'Hearth & Field', host: 'grace', time: '09:30', status: 'arrived', room: 'M1' },
    { name: 'Lars Moen', company: 'Cloudsmith', host: 'lukas', time: '14:00', status: 'expected', room: 'M2' },
  ],
  events: [
    { id: 'p1', time: '09:38', text: 'Platform stand-up started at the team board.', tone: 'info' },
    { id: 'p2', time: '09:31', text: 'Nadia Brook (Hearth & Field) checked in for Sprint 42 planning.', tone: 'success' },
    { id: 'p3', time: '09:12', text: 'HRB-211 blocked: waiting for timetable API keys from Bayline Ferries.', tone: 'warning' },
    { id: 'p4', time: '09:05', text: 'Felix booked focus pod P1 until 11:00.' },
    { id: 'p5', time: '08:55', text: 'Sprint 42 started with 30 tickets and 106 points.' },
  ],
};

const release: OfficeSnapshot = {
  scenario: 'release', day: 'Wednesday, Oct 28', time: '14:20', sprint: { name: 'Sprint 42', day: 3, length: 10 },
  people: {
    maya: P('M2', 'OPS-84'), jonas: P('desk', 'ATL-145'), priya: P('M2', 'OPS-77'), tomas: P('desk', 'PLS-31'), amara: P('desk', 'PLS-36'), lukas: P('M2', 'OPS-82'),
    sofia: P('M2', 'ATL-150'), ethan: P('desk', 'ATL-141'), hana: P('P1', 'ATL-147', { until: '16:00', note: 'Deep work' }), noah: P('desk', 'ATL-153'), leila: P('desk', 'ATL-156'), mateo: P('off', undefined, { until: 'Oct 28', note: 'Vacation' }),
    aisha: P('desk', 'HRB-217'), ben: P('P2', 'HRB-219', { until: '15:00', note: 'Call with app store support' }), elena: P('desk', 'HRB-214'), kai: P('desk', 'HRB-211'), zoe: P('desk', 'HRB-226'), ravi: P('remote', 'HRB-208'),
    clara: P('desk', 'ORB-66'), oliver: P('desk', 'ORB-73'), mei: P('P3', 'HRB-222', { until: '15:30', note: 'User interview' }), samuel: P('desk', 'ORB-64'), ines: P('kitchen', 'ATL-152'), felix: P('remote', 'ORB-69'),
    daniel: P('desk', 'PLS-38'), grace: P('kitchen'),
  },
  tickets: [
    S('ATL-141', 'review', 'ethan'), S('ATL-142', 'done', 'noah'), S('ATL-145', 'blocked', 'jonas', 'Needs the staging gateway fix from OPS-77.'), S('ATL-147', 'in-progress', 'hana'),
    S('ATL-150', 'blocked', 'sofia', 'Release is on hold until OPS-77 and ATL-145 are resolved.'), S('ATL-152', 'in-progress', 'ines'), S('ATL-153', 'in-progress', 'noah'), S('ATL-156', 'in-progress', 'leila'), S('ATL-158', 'todo'),
    S('HRB-208', 'review', 'ravi'), S('HRB-211', 'in-progress', 'kai'), S('HRB-214', 'in-progress', 'elena'), S('HRB-217', 'review', 'aisha'), S('HRB-219', 'in-progress', 'ben'),
    S('HRB-222', 'in-progress', 'mei'), S('HRB-224', 'done', 'oliver'), S('HRB-226', 'in-progress', 'zoe'),
    S('PLS-31', 'review', 'tomas'), S('PLS-33', 'todo'), S('PLS-36', 'in-progress', 'amara'), S('PLS-38', 'in-progress', 'daniel'),
    S('ORB-64', 'review', 'samuel'), S('ORB-66', 'in-progress', 'clara'), S('ORB-69', 'review', 'felix'), S('ORB-71', 'todo'), S('ORB-73', 'in-progress', 'oliver'),
    S('OPS-77', 'in-progress', 'priya'), S('OPS-80', 'done', 'lukas'), S('OPS-82', 'in-progress', 'lukas'), S('OPS-84', 'review', 'maya'),
  ],
  bookings: [
    { id: 'b1', room: 'M1', from: '09:30', to: '09:45', title: 'Web stand-up', project: 'ATL', organizer: 'sofia', attendees: ['sofia', 'ethan', 'hana', 'noah', 'leila'] },
    { id: 'b2', room: 'M1', from: '15:00', to: '15:30', title: 'Atlas release go/no-go', project: 'ATL', organizer: 'grace', attendees: ['grace', 'sofia', 'jonas', 'priya', 'leila'] },
    { id: 'b3', room: 'M2', from: '13:30', to: '15:00', title: 'Incident bridge OPS-77', project: 'OPS', organizer: 'maya', attendees: ['maya', 'priya', 'lukas', 'sofia'], remote: ['ravi'] },
  ],
  visitors: [{ name: 'Lars Moen', company: 'Cloudsmith', host: 'lukas', time: '16:00', status: 'expected' }],
  events: [
    { id: 'r1', time: '14:12', text: 'ATL-150 blocked: checkout v2 release on hold until the gateway fix lands.', tone: 'critical' },
    { id: 'r2', time: '13:58', text: 'ATL-145 blocked by the staging gateway incident OPS-77.', tone: 'warning' },
    { id: 'r3', time: '13:31', text: 'Incident bridge for OPS-77 opened in the Delta room.', tone: 'warning' },
    { id: 'r4', time: '13:05', text: 'Hana booked focus pod P1 until 16:00.' },
    { id: 'r5', time: '11:40', text: 'OPS-80 done: Postgres 17 is live on staging.', tone: 'success' },
  ],
};

const hybrid: OfficeSnapshot = {
  scenario: 'hybrid', day: 'Friday, Oct 30', time: '15:30', sprint: { name: 'Sprint 42', day: 5, length: 10 },
  people: {
    maya: P('remote'), jonas: P('remote', 'PLS-33'), priya: P('off', undefined, { note: 'Day off' }), tomas: P('desk', 'PLS-31'), amara: P('remote', 'PLS-36'), lukas: P('desk', 'OPS-84'),
    sofia: P('kitchen'), ethan: P('remote'), hana: P('desk', 'ATL-147'), noah: P('remote', 'ATL-158'), leila: P('desk', 'ATL-156'), mateo: P('desk', 'ATL-153'),
    aisha: P('M1'), ben: P('M1'), elena: P('remote', 'HRB-214'), kai: P('remote', 'HRB-211'), zoe: P('M1', 'HRB-226'), ravi: P('off', undefined, { note: 'Sick leave' }),
    clara: P('M2', 'ORB-66'), oliver: P('M1', 'ORB-73'), mei: P('M1'), samuel: P('M2', 'ORB-71'), ines: P('M2', 'ATL-152'), felix: P('remote'),
    daniel: P('off', undefined, { note: 'Day off' }), grace: P('kitchen'),
  },
  tickets: [
    S('ATL-141', 'done', 'ethan'), S('ATL-142', 'done', 'noah'), S('ATL-145', 'done', 'jonas'), S('ATL-147', 'review', 'hana'), S('ATL-150', 'done', 'sofia'),
    S('ATL-152', 'review', 'ines'), S('ATL-153', 'in-progress', 'mateo'), S('ATL-156', 'in-progress', 'leila'), S('ATL-158', 'in-progress', 'noah'),
    S('HRB-208', 'done', 'ravi'), S('HRB-211', 'review', 'kai'), S('HRB-214', 'in-progress', 'elena'), S('HRB-217', 'done', 'aisha'), S('HRB-219', 'done', 'ben'),
    S('HRB-222', 'done', 'mei'), S('HRB-224', 'done', 'oliver'), S('HRB-226', 'review', 'zoe'),
    S('PLS-31', 'in-progress', 'tomas'), S('PLS-33', 'in-progress', 'jonas'), S('PLS-36', 'review', 'amara'), S('PLS-38', 'done', 'daniel'),
    S('ORB-64', 'done', 'samuel'), S('ORB-66', 'review', 'clara'), S('ORB-69', 'done', 'felix'), S('ORB-71', 'in-progress', 'samuel'), S('ORB-73', 'in-progress', 'oliver'),
    S('OPS-77', 'done', 'priya'), S('OPS-80', 'done', 'lukas'), S('OPS-82', 'done', 'lukas'), S('OPS-84', 'in-progress', 'lukas'),
  ],
  bookings: [
    { id: 'b1', room: 'M1', from: '15:00', to: '16:00', title: 'Harbor sprint review', project: 'HRB', organizer: 'aisha', attendees: ['aisha', 'ben', 'zoe', 'oliver', 'mei'], remote: ['elena', 'kai'], visitors: ['Ruth Ellis'] },
    { id: 'b2', room: 'M2', from: '15:15', to: '16:15', title: 'Orbit design critique', project: 'ORB', organizer: 'clara', attendees: ['clara', 'samuel', 'ines'], remote: ['felix'] },
  ],
  visitors: [{ name: 'Ruth Ellis', company: 'Bayline Ferries', host: 'aisha', time: '15:00', status: 'arrived', room: 'M1' }],
  events: [
    { id: 'h1', time: '15:16', text: 'Orbit design critique started in the Delta room with one remote attendee.' },
    { id: 'h2', time: '15:02', text: 'Ruth Ellis (Bayline Ferries) checked in for the Harbor sprint review.', tone: 'success' },
    { id: 'h3', time: '14:40', text: 'HRB-217 done: delay notifications shipped to the beta group.', tone: 'success' },
    { id: 'h4', time: '11:20', text: 'ATL-150 done: checkout v2 is live for Hearth & Field.', tone: 'success' },
    { id: 'h5', time: '09:00', text: 'Eight people work remotely today; three are off.' },
  ],
};

export const SCENARIOS: Readonly<Record<OfficeScenario, OfficeSnapshot>> = { planning, release, hybrid };

/* ── Derived values ─────────────────────────────────────────────────────── */

export const minutesOf = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const stateOf = (snapshot: OfficeSnapshot, id: string): PersonState => snapshot.people[id] ?? { where: 'remote' };
/** In the building: anywhere except remote and off. */
export const inOffice = (state: PersonState) => state.where !== 'remote' && state.where !== 'off';

export function ticket(snapshot: OfficeSnapshot, id: string): Ticket {
  const item = BACKLOG[id], state = snapshot.tickets.find(value => value.id === id);
  if (!item || !state) throw new Error(`Unknown ticket ${id} in the ${snapshot.scenario} snapshot.`);
  return { ...item, ...state };
}
export const tickets = (snapshot: OfficeSnapshot): Ticket[] => snapshot.tickets.map(value => ticket(snapshot, value.id));
export const currentTicket = (snapshot: OfficeSnapshot, id: string) => { const value = stateOf(snapshot, id).ticket; return value ? ticket(snapshot, value) : undefined; };
export const assignedTo = (snapshot: OfficeSnapshot, id: string) => tickets(snapshot).filter(value => value.assignee === id && value.status !== 'done');
/** Shirt colour: the project of the current ticket, or the neutral tone without one. */
export const projectColor = (snapshot: OfficeSnapshot, id: string) => { const value = currentTicket(snapshot, id); return value ? project(value.project).color : NO_TICKET_COLOR; };

export const PRESENCE: Readonly<Record<'desk' | 'room' | 'pod' | 'huddle' | 'kitchen' | 'remote' | 'off', { label: string; tone: Tone }>> = {
  desk: { label: 'At desk', tone: 'success' }, room: { label: 'In a meeting', tone: 'info' }, pod: { label: 'Focus pod', tone: 'info' },
  huddle: { label: 'Stand-up', tone: 'info' }, kitchen: { label: 'On a break', tone: 'neutral' }, remote: { label: 'Remote', tone: 'neutral' }, off: { label: 'Off', tone: 'neutral' },
};
export const presenceKind = (where: Place): keyof typeof PRESENCE => where === 'M1' || where === 'M2' ? 'room' : where === 'P1' || where === 'P2' || where === 'P3' ? 'pod' : where;
export const presence = (state: PersonState) => PRESENCE[presenceKind(state.where)];

/** The booking that covers the snapshot time, if any. */
export const currentBooking = (snapshot: OfficeSnapshot, id: RoomId) => snapshot.bookings.find(value => value.room === id && minutesOf(value.from) <= minutesOf(snapshot.time) && minutesOf(snapshot.time) < minutesOf(value.to));
export const nextBooking = (snapshot: OfficeSnapshot, id: RoomId) => snapshot.bookings.filter(value => value.room === id && minutesOf(value.from) > minutesOf(snapshot.time)).sort((a, b) => minutesOf(a.from) - minutesOf(b.from))[0];
export const podOccupant = (snapshot: OfficeSnapshot, id: FocusPodId) => EMPLOYEES.find(value => stateOf(snapshot, value.id).where === id);
export const hotDeskUser = (id: HotDeskId) => EMPLOYEES.find(value => value.desk === id);
export const peopleAt = (snapshot: OfficeSnapshot, where: Place) => EMPLOYEES.filter(value => stateOf(snapshot, value.id).where === where);

/** Human-readable place, e.g. "Fjord room · Sprint 42 planning" or "Vacation until Oct 28". */
export function placeLabel(snapshot: OfficeSnapshot, id: string): string {
  const person = employee(id), state = stateOf(snapshot, id);
  switch (state.where) {
    case 'desk': return person.desk.startsWith('H') ? `Hot desk ${person.desk}` : `Desk ${person.desk.split('-')[1]} · ${team(person.team).label}`;
    case 'M1': case 'M2': { const booking = currentBooking(snapshot, state.where); return `${room(state.where).name} room${booking ? ` · ${booking.title}` : ''}`; }
    case 'P1': case 'P2': case 'P3': return `Focus pod ${state.where}${state.until ? ` until ${state.until}` : ''}`;
    case 'huddle': return `${team(person.team).label} stand-up`;
    case 'kitchen': return 'Kitchen';
    case 'remote': return 'Working remotely';
    case 'off': return `${state.note ?? 'Off'}${state.until ? ` until ${state.until}` : ''}`;
  }
}

export function teamStatus(snapshot: OfficeSnapshot, id: TeamId): { label: string; tone: Tone } {
  const blocked = tickets(snapshot).filter(value => value.status === 'blocked' && value.assignee && employee(value.assignee).team === id);
  if (blocked.some(value => value.priority === 'P1')) return { label: `${blocked.length} blocked`, tone: 'critical' };
  if (blocked.length) return { label: `${blocked.length} blocked`, tone: 'warning' };
  const huddle = membersOf(id).some(value => stateOf(snapshot, value.id).where === 'huddle');
  return huddle ? { label: 'Stand-up', tone: 'info' } : { label: 'On track', tone: 'success' };
}
/** Tickets of a team's members by status, for the team whiteboard. */
export function boardCounts(snapshot: OfficeSnapshot, id: TeamId): Readonly<Record<TicketStatus, number>> {
  const counts: Record<TicketStatus, number> = { todo: 0, 'in-progress': 0, review: 0, blocked: 0, done: 0 };
  for (const value of tickets(snapshot)) if (value.assignee && employee(value.assignee).team === id) counts[value.status]++;
  return counts;
}
/** Sticky notes on a team whiteboard: one per active ticket of its members, bounded by the board. */
export const boardNotes = (snapshot: OfficeSnapshot, id: TeamId) => { const counts = boardCounts(snapshot, id); return Math.min(BOARD_NOTES, counts['in-progress'] + counts.review + counts.blocked); };

export function projectProgress(snapshot: OfficeSnapshot, id: ProjectId) {
  const list = tickets(snapshot).filter(value => value.project === id), points = (status?: TicketStatus) => list.filter(value => !status || value.status === status).reduce((sum, value) => sum + value.points, 0);
  const people = EMPLOYEES.filter(value => currentTicket(snapshot, value.id)?.project === id);
  return { tickets: list, total: points(), done: points('done'), blocked: list.filter(value => value.status === 'blocked'), people };
}
/** Blocked when a ticket is blocked; behind when done points trail the sprint day by more than a fifth. */
export function projectHealth(snapshot: OfficeSnapshot, id: ProjectId): { label: string; tone: Tone } {
  const progress = projectProgress(snapshot, id), expected = snapshot.sprint.day / snapshot.sprint.length;
  if (progress.blocked.some(value => value.priority === 'P1')) return { label: 'Blocked', tone: 'critical' };
  if (progress.blocked.length) return { label: 'Blocked ticket', tone: 'warning' };
  if (progress.total && progress.done / progress.total < expected - .2) return { label: 'Behind', tone: 'warning' };
  return { label: 'On track', tone: 'success' };
}

export function areaStatus(snapshot: OfficeSnapshot, id: AreaId): { label: string; tone: Tone } {
  const value = area(id);
  if (value.kind === 'team') return teamStatus(snapshot, id as TeamId);
  if (value.kind === 'room') { const booking = currentBooking(snapshot, id as RoomId); return booking ? { label: `Until ${booking.to}`, tone: 'info' } : { label: 'Free', tone: 'success' }; }
  if (value.kind === 'pods') { const used = FOCUS_PODS.filter(pod => podOccupant(snapshot, pod)).length; return { label: `${used} of ${FOCUS_PODS.length} in use`, tone: used === FOCUS_PODS.length ? 'warning' : used ? 'info' : 'success' }; }
  if (value.kind === 'desks') { const used = HOT_DESKS.filter(desk => { const user = hotDeskUser(desk); return user && stateOf(snapshot, user.id).where === 'desk'; }).length; return { label: `${used} of ${HOT_DESKS.length} in use`, tone: used ? 'info' : 'success' }; }
  if (value.kind === 'kitchen') { const count = peopleAt(snapshot, 'kitchen').length; return { label: count ? `${count} on a break` : 'Quiet', tone: 'neutral' }; }
  const waiting = snapshot.visitors.filter(visitor => visitor.status === 'expected').length;
  return { label: waiting ? `${waiting} expected` : 'No visitors due', tone: 'neutral' };
}

/** People an area holds right now, for its inspector and the people filter. */
export function peopleIn(snapshot: OfficeSnapshot, id: AreaId): Employee[] {
  const value = area(id);
  if (value.kind === 'team') return membersOf(id as TeamId).filter(person => !person.desk.startsWith('H'));
  if (value.kind === 'desks') return EMPLOYEES.filter(person => person.desk.startsWith('H'));
  if (value.kind === 'room') return peopleAt(snapshot, id as RoomId);
  if (value.kind === 'pods') return EMPLOYEES.filter(person => FOCUS_PODS.includes(stateOf(snapshot, person.id).where as FocusPodId));
  if (value.kind === 'kitchen') return peopleAt(snapshot, 'kitchen');
  return [];
}

export function officeMetrics(snapshot: OfficeSnapshot) {
  const states = EMPLOYEES.map(value => stateOf(snapshot, value.id)), list = tickets(snapshot);
  const count = (status: TicketStatus) => list.filter(value => value.status === status).length;
  const rooms = ROOMS.filter(value => currentBooking(snapshot, value.id)).length, pods = FOCUS_PODS.filter(value => podOccupant(snapshot, value)).length;
  const blocked = list.filter(value => value.status === 'blocked');
  return {
    present: states.filter(inOffice).length, remote: states.filter(value => value.where === 'remote').length, off: states.filter(value => value.where === 'off').length, total: EMPLOYEES.length,
    inProgress: count('in-progress'), review: count('review'), done: count('done'), blocked: blocked.length, blockedP1: blocked.filter(value => value.priority === 'P1').length, firstBlocked: blocked[0],
    rooms, pods, spaces: ROOMS.length + FOCUS_PODS.length, visitors: snapshot.visitors.filter(value => value.status === 'arrived').length,
  };
}

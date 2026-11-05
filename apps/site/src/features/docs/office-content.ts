import type { DocArticle } from './content';
export const officeArticle: DocArticle = {
  slug: 'recipes/office', title: 'Open-plan office', category: 'RECIPES',
  description: 'Who is in the office, who works on which ticket and project, and how the rooms are used, composed from shared catalog objects in one full-viewport React scene.',
  sections: [
    { id: 'floor', title: 'One floor, ten spaces', paragraphs: [
      '/examples/office shows one open-plan floor of a fictional product studio: four team neighbourhoods (Platform, Web, Mobile, Design) with six assigned desks and a sprint board each, four hot desks, the Fjord and Delta meeting rooms with booking screens, three focus pods, a kitchen with a coffee bar and reception with visitor check-in.',
      'Each space has a selectable status pin. Desk pods, team boards, meeting tables, focus pods and people are selectable too and open their inspector. Positions are illustrative and do not encode a measured floor plan.',
    ] },
    { id: 'data', title: 'Roster, tickets, bookings and presence', paragraphs: [
      'src/features/office/model.ts holds the roster (26 fictional people), five projects, a sprint backlog of 30 tickets and three mock snapshots: Monday sprint planning, Wednesday release day and Friday hybrid day. Each snapshot sets every person’s presence and current ticket, the ticket statuses and assignees, the room bookings, the visitors and the events. Metrics, panels and scene nodes are all derived from that one record.',
      'Presence is coarse and self-reported: at a desk, in a booked room or pod, at a team stand-up, on a break, remote or off. It comes from desk booking, the room calendar and the status a person sets. A current ticket is an active ticket (in progress, in review or blocked) assigned to that person in the issue tracker.',
    ] },
    { id: 'scene', title: 'What the scene shows', paragraphs: [
      'People in the building appear where their status places them: seated at their desk seat, at the meeting-table seats of their booked room, in their focus pod, at the kitchen tables, or standing at the team board for a stand-up. Remote and off people appear only in the panels. Seats come from the shared interaction slots (resolveSceneSlots), so figures sit exactly on the desk-pod, meeting-table, focus-pod, dining-table and bench seats.',
      'Shirts take the colour of the project of each person’s current ticket; people without one wear a neutral grey. Each sticky note on a team board is one active ticket of a team member (bounded to 12). Pins turn amber or red when a team or project has a blocked ticket. A supply robot follows a planned one-way loop along the aisle; people do not move between places, because the source has no movement data.',
    ], code: `const value = currentTicket(snapshot, person.id), seat = deskSeat(person.desk);
nodes.push({ id: \`person:\${person.id}\`, entityId: person.id, kind: 'asset', asset: 'worker', variant: 'seated',
  color: value ? project(value.project).color : NO_TICKET_COLOR, position: seat.position, rotation: [0, seat.yaw, 0],
  label: \`\${person.name} · \${value?.id ?? 'No ticket'}\`, labelMode: 'active', selectable: true });`, language: 'typescript' },
    { id: 'hud', title: 'Full-viewport scene with a floating HUD', paragraphs: [
      'The page follows the full-viewport pattern of the domain examples: one SceneCanvas fills the window, the navigation panel and four MetricCards (in the office, tickets in progress, blocked tickets, rooms and pods in use) float at the top, Teams/Inspector on the right, People, Tickets, Projects, Spaces and Info on the left, and the ZoomControl and toolbar at the bottom. Expanded view covers the site header and Escape leaves it; hiding panels keeps the same canvas.',
      'A team filters the people and tickets; a project card filters the people working on it. Opening a person or ticket selects the person’s figure, or their desk pod while they are away, and the inspector shows the ticket progress with ProcessTracker. The HUD uses the shared DataPanel, MetricCard, ResourceList, ActivityFeed, ProcessTracker, FieldList, StatusBadge and ValueMeter components; office fields stay in the example.',
    ] },
    { id: 'scope', title: 'Privacy, sources and boundaries', paragraphs: [
      'The example shows assignments and coarse presence, not surveillance: it draws no movement trails, measures no time on task and computes no per-person scores. Hosts that adapt it should apply their own access rules and works-council or privacy requirements before showing named presence.',
      'Replace the mock snapshots with confirmed records from your HR system, issue tracker, room calendar and desk booking tool, and call applyOfficeSnapshot with each snapshot. The dashboard sends no commands: assigning tickets, booking rooms and changing status stay in those systems. FPS and draw calls of the full scene were not profiled.',
    ] },
  ],
};

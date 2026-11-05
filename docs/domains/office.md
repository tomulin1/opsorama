# Domain recipe: open-plan office

Updated: October 21, 2026. Status: working local example at `/examples/office` (Domain 09); guide at `/docs/recipes/office`; decision record [ADR 0046](../decisions/0046-open-office-domain-example.md).

## User and spatial meaning

A team lead, delivery manager or office manager of a product studio sees one open-plan floor. They answer: who is in the office today and where (desk, meeting, focus pod, stand-up, break), who works on which ticket and project, which tickets are blocked and who holds them, and how the meeting rooms, focus pods and hot desks are used.

The scene is an illustrative floor plan, not a measured building. Each space has a selectable status pin:

| Space | What the models show |
| --- | --- |
| Platform, Web, Mobile, Design | A six-desk pod with one seated figure per person at their desk; the team board with one sticky note per active ticket (up to 12); a stand-up gathers in front of the board |
| Hot desks | A four-desk pod for contractors and visiting colleagues |
| Fjord and Delta rooms | A meeting table with one seated figure per attendee or visitor in the current booking; a booking screen at the door |
| Focus pods | Three booths; one seated figure per booked pod |
| Kitchen | Coffee bar with an espresso machine; people on a break sit at two tables |
| Reception | Visitor check-in stand, welcome board and a waiting bench |

Shirts take the colour of the project of each person's current ticket; people without one wear grey. Remote and off people appear only in the panels.

## Data

`apps/site/src/features/office/model.ts` defines the host records:

- **Roster** (HR system): 26 fictional people with role, team and an assigned or hot desk.
- **Projects**: five client and internal projects with a colour, due date and owning team.
- **Tickets** (issue tracker): a sprint backlog of 30 tickets with type, points and priority; each snapshot sets status (to do, in progress, in review, blocked, done), assignee and blocker.
- **Presence** (desk booking, room calendar, self-set status): where each person is and, optionally, until when. A current ticket is an active ticket assigned to that person.
- **Room bookings** with attendees in the room, remote attendees and visitors; **visitors** from check-in; **events**.

Three mock snapshots cover Monday sprint planning, Wednesday release day (a staging incident blocks the Atlas release) and Friday hybrid day. The scene, metrics and panels are derived from the same snapshot; the dashboard never changes records.

## Counts and motion

Counts are exact and bounded: one seated figure per person per seat (desks 6 per pod, rooms 8 and 6 seats, pods 1, kitchen 8), one sticky note per active team ticket up to 12. People are placed on the shared interaction-slot seats and do not move between places. A supply robot follows a planned one-way loop on its own aisle lane; this is illustrative recipe motion, not tracked movement. Scene motion-off and reduced motion stop it.

## Privacy boundary

The example shows assignments and coarse presence only. It draws no movement trails, measures no time on task and computes no per-person scores. Hosts that adapt it should apply their own access rules and works-council or privacy requirements before showing named presence; an aggregated variant can drop names and show team counts only.

## Integration boundary

Replace the mock snapshots with confirmed records from the HR system, issue tracker (for example Jira or Linear), room calendar ([Microsoft 365](../INTEGRATION_CANDIDATES.md#microsoft-365-and-graph)) and desk booking tool, then call `applyOfficeSnapshot`. Assigning tickets, booking rooms and setting status stay in those systems. No connector is implemented, and FPS has not been profiled.

'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, Boxes, Coffee, DoorOpen, KanbanSquare, Lock, MonitorSmartphone, Presentation, UserRound, Users } from 'lucide-react';
import { ActivityFeed, FieldList, ProcessTracker, ResourceList, StatusBadge, ValueMeter, type MetricAction } from '@opsorama/react/ui';
import type { HudMetric } from '../example-hud';
import {
  BOARD_NOTES, FOCUS_PODS, HOT_DESKS, KITCHEN_SEATS, NO_TICKET_COLOR, PROJECTS, ROOMS, TEAMS, TEAM_DESKS, TICKET_STATUSES,
  area, areaStatus, assignedTo, boardCounts, currentBooking, currentTicket, employee, hotDeskUser, inOffice, membersOf, nextBooking, officeMetrics, peopleAt, peopleIn,
  placeLabel, podOccupant, presence, project, projectHealth, projectProgress, room, stateOf, team, teamStatus, ticketStatus, tickets,
  type AreaId, type Booking, type Employee, type FocusPodId, type OfficeSnapshot, type ProjectId, type RoomId, type TeamId, type Ticket, type TicketStatus,
} from './model';

type Open = (id: string) => void;
const fields = (items: readonly [string, ReactNode][]) => <FieldList fields={items.map(([label, value]) => ({ id: label, label, value }))} />;

export type OfficeMetricId = 'present' | 'tickets' | 'blocked' | 'spaces';
/** Four short panels for the top of the floating HUD. The viewport supplies the detail each one opens. */
export function officeHudMetrics(snapshot: OfficeSnapshot, actions: Readonly<Record<OfficeMetricId, MetricAction>>): readonly HudMetric[] {
  const m = officeMetrics(snapshot), booking = ROOMS.map(value => currentBooking(snapshot, value.id)).find(Boolean);
  return [
    { id: 'present', title: 'In the office', value: m.present, unit: `/ ${m.total}`, tone: 'info', visual: { kind: 'capacity', max: m.total }, comparison: `${m.remote} remote · ${m.off} off${m.visitors ? ` · ${m.visitors} ${m.visitors === 1 ? 'visitor' : 'visitors'}` : ''}`, action: actions.present, icon: <Users size={16} /> },
    { id: 'tickets', title: 'Tickets in progress', value: m.inProgress, tone: 'info', comparison: `${m.review} in review · ${m.done} done this sprint`, action: actions.tickets, icon: <KanbanSquare size={16} /> },
    { id: 'blocked', title: 'Blocked tickets', value: m.blocked, tone: m.blockedP1 ? 'critical' : m.blocked ? 'warning' : 'success', comparison: m.firstBlocked ? `${m.firstBlocked.id} · ${m.firstBlocked.priority}${m.blocked > 1 ? ` and ${m.blocked - 1} more` : ''}` : 'Nothing blocked', action: actions.blocked, icon: m.blocked ? <AlertTriangle size={16} /> : <Lock size={16} /> },
    { id: 'spaces', title: 'Rooms & pods', value: m.rooms + m.pods, unit: `/ ${m.spaces}`, tone: 'info', visual: { kind: 'capacity', max: m.spaces }, comparison: booking ? `${room(booking.room).name}: ${booking.title} until ${booking.to}` : 'Both meeting rooms free', action: actions.spaces, icon: <Presentation size={16} /> },
  ];
}

/** Teams with presence and their most urgent condition; choosing one filters the people and opens its inspector. */
export function TeamList({ snapshot, selected, onSelect }: { snapshot: OfficeSnapshot; selected: TeamId | null; onSelect: (id: TeamId) => void }) {
  return <ResourceList className="of-team-list" label="Teams" density="compact" selectedId={selected} onSelect={id => onSelect(id as TeamId)} items={TEAMS.map(value => {
    const members = membersOf(value.id), present = members.filter(person => inOffice(stateOf(snapshot, person.id))).length, status = teamStatus(snapshot, value.id), counts = boardCounts(snapshot, value.id);
    return { id: value.id, label: value.label, description: `${present} of ${members.length} in the office · ${counts['in-progress'] + counts.review} active tickets`, status: status.label, tone: status.tone };
  })} />;
}
export function ActivityList({ snapshot }: { snapshot: OfficeSnapshot }) {
  return <ActivityFeed className="of-activity" title="Latest events" label="Latest events" density="compact" items={snapshot.events.map(event => ({ id: event.id, timeLabel: event.time, content: event.text, meta: event.tone && event.tone !== 'info' ? <StatusBadge label={event.tone === 'critical' ? 'Action' : event.tone === 'warning' ? 'Watch' : 'Done'} tone={event.tone} /> : undefined }))} />;
}

export function StatusChip({ value }: { value: TicketStatus }) {
  const item = ticketStatus(value);
  return <span className="of-chip"><i style={{ background: item.color }} aria-hidden="true" />{item.label}</span>;
}
export function ProjectChip({ id }: { id: ProjectId }) {
  const item = project(id);
  return <span className="of-chip"><i className="of-dot" style={{ background: item.color }} aria-hidden="true" />{item.name}</span>;
}
function PresenceBadge({ snapshot, id }: { snapshot: OfficeSnapshot; id: string }) {
  const value = presence(stateOf(snapshot, id));
  return <StatusBadge label={value.label} tone={value.tone} />;
}
const TicketButton = ({ value, onOpen }: { value: Ticket; onOpen: Open }) => <button type="button" onClick={() => onOpen(value.id)} aria-label={`Inspect ticket ${value.id}`}>{value.id}</button>;
const PersonButton = ({ id, onOpen }: { id: string; onOpen: Open }) => <button type="button" onClick={() => onOpen(id)} aria-label={`Inspect ${employee(id).name}`}>{employee(id).name}</button>;

/** Everyone on the roster in the current scope with presence and the ticket they are working on. */
export function PeopleTable({ snapshot, people, onPerson, onTicket }: { snapshot: OfficeSnapshot; people: readonly Employee[]; onPerson: Open; onTicket: Open }) {
  return <div className="hud-table of-table-wrap"><table><thead><tr><th>Person</th><th>Team</th><th>Presence</th><th>Working on</th><th>Project</th></tr></thead><tbody>{people.map(person => {
    const value = currentTicket(snapshot, person.id);
    return <tr key={person.id} data-alert={value?.status === 'blocked' ? value.priority === 'P1' ? 'critical' : 'warning' : undefined}>
      <td><PersonButton id={person.id} onOpen={onPerson} /><small>{person.role}</small></td><td className="of-nowrap">{team(person.team).label}</td>
      <td><PresenceBadge snapshot={snapshot} id={person.id} /><small>{placeLabel(snapshot, person.id)}</small></td>
      <td>{value ? <><TicketButton value={value} onOpen={onTicket} /> {value.title}<small><StatusChip value={value.status} /></small></> : <span className="of-muted">No ticket in progress</span>}</td>
      <td>{value ? <ProjectChip id={value.project} /> : '—'}</td>
    </tr>;
  })}</tbody></table>{people.length === 0 && <p className="of-empty">Nobody matches this filter.</p>}</div>;
}

const STATUS_ORDER: Readonly<Record<TicketStatus, number>> = { blocked: 0, 'in-progress': 1, review: 2, todo: 3, done: 4 };
/** Sprint tickets, blocked first; a key opens the ticket, an assignee opens the person. */
export function TicketTable({ snapshot, list, onPerson, onTicket }: { snapshot: OfficeSnapshot; list: readonly Ticket[]; onPerson: Open; onTicket: Open }) {
  const sorted = [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
  return <div className="hud-table of-table-wrap"><table><thead><tr><th>Ticket</th><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Points</th></tr></thead><tbody>{sorted.map(value => (
    <tr key={value.id} data-alert={value.status === 'blocked' ? value.priority === 'P1' ? 'critical' : 'warning' : undefined} data-done={value.status === 'done' || undefined}>
      <td><TicketButton value={value} onOpen={onTicket} /></td><td>{value.title}<small><ProjectChip id={value.project} /></small></td><td><StatusChip value={value.status} />{value.blocker && <small className="of-issue">{value.blocker}</small>}</td>
      <td><span className="of-priority" data-priority={value.priority}>{value.priority}</span></td><td>{value.assignee ? <PersonButton id={value.assignee} onOpen={onPerson} /> : <span className="of-muted">Unassigned</span>}{value.assignee && <small>{presence(stateOf(snapshot, value.assignee)).label}</small>}</td><td>{value.points}</td>
    </tr>))}</tbody></table>{sorted.length === 0 && <p className="of-empty">No tickets in this scope.</p>}</div>;
}

/** Project cards with sprint progress, health and the people currently on each project. */
export function ProjectPanel({ snapshot, selected, onProject, onFilter }: { snapshot: OfficeSnapshot; selected: ProjectId | null; onProject: (id: ProjectId) => void; onFilter: (id: ProjectId) => void }) {
  return <div className="of-cards">{PROJECTS.map(value => {
    const progress = projectProgress(snapshot, value.id), health = projectHealth(snapshot, value.id);
    return <article key={value.id} className="of-card" data-selected={selected === value.id || undefined} style={{ borderLeftColor: value.color }}>
      <div><strong><button type="button" onClick={() => onProject(value.id)} aria-label={`Inspect project ${value.name}`}>{value.name}</button></strong><span>{value.client} · due {value.due}</span><StatusBadge label={health.label} tone={health.tone} /></div>
      <ValueMeter label="Sprint points done" value={progress.done} max={progress.total} tone={health.tone === 'critical' ? 'critical' : health.tone === 'warning' ? 'warning' : 'info'} />
      <p>{progress.people.length ? `${progress.people.length} working on it now: ${progress.people.map(person => person.name.split(' ')[0]).join(', ')}` : 'Nobody is on a ticket of this project right now.'}</p>
      <button type="button" className="of-text-button" onClick={() => onFilter(value.id)}>{selected === value.id ? 'Clear people filter' : 'Show people on this project'}</button>
    </article>;
  })}</div>;
}

/** Room schedules, focus pods, hot desks and today's visitors. */
export function SpacesPanel({ snapshot, onSelect, onPerson }: { snapshot: OfficeSnapshot; onSelect: (nodeId: string) => void; onPerson: Open }) {
  return <div className="of-spaces">
    {ROOMS.map(value => <article key={value.id} className="of-card"><div><strong><button type="button" onClick={() => onSelect(`room:${value.id}`)} aria-label={`Inspect ${value.name} room`}>{value.name} room</button></strong><span>{value.seats} seats</span><StatusBadge label={areaStatus(snapshot, value.id).label} tone={areaStatus(snapshot, value.id).tone} /></div>
      <Schedule snapshot={snapshot} id={value.id} /></article>)}
    <h3>Focus pods</h3>
    <ul className="of-mini">{FOCUS_PODS.map(id => { const occupant = podOccupant(snapshot, id), state = occupant && stateOf(snapshot, occupant.id); return <li key={id}><button type="button" onClick={() => onSelect(`focus:${id}`)} aria-label={`Inspect focus pod ${id}`}>{id}</button><span>{occupant ? <><PersonButton id={occupant.id} onOpen={onPerson} />{state?.note ? ` · ${state.note}` : ''}</> : 'Free'}</span><span>{state?.until ? `until ${state.until}` : ''}</span></li>; })}</ul>
    <h3>Hot desks</h3>
    <ul className="of-mini">{HOT_DESKS.map(id => { const user = hotDeskUser(id), here = user && stateOf(snapshot, user.id).where === 'desk'; return <li key={id}><strong>{id}</strong><span>{user ? <>Booked by <PersonButton id={user.id} onOpen={onPerson} /></> : 'Free to book'}</span><span>{user ? here ? 'At the desk' : presence(stateOf(snapshot, user.id)).label : ''}</span></li>; })}</ul>
    <h3>Visitors today</h3>
    <VisitorList snapshot={snapshot} onPerson={onPerson} />
  </div>;
}
function Schedule({ snapshot, id }: { snapshot: OfficeSnapshot; id: RoomId }) {
  const list = snapshot.bookings.filter(value => value.room === id), current = currentBooking(snapshot, id);
  return list.length ? <ul className="of-schedule">{list.map(value => <li key={value.id} data-current={value === current || undefined}><span>{value.from}–{value.to}</span><strong>{value.title}</strong>{value.project && <ProjectChip id={value.project} />}</li>)}</ul> : <p className="of-empty">No bookings today.</p>;
}
function VisitorList({ snapshot, onPerson }: { snapshot: OfficeSnapshot; onPerson: Open }) {
  return snapshot.visitors.length ? <ul className="of-mini">{snapshot.visitors.map(value => <li key={value.name}><strong>{value.time}</strong><span>{value.name} · {value.company} · host <PersonButton id={value.host} onOpen={onPerson} /></span><span>{value.status === 'arrived' ? value.room ? `In ${room(value.room).name}` : 'Waiting' : value.status === 'left' ? 'Left' : 'Expected'}</span></li>)}</ul> : <p className="of-empty">No visitors today.</p>;
}

/* ── Inspectors ─────────────────────────────────────────────────────────── */

function Inspector({ label, eyebrow, title, icon, badge, children, note }: { label: string; eyebrow: string; title: string; icon?: ReactNode; badge?: ReactNode; children?: ReactNode; note?: string }) {
  return <aside className="of-inspector" aria-label={label}><div className="of-eyebrow">{eyebrow}</div><h2>{icon}{title}</h2>{badge}{children}{note && <div className="of-host-note">{note}</div>}</aside>;
}
function PeopleLinks({ snapshot, people, onPerson, empty }: { snapshot: OfficeSnapshot; people: readonly Employee[]; onPerson: Open; empty: string }) {
  return people.length ? <ul className="of-links">{people.map(person => { const value = currentTicket(snapshot, person.id); return <li key={person.id}><PersonButton id={person.id} onOpen={onPerson} /><span>{value ? `${value.id} · ${value.title}` : person.role}</span><PresenceBadge snapshot={snapshot} id={person.id} /></li>; })}</ul> : <p className="of-empty">{empty}</p>;
}
function TicketLinks({ list, onTicket, empty }: { list: readonly Ticket[]; onTicket: Open; empty: string }) {
  return list.length ? <ul className="of-links">{list.map(value => <li key={value.id}><TicketButton value={value} onOpen={onTicket} /><span>{value.title}</span><StatusChip value={value.status} /></li>)}</ul> : <p className="of-empty">{empty}</p>;
}
const PRESENCE_NOTE = 'Presence comes from desk booking, the room calendar and the status each person sets. The dashboard shows assignments from the issue tracker; it does not track movement or measure anyone’s work.';

export function PersonInspector({ snapshot, id, onTicket, onLocate }: { snapshot: OfficeSnapshot; id: string; onTicket: Open; onLocate: () => void }) {
  const person = employee(id), state = stateOf(snapshot, id), value = currentTicket(snapshot, id), others = assignedTo(snapshot, id).filter(item => item.id !== value?.id);
  return <Inspector label="Person inspector" eyebrow={`${team(person.team).label.toUpperCase()} / ${person.role.toUpperCase()}`} title={person.name} icon={<UserRound size={19} aria-hidden="true" />} badge={<PresenceBadge snapshot={snapshot} id={id} />} note={PRESENCE_NOTE}>
    {fields([['Where', placeLabel(snapshot, id)], ['Desk', person.desk.startsWith('H') ? `Hot desk ${person.desk}` : `${team(person.team).label} desk ${person.desk.split('-')[1]}`], ['Team', team(person.team).label]])}
    <h3>Working on</h3>
    {value ? <div className="of-current" style={{ borderLeftColor: project(value.project).color }}><div><TicketButton value={value} onOpen={onTicket} /><StatusChip value={value.status} /></div><strong>{value.title}</strong><ProjectChip id={value.project} />{value.blocker && <p className="of-alert-text">{value.blocker}</p>}</div>
      : <p className="of-empty">{state.where === 'off' ? 'Off today.' : 'No ticket in progress.'}</p>}
    <h3>Also assigned</h3><TicketLinks list={others} onTicket={onTicket} empty="No other open tickets." />
    {inOffice(state) && <button type="button" className="of-text-button" onClick={onLocate}>Show in the scene</button>}
  </Inspector>;
}

const FLOW: readonly TicketStatus[] = ['todo', 'in-progress', 'review', 'done'];
export function TicketInspector({ snapshot, value, onPerson }: { snapshot: OfficeSnapshot; value: Ticket; onPerson: Open }) {
  const blocked = value.status === 'blocked', current = blocked ? 1 : FLOW.indexOf(value.status), item = project(value.project);
  return <Inspector label="Ticket inspector" eyebrow={`${item.name.toUpperCase()} / ${value.type.toUpperCase()}`} title={value.id} badge={<StatusChip value={value.status} />} note="Change status, priority and assignee in your issue tracker. The scene shows who holds the ticket, not a command.">
    <p className="of-lead">{value.title}</p>
    <ProcessTracker className="of-steps" label="Ticket progress" density="compact" steps={FLOW.map((id, index) => ({ id, label: index === 1 && blocked ? 'Blocked' : ticketStatus(id).label, current: index === current, tone: index < current ? 'success' : index === current ? blocked ? 'critical' : 'info' : 'neutral' }))} />
    {value.blocker && <p className="of-alert-text">{value.blocker}</p>}
    {fields([['Project', <ProjectChip key="p" id={value.project} />], ['Client', item.client], ['Priority', value.priority], ['Points', value.points], ['Assignee', value.assignee ? <PersonButton key="a" id={value.assignee} onOpen={onPerson} /> : 'Unassigned'], ...(value.assignee ? [['Assignee is', placeLabel(snapshot, value.assignee)] as [string, ReactNode]] : [])])}
  </Inspector>;
}

export function ProjectInspector({ snapshot, id, onPerson, onTicket }: { snapshot: OfficeSnapshot; id: ProjectId; onPerson: Open; onTicket: Open }) {
  const value = project(id), progress = projectProgress(snapshot, id), health = projectHealth(snapshot, id);
  const open = progress.tickets.filter(item => item.status !== 'done' && item.status !== 'todo');
  return <Inspector label="Project inspector" eyebrow={`${value.client.toUpperCase()} / DUE ${value.due.toUpperCase()}`} title={value.name} icon={<i className="of-swatch" style={{ background: value.color }} aria-hidden="true" />} badge={<StatusBadge label={health.label} tone={health.tone} />} note="Shirts in the scene take the colour of the project a person is working on right now.">
    <p>{value.description}</p>
    <ValueMeter label="Sprint points done" value={progress.done} max={progress.total} tone={health.tone === 'critical' ? 'critical' : health.tone === 'warning' ? 'warning' : 'info'} />
    {fields([['Client', value.client], ['Owning team', team(value.owner).label], ['Tickets', `${progress.tickets.length} in ${snapshot.sprint.name}`], ['Blocked', progress.blocked.length]])}
    <h3>People on it now</h3><PeopleLinks snapshot={snapshot} people={progress.people} onPerson={onPerson} empty="Nobody is on a ticket of this project right now." />
    <h3>Active tickets</h3><TicketLinks list={open} onTicket={onTicket} empty="No active tickets." />
  </Inspector>;
}

export function TeamInspector({ snapshot, id, onPerson, onTicket }: { snapshot: OfficeSnapshot; id: TeamId; onPerson: Open; onTicket: Open }) {
  const value = team(id), members = membersOf(id), status = teamStatus(snapshot, id), present = members.filter(person => inOffice(stateOf(snapshot, person.id))).length;
  const atDesk = peopleIn(snapshot, id).filter(person => stateOf(snapshot, person.id).where === 'desk').length;
  const active = tickets(snapshot).filter(item => item.assignee && employee(item.assignee).team === id && item.status !== 'done' && item.status !== 'todo');
  return <Inspector label="Team inspector" eyebrow="TEAM NEIGHBOURHOOD" title={`${value.label} team`} icon={<Users size={19} aria-hidden="true" />} badge={<StatusBadge label={status.label} tone={status.tone} />} note={`The pod has ${TEAM_DESKS} assigned desks; a seated figure is a person whose status is At desk.`}>
    <p>{value.mission}</p>
    <ValueMeter label="In the office" value={present} max={members.length} unit="people" />
    {fields([['At their desks', `${atDesk} of ${TEAM_DESKS}`], ['Remote', members.filter(person => stateOf(snapshot, person.id).where === 'remote').length], ['Off', members.filter(person => stateOf(snapshot, person.id).where === 'off').length]])}
    <h3>Members</h3><PeopleLinks snapshot={snapshot} people={members} onPerson={onPerson} empty="No members." />
    <h3>Active tickets</h3><TicketLinks list={active} onTicket={onTicket} empty="No active tickets." />
  </Inspector>;
}

export function BoardInspector({ snapshot, id, onTicket }: { snapshot: OfficeSnapshot; id: TeamId; onTicket: Open }) {
  const counts = boardCounts(snapshot, id), active = counts['in-progress'] + counts.review + counts.blocked;
  const list = tickets(snapshot).filter(item => item.assignee && employee(item.assignee).team === id && item.status !== 'done');
  return <Inspector label="Team board inspector" eyebrow="TEAM BOARD" title={`${team(id).label} sprint board`} icon={<KanbanSquare size={19} aria-hidden="true" />} note={`Each sticky note is one active ticket of a team member, up to ${BOARD_NOTES}. The board mirrors the issue tracker; it is not a second source of truth.`}>
    <ul className="of-columns">{TICKET_STATUSES.map(item => <li key={item.id} style={{ borderTopColor: item.color }}><strong>{counts[item.id]}</strong><span>{item.label}</span></li>)}</ul>
    <ValueMeter label="Sticky notes on the board" value={Math.min(BOARD_NOTES, active)} max={BOARD_NOTES} />
    <h3>Open tickets</h3><TicketLinks list={list} onTicket={onTicket} empty="No open tickets for this team." />
  </Inspector>;
}

function attendees(booking: Booking) { return booking.attendees.length + (booking.visitors?.length ?? 0); }
export function RoomInspector({ snapshot, id, onPerson }: { snapshot: OfficeSnapshot; id: RoomId; onPerson: Open }) {
  const value = room(id), booking = currentBooking(snapshot, id), next = nextBooking(snapshot, id);
  return <Inspector label="Room inspector" eyebrow="MEETING ROOM" title={`${value.name} room`} icon={<Presentation size={19} aria-hidden="true" />} badge={<StatusBadge label={booking ? `In use until ${booking.to}` : 'Free'} tone={booking ? 'info' : 'success'} />} note="Bookings come from the room calendar. Remote attendees join by video and are not drawn in the room.">
    {booking ? <>
      <p className="of-lead">{booking.title}</p>
      {fields([['Time', `${booking.from}–${booking.to}`], ['Organizer', <PersonButton key="o" id={booking.organizer} onOpen={onPerson} />], ...(booking.project ? [['Project', <ProjectChip key="p" id={booking.project} />] as [string, ReactNode]] : []), ['Remote', booking.remote?.length ? booking.remote.map(person => employee(person).name).join(', ') : '—'], ['Visitors', booking.visitors?.join(', ') || '—']])}
      <ValueMeter label="Seats taken" value={Math.min(value.seats, attendees(booking))} max={value.seats} />
      <h3>In the room</h3><PeopleLinks snapshot={snapshot} people={peopleAt(snapshot, id)} onPerson={onPerson} empty="Nobody has checked in yet." />
    </> : <p>{next ? `Free until ${next.from} (${next.title}).` : 'Free for the rest of the day.'}</p>}
    <h3>Today</h3><Schedule snapshot={snapshot} id={id} />
  </Inspector>;
}

/** One focus pod, or all three when `id` is omitted (the Focus pods pin). */
export function FocusInspector({ snapshot, id, onPerson }: { snapshot: OfficeSnapshot; id?: FocusPodId; onPerson: Open }) {
  const occupant = id ? podOccupant(snapshot, id) : undefined, state = occupant ? stateOf(snapshot, occupant.id) : undefined, status = areaStatus(snapshot, 'focus');
  return <Inspector label="Focus pod inspector" eyebrow="FOCUS PODS" title={id ? `Focus pod ${id}` : 'Focus pods'} icon={<DoorOpen size={19} aria-hidden="true" />} badge={id ? <StatusBadge label={occupant ? 'In use' : 'Free'} tone={occupant ? 'info' : 'success'} /> : <StatusBadge label={status.label} tone={status.tone} />} note="Pods are booked for up to two hours; occupancy follows the booking, not a sensor.">
    {id && (occupant ? fields([['Booked by', <PersonButton key="b" id={occupant.id} onOpen={onPerson} />], ['Purpose', state?.note ?? '—'], ['Until', state?.until ?? '—']]) : <p>Free to book.</p>)}
    <h3>All pods</h3><ul className="of-mini">{FOCUS_PODS.map(pod => { const user = podOccupant(snapshot, pod); return <li key={pod}><strong>{pod}</strong><span>{user ? <PersonButton id={user.id} onOpen={onPerson} /> : 'Free'}</span><span>{user ? stateOf(snapshot, user.id).until ?? '' : ''}</span></li>; })}</ul>
  </Inspector>;
}

export function DesksInspector({ snapshot, onPerson }: { snapshot: OfficeSnapshot; onPerson: Open }) {
  return <Inspector label="Hot desks inspector" eyebrow="BOOKABLE DESKS" title="Hot desks" icon={<MonitorSmartphone size={19} aria-hidden="true" />} badge={<StatusBadge label={areaStatus(snapshot, 'hot').label} tone="info" />} note="Hot desks are booked in the desk booking tool for a whole day.">
    <ul className="of-mini">{HOT_DESKS.map(id => { const user = hotDeskUser(id); return <li key={id}><strong>{id}</strong><span>{user ? <PersonButton id={user.id} onOpen={onPerson} /> : 'Free to book'}</span><span>{user ? presence(stateOf(snapshot, user.id)).label : ''}</span></li>; })}</ul>
  </Inspector>;
}

export function KitchenInspector({ snapshot }: { snapshot: OfficeSnapshot }) {
  const count = peopleAt(snapshot, 'kitchen').length;
  return <Inspector label="Kitchen inspector" eyebrow="SHARED SPACE" title="Kitchen" icon={<Coffee size={19} aria-hidden="true" />} badge={<StatusBadge label={areaStatus(snapshot, 'kitchen').label} tone="neutral" />} note="A break is a status people set themselves. The kitchen shows how many seats are taken, not who takes how long.">
    <ValueMeter label="Table seats taken" value={Math.min(KITCHEN_SEATS, count)} max={KITCHEN_SEATS} />
    <p>Coffee bar with an espresso machine and two tables for four. The robot restocks it on every loop.</p>
  </Inspector>;
}

export function ReceptionInspector({ snapshot, onPerson }: { snapshot: OfficeSnapshot; onPerson: Open }) {
  return <Inspector label="Reception inspector" eyebrow="ENTRANCE" title="Reception" icon={<DoorOpen size={19} aria-hidden="true" />} note="Visitors check in on the tablet; their host gets a notification from the visitor management system.">
    <h3>Visitors today</h3><VisitorList snapshot={snapshot} onPerson={onPerson} />
  </Inspector>;
}

export function VisitorInspector({ snapshot, name }: { snapshot: OfficeSnapshot; name: string }) {
  const value = snapshot.visitors.find(item => item.name === name);
  if (!value) return <EmptyInspector />;
  return <Inspector label="Visitor inspector" eyebrow={`VISITOR / ${value.company.toUpperCase()}`} title={value.name} icon={<UserRound size={19} aria-hidden="true" />} badge={<StatusBadge label={value.room ? `In ${room(value.room).name}` : 'Waiting'} tone="info" />} note="Visitor records come from the check-in system and are kept only for the day of the visit.">
    {fields([['Company', value.company], ['Host', employee(value.host).name], ['Checked in', value.time]])}
  </Inspector>;
}

/** Inspector for a status pin: the matching team, room, pod, desk or shared-space inspector. */
export function AreaInspector({ snapshot, id, onPerson, onTicket }: { snapshot: OfficeSnapshot; id: AreaId; onPerson: Open; onTicket: Open }) {
  const value = area(id);
  if (value.kind === 'team') return <TeamInspector snapshot={snapshot} id={id as TeamId} onPerson={onPerson} onTicket={onTicket} />;
  if (value.kind === 'room') return <RoomInspector snapshot={snapshot} id={id as RoomId} onPerson={onPerson} />;
  if (value.kind === 'pods') return <FocusInspector snapshot={snapshot} onPerson={onPerson} />;
  if (value.kind === 'desks') return <DesksInspector snapshot={snapshot} onPerson={onPerson} />;
  if (value.kind === 'kitchen') return <KitchenInspector snapshot={snapshot} />;
  return <ReceptionInspector snapshot={snapshot} onPerson={onPerson} />;
}

export function EmptyInspector() {
  return <div className="of-inspector"><div className="of-eyebrow">INSPECTOR</div><h2>Select something</h2><p>Choose a person, desk pod, team board, meeting room, focus pod or space pin in the scene, or open a person, ticket or project from the panels.</p><ProjectLegend /></div>;
}
/** Shirt colours by project, plus the neutral tone for people without a current ticket. */
export function ProjectLegend() {
  return <div className="of-legend" aria-label="Project colour legend">{PROJECTS.map(item => <ProjectChip key={item.id} id={item.id} />)}<span className="of-chip"><i className="of-dot" style={{ background: NO_TICKET_COLOR }} aria-hidden="true" />No current ticket</span></div>;
}
export function StatusLegend() {
  return <div className="of-legend" aria-label="Ticket status legend">{TICKET_STATUSES.map(item => <StatusChip key={item.id} value={item.id} />)}</div>;
}

export const OFFICE_CATALOG = [
  ['desk-pod', 'Desk pod'], ['meeting-table', 'Meeting table'], ['whiteboard', 'Whiteboard'], ['focus-pod', 'Focus pod'], ['worker', 'Worker'],
  ['information-board', 'Information board'], ['bar-counter', 'Bar counter'], ['espresso-machine', 'Espresso machine'], ['dining-table', 'Dining table'], ['host-stand', 'Host stand'],
  ['bench', 'Bench'], ['potted-plant', 'Potted plant'], ['waste-bin', 'Waste bin'], ['mobile-robot', 'Mobile robot'], ['map-pin', 'Map pin'], ['wall-segment', 'Wall segment'], ['floor', 'Floor'],
] as const;
/** Links to the shared catalog pages of the models in the scene. */
export function OfficeLibrary() {
  return <section className="of-library" aria-label="Catalog objects"><h3><Boxes size={15} aria-hidden="true" /> {OFFICE_CATALOG.length} shared catalog objects</h3>
    <ul>{OFFICE_CATALOG.map(([asset, name]) => <li key={asset}><Link href={`/docs/objects/${asset}`}>{name}</Link></li>)}</ul></section>;
}

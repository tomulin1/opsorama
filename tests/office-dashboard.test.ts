import { describe, expect, it } from 'vitest';
import { routeDuration, type AssetNode, type SceneNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import {
  ACTIVE_STATUSES, AREAS, BACKLOG, BOARD_NOTES, EMPLOYEES, FOCUS_PODS, KITCHEN_SEATS, PROJECTS, ROOMS, SCENARIOS, TEAMS,
  boardNotes, currentBooking, currentTicket, inOffice, officeMetrics, peopleAt, projectHealth, projectProgress, stateOf, teamStatus, tickets, type OfficeScenario,
} from '../apps/site/src/features/office/model';
import { ROBOT_ROUTE, applyOfficeSnapshot, createOfficeStore, deskSeat, officeNavigation, officeNodes, personNodeId, personSceneNode, ticketSceneNode } from '../apps/site/src/features/office/scene';

const asset = (nodes: readonly SceneNode[], id: string) => nodes.find(node => node.id === id) as AssetNode;
const scenarios = Object.keys(SCENARIOS) as OfficeScenario[];

describe('open office dashboard model', () => {
  it('builds a valid store for every snapshot and replaces it without stale people', () => {
    const store = createOfficeStore('planning');
    for (const scenario of [...scenarios, 'planning'] as const) {
      applyOfficeSnapshot(store, SCENARIOS[scenario]);
      const nodes = store.getSnapshot().nodes, snapshot = SCENARIOS[scenario];
      // One figure per person in the building; remote and off people have none.
      expect(nodes.filter(node => node.id.startsWith('person:')).map(node => node.id).sort(), scenario).toEqual(EMPLOYEES.filter(person => inOffice(stateOf(snapshot, person.id))).map(person => personNodeId(person.id)).sort());
      expect(new Set(nodes.map(node => node.id)).size, scenario).toBe(nodes.length);
      for (const node of nodes) if (node.attachment) expect(nodes.some(other => other.id === node.attachment!.nodeId), node.id).toBe(true);
    }
    store.dispose();
  });

  it('keeps the roster, tickets and bookings consistent', () => {
    expect(new Set(EMPLOYEES.map(person => person.id)).size).toBe(EMPLOYEES.length);
    expect(new Set(EMPLOYEES.map(person => person.desk)).size).toBe(EMPLOYEES.length);
    for (const person of EMPLOYEES) expect(() => deskSeat(person.desk), person.desk).not.toThrow();
    expect(() => deskSeat('web-7')).toThrow(/web-7 has no seat/);
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario];
      expect(Object.keys(snapshot.people).sort(), scenario).toEqual(EMPLOYEES.map(person => person.id).sort());
      expect(snapshot.tickets.map(item => item.id).sort(), scenario).toEqual(Object.keys(BACKLOG).sort());
      for (const item of snapshot.tickets) {
        if (item.assignee) expect(EMPLOYEES.some(person => person.id === item.assignee), item.id).toBe(true);
        expect(Boolean(item.blocker), item.id).toBe(item.status === 'blocked');
      }
      // A current ticket is assigned to the person and active.
      for (const person of EMPLOYEES) {
        const value = currentTicket(snapshot, person.id);
        if (value) { expect(value.assignee, `${scenario} ${person.id}`).toBe(person.id); expect(ACTIVE_STATUSES).toContain(value.status); }
      }
      // Everyone in a room is in its current booking, and every booked attendee is there; remote attendees are remote.
      for (const value of ROOMS) {
        const booking = currentBooking(snapshot, value.id), inRoom = peopleAt(snapshot, value.id).map(person => person.id).sort();
        expect(inRoom, `${scenario} ${value.id}`).toEqual([...booking?.attendees ?? []].sort());
        for (const id of booking?.remote ?? []) expect(stateOf(snapshot, id).where, id).toBe('remote');
        expect(inRoom.length + (booking?.visitors?.length ?? 0)).toBeLessThanOrEqual(value.seats);
      }
      for (const booking of snapshot.bookings) expect([booking.organizer, ...booking.attendees, ...booking.remote ?? []].every(id => EMPLOYEES.some(person => person.id === id)), booking.id).toBe(true);
      for (const pod of FOCUS_PODS) expect(peopleAt(snapshot, pod).length).toBeLessThanOrEqual(1);
      expect(peopleAt(snapshot, 'kitchen').length).toBeLessThanOrEqual(KITCHEN_SEATS);
    }
  });

  it('draws exact bounded counts and the current project colour', () => {
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], nodes = officeNodes(snapshot);
      for (const value of TEAMS) {
        expect(asset(nodes, `board:${value.id}`).count, `${scenario} ${value.id}`).toBe(boardNotes(snapshot, value.id));
        expect(boardNotes(snapshot, value.id)).toBeLessThanOrEqual(BOARD_NOTES);
      }
      for (const person of EMPLOYEES) {
        const node = nodes.find(item => item.id === personNodeId(person.id)) as AssetNode | undefined, value = currentTicket(snapshot, person.id);
        if (node && value) expect(node.color, person.id).toBe(PROJECTS.find(item => item.id === value.project)!.color);
      }
      // Arrived visitors with a room sit in it.
      for (const visitor of snapshot.visitors.filter(item => item.status === 'arrived' && item.room)) expect(nodes.some(node => node.kind === 'asset' && node.entityId === visitor.name && node.id.startsWith(`visitor:${visitor.room}`)), visitor.name).toBe(true);
    }
  });

  it('summarizes each snapshot from the same records the panels show', () => {
    const planning = officeMetrics(SCENARIOS.planning), release = officeMetrics(SCENARIOS.release), hybrid = officeMetrics(SCENARIOS.hybrid);
    expect(planning.present + planning.remote + planning.off).toBe(EMPLOYEES.length);
    expect(planning.blocked).toBe(1); expect(planning.blockedP1).toBe(0); expect(teamStatus(SCENARIOS.planning, 'mobile').tone).toBe('warning');
    expect(release.blocked).toBe(2); expect(release.blockedP1).toBe(2); expect(teamStatus(SCENARIOS.release, 'web').tone).toBe('critical');
    expect(projectHealth(SCENARIOS.release, 'ATL').label).toBe('Blocked');
    expect(hybrid.blocked).toBe(0); expect(hybrid.remote).toBe(8); expect(hybrid.off).toBe(3);
    expect(release.rooms + release.pods).toBe(4);
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], ids = new Set(officeNodes(snapshot).map(node => node.id));
      expect(PROJECTS.reduce((sum, value) => sum + projectProgress(snapshot, value.id).total, 0)).toBe(Object.values(BACKLOG).reduce((sum, value) => sum + value.points, 0));
      // Every person and ticket resolves to a node that exists in the scene, and every area has a pin.
      for (const person of EMPLOYEES) expect(ids.has(personSceneNode(snapshot, person.id)), person.id).toBe(true);
      for (const value of tickets(snapshot)) expect(ids.has(ticketSceneNode(snapshot, value)), value.id).toBe(true);
      for (const value of AREAS) expect(ids.has(`pin:${value.id}`)).toBe(true);
    }
  });

  it('plans the robot loop on its own lane and rejects people on it', () => {
    expect(ROBOT_ROUTE.loop).toBe(true); expect(routeDuration(ROBOT_ROUTE)).toBeGreaterThan(0);
    expect(officeNavigation.check('person', ['aisle:kitchen', 'aisle:reception'])).toMatchObject([{ code: 'agent-not-allowed' }]);
  });

  it('renders every node of each snapshot with the shared factories', () => {
    // Surface labels draw on a DOM canvas, so this Node test builds the models without them.
    const built = new Set<string>();
    for (const scenario of scenarios) for (const original of officeNodes(SCENARIOS[scenario])) {
      if (original.kind !== 'asset' || built.has(original.id)) continue;
      built.add(original.id);
      const node: AssetNode = { ...original, surfaceLabel: undefined, attachment: undefined };
      const object = catalogAssets[node.asset](node);
      expect(object, node.id).toBeDefined(); disposeObject(object);
    }
  });
});

'use client';
import { exampleSelectionNodeId } from '../example-selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Briefcase, Crosshair, DoorOpen, Eye, EyeOff, Info, KanbanSquare, Maximize2, Minimize2, Palette, Users, X, Building2 } from 'lucide-react';
import { DashboardProvider, SceneCanvas, useScene, useSceneStore } from '@opsorama/react';
import { DataPanel } from '@opsorama/react/ui';
import type { SceneStore } from '@opsorama/core';
import type { SceneRenderer } from '@opsorama/three';
import { SiteHeader } from '@/components/toolkit/SiteHeader';
import { HudMetrics, HudNodePreview, HudZoom, MetricSizeControl, useHudMetricSize } from '../example-hud';
import { EMPLOYEES, SCENARIOS, currentTicket, officeMetrics, project, team, ticket, tickets, type AreaId, type FocusPodId, type OfficeScenario, type ProjectId, type RoomId, type TeamId } from './model';
import { DEFAULT_ZOOM, applyOfficeSnapshot, createOfficeStore, personSceneNode, ticketSceneNode } from './scene';
import {
  ActivityList, AreaInspector, BoardInspector, DesksInspector, EmptyInspector, FocusInspector, KitchenInspector, OfficeLibrary, PeopleTable, PersonInspector,
  ProjectInspector, ProjectLegend, ProjectPanel, ReceptionInspector, RoomInspector, SpacesPanel, StatusLegend, TeamInspector, TeamList, TicketInspector, TicketTable, VisitorInspector, officeHudMetrics,
} from './components';
import '@opsorama/ui/styles.css';
import { catalogAssets } from '@opsorama/objects';

const SCENARIO_LABELS: Readonly<Record<OfficeScenario, string>> = { planning: 'Monday sprint planning', release: 'Wednesday release day', hybrid: 'Friday hybrid day' };
const SCENARIO_NOTES: Readonly<Record<OfficeScenario, string>> = {
  planning: 'Sprint 42 planning in Fjord, the platform stand-up at its board and a blocked Harbor ticket.',
  release: 'The Atlas release is blocked by a staging incident; the incident bridge runs in Delta and all focus pods are booked.',
  hybrid: 'Eight people remote, three off; the Harbor sprint review with the client and a design critique.',
};
/** Below this width the floating panels share one area, so opening one closes the other. */
const NARROW_QUERY = '(max-width: 760px)';
type LeftPanel = 'people' | 'tickets' | 'projects' | 'spaces' | 'about';
type SidePanel = 'teams' | 'inspector';
/** A record shown in the inspector that is more specific than the selected node. */
type Detail = { kind: 'person' | 'ticket'; id: string } | { kind: 'project'; id: ProjectId };

/** Host-owned HUD over one React scene. Shared panels own presentation; mock data stays in this example. */
function OfficeViewport() {
  const store = useSceneStore(), scene = useScene(), renderer = useRef<SceneRenderer | null>(null);
  const onReady = useCallback((value: SceneRenderer) => { renderer.current = value; }, []);
  const [scenario, setScenario] = useState<OfficeScenario>('planning');
  const [teamFilter, setTeamFilter] = useState<TeamId | null>(null), [projectFilter, setProjectFilter] = useState<ProjectId | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel | null>(null), [sidePanel, setSidePanel] = useState<SidePanel | null>(null);
  const [expanded, setExpanded] = useState(false), [panelsVisible, setPanelsVisible] = useState(true);
  const { metricSize, setMetricSize } = useHudMetricSize();
  const snapshot = SCENARIOS[scenario], selection = scene.selection?.nodeId ?? null;
  const [kind, id = ''] = (selection ?? '').split(':') as [string, string | undefined];
  const people = EMPLOYEES.filter(person => (!teamFilter || person.team === teamFilter) && (!projectFilter || currentTicket(snapshot, person.id)?.project === projectFilter));
  const sprintTickets = tickets(snapshot).filter(value => (!projectFilter || value.project === projectFilter) && (!teamFilter || (value.assignee ? EMPLOYEES.find(person => person.id === value.assignee)!.team === teamFilter : project(value.project).owner === teamFilter)));
  const scope = [teamFilter && `${team(teamFilter).label} team`, projectFilter && project(projectFilter).name].filter(Boolean).join(' · ');

  // A selection from the scene or a list opens the inspector; narrow layouts close the left panel that would cover it.
  const openInspector = useCallback(() => {
    setSidePanel('inspector'); setPanelsVisible(true);
    if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null);
  }, []);
  useEffect(() => { if (selection) openInspector(); }, [selection, openInspector]);
  // Picking something in the scene replaces the record shown in the inspector.
  useEffect(() => { if (scene.selection?.origin === 'pointer') setDetail(null); }, [scene.selection]);
  useEffect(() => {
    if (!expanded) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', exit); return () => document.removeEventListener('keydown', exit);
  }, [expanded]);

  // Re-selecting the current node does not change the selection, so list clicks open the inspector directly.
  const select = (nodeId: string) => { setDetail(null); store.select(nodeId, 'keyboard'); openInspector(); };
  const inspectPerson = (value: string) => { store.select(personSceneNode(snapshot, value), 'keyboard'); setDetail({ kind: 'person', id: value }); openInspector(); };
  const inspectTicket = (value: string) => { store.select(ticketSceneNode(snapshot, ticket(snapshot, value)), 'keyboard'); setDetail({ kind: 'ticket', id: value }); openInspector(); };
  const inspectProject = (value: ProjectId) => { store.select(`board:${project(value).owner}`, 'keyboard'); setDetail({ kind: 'project', id: value }); openInspector(); };
  // A team filters people and tickets and opens its inspector; choosing it again clears the filter.
  const selectTeam = (value: TeamId) => { const next = teamFilter === value ? null : value; setTeamFilter(next); if (next) select(`pod:${next}`); };
  const filterProject = (value: ProjectId) => { const next = projectFilter === value ? null : value; setProjectFilter(next); if (next) { setLeftPanel('people'); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); } };
  const locate = (nodeId: string) => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.frame(nodeId); };
  const overview = () => { const view = renderer.current; if (view && !view.getDiagnostics().disposed) view.overview(); store.select(null); setDetail(null); };
  const changeScenario = (value: OfficeScenario) => { applyOfficeSnapshot(store, SCENARIOS[value]); setScenario(value); setDetail(null); };
  const toggleLeft = (panel: LeftPanel) => { setPanelsVisible(true); setLeftPanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setSidePanel(null); };
  const toggleSide = (panel: SidePanel) => { setPanelsVisible(true); setSidePanel(value => value === panel ? null : panel); if (window.matchMedia(NARROW_QUERY).matches) setLeftPanel(null); };
  const clearFilters = () => { setTeamFilter(null); setProjectFilter(null); };
  const closeLeft = <button type="button" className="hud-icon-button" aria-label="Close information panel" onClick={() => setLeftPanel(null)}><X size={15} /></button>;
  const filterFooter = scope ? <button type="button" className="hud-text-button" onClick={clearFilters}>Clear filter</button> : undefined;
  const sideTabs = <div className="hud-side-tabs"><button type="button" aria-pressed={sidePanel === 'teams'} onClick={() => setSidePanel('teams')}>Teams</button><button type="button" aria-pressed={sidePanel === 'inspector'} onClick={() => setSidePanel('inspector')}>Inspector</button><button type="button" className="hud-icon-button" aria-label="Hide side panel" onClick={() => setSidePanel(null)}><X size={15} /></button></div>;

  const shown = (nodeId: string) => selection === nodeId;
  const firstBlocked = officeMetrics(snapshot).firstBlocked;
  const blockedInspected = sidePanel === 'inspector' && detail?.kind === 'ticket' && detail.id === firstBlocked?.id;
  const inspector = detail?.kind === 'person' && shown(personSceneNode(snapshot, detail.id)) ? <PersonInspector snapshot={snapshot} id={detail.id} onTicket={inspectTicket} onLocate={() => locate(personSceneNode(snapshot, detail.id))} />
    : detail?.kind === 'ticket' && shown(ticketSceneNode(snapshot, ticket(snapshot, detail.id))) ? <TicketInspector snapshot={snapshot} value={ticket(snapshot, detail.id)} onPerson={inspectPerson} />
    : detail?.kind === 'project' && shown(`board:${project(detail.id).owner}`) ? <ProjectInspector snapshot={snapshot} id={detail.id} onPerson={inspectPerson} onTicket={inspectTicket} />
    : kind === 'person' ? <PersonInspector snapshot={snapshot} id={id} onTicket={inspectTicket} onLocate={() => locate(`person:${id}`)} />
    : kind === 'visitor' ? <VisitorInspector snapshot={snapshot} name={scene.selection?.entityId ?? ''} />
    : kind === 'pin' ? <AreaInspector snapshot={snapshot} id={id as AreaId} onPerson={inspectPerson} onTicket={inspectTicket} />
    : kind === 'pod' ? id === 'hot' ? <DesksInspector snapshot={snapshot} onPerson={inspectPerson} /> : <TeamInspector snapshot={snapshot} id={id as TeamId} onPerson={inspectPerson} onTicket={inspectTicket} />
    : kind === 'board' ? <BoardInspector snapshot={snapshot} id={id as TeamId} onTicket={inspectTicket} />
    : kind === 'room' || kind === 'roomboard' ? <RoomInspector snapshot={snapshot} id={id as RoomId} onPerson={inspectPerson} />
    : kind === 'focus' ? <FocusInspector snapshot={snapshot} id={id as FocusPodId} onPerson={inspectPerson} />
    : kind === 'kitchen' ? <KitchenInspector snapshot={snapshot} />
    : kind === 'reception' ? <ReceptionInspector snapshot={snapshot} onPerson={inspectPerson} />
    : <EmptyInspector />;

  return <section className="of-viewport hud-viewport" aria-label="Open-plan office" data-expanded={expanded} data-metric-size={metricSize} data-panels-visible={panelsVisible} data-left-panel={leftPanel ?? 'none'} data-side-panel={sidePanel ?? 'none'}>
    {/* The scene stays mounted, so toggling or expanding panels never remounts the canvas. */}
    <div className="hud-scene-surface"><SceneCanvas assets={catalogAssets} className="hud-canvas" wheelZoom onReady={onReady} /></div>

    {panelsVisible && <div className="hud-top">
      <DataPanel className="hud-navigation" label="Office navigation" density="compact" slots={{ header: <div className="hud-navigation-heading"><span className="hud-symbol dp-tone" data-tone="info"><Building2 size={24} /></span><div className="hud-navigation-title"><span className="hud-eyebrow">DOMAIN 09 / OPEN OFFICE</span><h1>Fernhill Studio office</h1></div><button type="button" className="hud-icon-button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div> }}>
        <div className="hud-navigation-control"><label htmlFor="of-snapshot">Mock snapshot</label><select id="of-snapshot" aria-label="Mock snapshot" value={scenario} onChange={event => changeScenario(event.target.value as OfficeScenario)}>{(Object.keys(SCENARIO_LABELS) as OfficeScenario[]).map(value => <option key={value} value={value}>{SCENARIO_LABELS[value]}</option>)}</select><span className="hud-clock"><strong>{snapshot.time}</strong> {snapshot.day} · {snapshot.sprint.name} day {snapshot.sprint.day}/{snapshot.sprint.length}</span></div>
        <p className="hud-navigation-note" role="status">{SCENARIO_NOTES[scenario]} Mock data · no HR, calendar or issue tracker connection.</p>
      </DataPanel>
      <HudMetrics label="Office metrics" size={metricSize} metrics={officeHudMetrics(snapshot, {
        present: { label: 'Open people list', onActivate: () => toggleLeft('people'), pressed: leftPanel === 'people' },
        tickets: { label: 'Open sprint tickets', onActivate: () => toggleLeft('tickets'), pressed: leftPanel === 'tickets' },
        blocked: { label: firstBlocked ? 'Inspect the first blocked ticket' : 'Open sprint tickets for blockers', onActivate: () => { if (blockedInspected) setSidePanel(null); else if (firstBlocked) inspectTicket(firstBlocked.id); else toggleLeft('tickets'); }, pressed: firstBlocked ? blockedInspected : leftPanel === 'tickets' },
        spaces: { label: 'Open rooms and spaces', onActivate: () => toggleLeft('spaces'), pressed: leftPanel === 'spaces' },
      })} />
    </div>}

    {panelsVisible && sidePanel === 'teams' && <DataPanel className="hud-side-panel" label="Teams panel" density="compact" slots={{ header: sideTabs }} freshness={{ label: 'Mock snapshot · no live feed', state: 'unknown' }}>
      <TeamList snapshot={snapshot} selected={teamFilter} onSelect={selectTeam} />
      <ActivityList snapshot={snapshot} />
    </DataPanel>}
    {panelsVisible && sidePanel === 'inspector' && <DataPanel className="hud-side-panel of-inspector-panel" label="Office inspector" density="compact" slots={{ header: sideTabs }}><HudNodePreview nodeId={exampleSelectionNodeId(scene)} />{inspector}</DataPanel>}

    {panelsVisible && leftPanel === 'people' && <DataPanel className="hud-floating-panel of-people-panel" title="People" label="People" description={`${people.length} of ${EMPLOYEES.length} people${scope ? ` · ${scope}` : ''} · shirt colour = current project`} density="compact" slots={{ icon: <Users size={16} />, actions: closeLeft, footer: filterFooter }}>
      <PeopleTable snapshot={snapshot} people={people} onPerson={inspectPerson} onTicket={inspectTicket} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'tickets' && <DataPanel className="hud-floating-panel of-tickets-panel" title="Sprint tickets" label="Sprint tickets" description={`${sprintTickets.length} of ${snapshot.tickets.length} tickets in ${snapshot.sprint.name}${scope ? ` · ${scope}` : ''}`} density="compact" slots={{ icon: <KanbanSquare size={16} />, actions: closeLeft, footer: filterFooter }}>
      <TicketTable snapshot={snapshot} list={sprintTickets} onPerson={inspectPerson} onTicket={inspectTicket} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'projects' && <DataPanel className="hud-floating-panel of-projects-panel" title="Projects" label="Projects" description={`Sprint progress in points · day ${snapshot.sprint.day} of ${snapshot.sprint.length}`} density="compact" slots={{ icon: <Briefcase size={16} />, actions: closeLeft }}>
      <ProjectPanel snapshot={snapshot} selected={projectFilter} onProject={inspectProject} onFilter={filterProject} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'spaces' && <DataPanel className="hud-floating-panel of-spaces-panel" title="Rooms & spaces" label="Rooms and spaces" description="Room bookings, focus pods, hot desks and visitors" density="compact" slots={{ icon: <DoorOpen size={16} />, actions: closeLeft }}>
      <SpacesPanel snapshot={snapshot} onSelect={select} onPerson={inspectPerson} />
    </DataPanel>}
    {panelsVisible && leftPanel === 'about' && <DataPanel className="hud-floating-panel of-about" title="Open office" label="Office information" density="compact" slots={{ icon: <Info size={16} />, actions: closeLeft }}>
      <p className="hud-concept-note">One open-plan floor of a product studio: four team neighbourhoods with assigned desks and sprint boards, hot desks, two meeting rooms, focus pods, a kitchen and reception. People appear where their status says they are: at their desk, in a booked room or pod, at a stand-up or on a break; remote and off people appear only in the panels. Shirts take the colour of the project of each person&apos;s current ticket, and each sticky note is one active ticket of the team. Presence is self-reported and coarse; nothing here tracks movement or measures work. Every model comes from the shared catalog.</p>
      <h3 className="of-section-title">Shirt colour · current project</h3><ProjectLegend />
      <h3 className="of-section-title">Ticket status</h3><StatusLegend />
      <OfficeLibrary />
    </DataPanel>}

    <div className="hud-viewport-controls">
      <HudZoom rendererRef={renderer} defaultZoom={DEFAULT_ZOOM} />
      <DataPanel className="hud-viewport-toolbar" label="Viewport controls" density="compact">
        <div className="hud-toolbar-group"><button type="button" aria-pressed={leftPanel === 'people' && panelsVisible} onClick={() => toggleLeft('people')}><Users size={14} />People</button><button type="button" aria-pressed={leftPanel === 'tickets' && panelsVisible} onClick={() => toggleLeft('tickets')}><KanbanSquare size={14} />Tickets</button><button type="button" aria-pressed={leftPanel === 'projects' && panelsVisible} onClick={() => toggleLeft('projects')}><Briefcase size={14} />Projects</button><button type="button" aria-pressed={leftPanel === 'spaces' && panelsVisible} onClick={() => toggleLeft('spaces')}><DoorOpen size={14} />Spaces</button><button type="button" aria-pressed={leftPanel === 'about' && panelsVisible} onClick={() => toggleLeft('about')}><Info size={14} />Info</button><button type="button" aria-pressed={sidePanel === 'teams' && panelsVisible} onClick={() => toggleSide('teams')}><Users size={14} />Teams</button></div>
        <MetricSizeControl size={metricSize} onChange={setMetricSize} />
        <div className="hud-toolbar-group hud-scene-controls"><button type="button" onClick={overview}><Crosshair size={14} />Overview</button><button type="button" onClick={() => store.configure({ theme: scene.settings.theme === 'light' ? 'midnight' : 'light' })}><Palette size={14} />Change theme</button></div>
        <label className="hud-motion"><Activity size={13} /><span>Motion</span><input aria-label="Office motion" type="checkbox" checked={scene.settings.motion} onChange={event => store.configure({ motion: event.target.checked })} /></label>
        <div className="hud-toolbar-group hud-display-controls"><button type="button" aria-label={panelsVisible ? 'Hide information panels' : 'Show information panels'} onClick={() => setPanelsVisible(value => !value)}>{panelsVisible ? <EyeOff size={15} /> : <Eye size={15} />}</button>{!panelsVisible && <button type="button" aria-label={expanded ? 'Exit expanded view' : 'Expand viewport'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}<span>Drag to pan · select a person, desk, board or room</span></div>
      </DataPanel>
    </div>
  </section>;
}

export function OfficeDashboard() {
  const [store, setStore] = useState<SceneStore | null>(null);
  useEffect(() => { const session = createOfficeStore(); setStore(session); return () => session.dispose(); }, []);
  return <main className="hud-page office-page"><SiteHeader />{store ? <DashboardProvider store={store}><OfficeViewport /></DashboardProvider> : <p className="of-preparing">Preparing office dashboard…</p>}</main>;
}

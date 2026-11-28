import { AlertTriangle, CheckCircle2, Server, Thermometer, Zap } from 'lucide-react';
import type { MetricAction } from '@opsorama/react/ui';
import { datacenterIncidents, datacenterInletLimit, datacenterRackLoadHistory, datacenterReading, datacenterRecords, type DatacenterScenario } from '../../../examples/datacenter-data';
import type { HudMetric } from '../example-hud';

export type DatacenterMetricId = 'cpu' | 'load' | 'inlet' | 'alerts';

/** The rack whose inlet reads highest in the scenario; the inlet panel inspects it. */
export function datacenterPeakRack(scenario: DatacenterScenario) {
  const peakInlet = Math.max(...datacenterRecords.map(record => datacenterReading(record, scenario).inlet));
  return { rack: datacenterRecords.find(record => datacenterReading(record, scenario).inlet === peakInlet)!, inlet: peakInlet };
}

/** Four short panels for the top of the datacenter HUD. The viewport supplies the detail each one opens. */
export function datacenterHudMetrics(scenario: DatacenterScenario, actions: Readonly<Record<DatacenterMetricId, MetricAction>>): readonly HudMetric[] {
  const incidents = scenario === 'incident' ? datacenterIncidents : [];
  const { inlet: peakInlet } = datacenterPeakRack(scenario);
  const inletMargin = peakInlet - datacenterInletLimit, inletTone = inletMargin > 0 ? 'critical' : 'success';
  const rackLoad = datacenterRecords.reduce((sum, rack) => sum + rack.power, 0);
  const meanCpu = datacenterRecords.reduce((sum, rack) => sum + rack.load, 0) / datacenterRecords.length;
  return [
    { id: 'cpu', title: 'Facility CPU', value: meanCpu, formatValue: value => Number(value).toFixed(0), unit: '%', tone: 'info', visual: { kind: 'capacity', max: 100 }, comparison: `${datacenterRecords.length} racks across four halls`, action: actions.cpu, icon: <Server size={16} /> },
    { id: 'load', title: 'Rack load', value: rackLoad, formatValue: value => Number(value).toFixed(1), unit: 'kW', tone: 'info', visual: { kind: 'trend', points: datacenterRackLoadHistory(rackLoad), label: 'Mock rack load over the last 60 minutes' }, comparison: 'Mock readings', action: actions.load, icon: <Zap size={16} /> },
    { id: 'inlet', title: 'Peak inlet', value: peakInlet, formatValue: value => Number(value).toFixed(1), unit: '°C', tone: inletTone, delta: { label: `${Math.abs(inletMargin).toFixed(1)} °C ${inletMargin > 0 ? 'over' : 'under'} limit`, direction: inletMargin > 0 ? 'up' : 'down', tone: inletTone }, comparison: scenario === 'incident' ? 'Inlet alert active' : 'Recovered snapshot', action: actions.inlet, icon: <Thermometer size={16} /> },
    { id: 'alerts', title: 'Open alerts', value: incidents.length, tone: incidents.length ? 'critical' : 'success', comparison: incidents.length ? '1 critical · 2 warning' : 'All recovered', action: actions.alerts, icon: incidents.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} /> },
  ];
}

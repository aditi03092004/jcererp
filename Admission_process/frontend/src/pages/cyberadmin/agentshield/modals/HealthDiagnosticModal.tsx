import React, { useState, useEffect } from 'react';
import agentshieldService from '../../../../services/agentshield.service';
import {
  Server,
  HeartPulse,
  Database,
  Radio,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Clock,
  Activity,
} from 'lucide-react';

export const HealthDiagnosticModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchHealth = async () => {
    try {
      setRefreshing(true);
      const res = await agentshieldService.getHealth();
      if (res.success) {
        setDiagnostics(res.data);
      }
    } catch (err) {
      console.error('Failed to load health diagnostics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealth();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Server className="size-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-white text-base">AgentShield Engine Diagnostics</h3>
              <p className="text-[11px] text-slate-400">Internal subsystem and persistence health checks</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchHealth}
              disabled={refreshing}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-400">Querying backend subsystem health...</p>
          </div>
        ) : !diagnostics ? (
          <div className="py-8 text-center text-rose-400 text-xs">
            Unable to communicate with AgentShield health diagnostic endpoint.
          </div>
        ) : (
          <div className="space-y-4 text-xs font-mono">
            {/* Top Engine Status Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between font-sans ${
                diagnostics.status === 'HEALTHY'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 className="size-5 text-emerald-400" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wide">
                    {diagnostics.status === 'HEALTHY' ? 'SYSTEM HEALTHY • MONITORING ACTIVE' : 'SYSTEM DEGRADED'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Engine initialized and evaluating live ERP request signals.
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1 font-sans">
                  <Database className="size-3.5 text-blue-400" />
                  <span>PostgreSQL Database</span>
                </div>
                <div className="text-sm font-bold text-white">{diagnostics.database?.status}</div>
                <div className="text-[10px] text-slate-500">Latency: {diagnostics.database?.latencyMs}ms</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1 font-sans">
                  <Radio className="size-3.5 text-cyan-400" />
                  <span>SOC WebSocket Channel</span>
                </div>
                <div className="text-sm font-bold text-white">
                  {diagnostics.telemetry?.connectedSocSubscribers} Active Subscriber(s)
                </div>
                <div className="text-[10px] text-slate-500">Channel: agentshield-soc</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1 font-sans">
                  <Sliders className="size-3.5 text-emerald-400" />
                  <span>Detection Rules</span>
                </div>
                <div className="text-sm font-bold text-white">
                  {diagnostics.monitoring?.rulesEnabled} of {diagnostics.monitoring?.rulesLoaded} Enabled
                </div>
                <div className="text-[10px] text-slate-500">Sliding windows: ACTIVE</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="flex items-center space-x-1.5 text-slate-400 text-[11px] mb-1 font-sans">
                  <Activity className="size-3.5 text-purple-400" />
                  <span>Signal Pipeline</span>
                </div>
                <div className="text-sm font-bold text-white">
                  {diagnostics.monitoring?.totalEventsProcessed} Processed
                </div>
                <div className="text-[10px] text-slate-500">Violations: {diagnostics.monitoring?.totalViolationsDetected}</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div>Uptime: {Math.floor(diagnostics.telemetry?.uptimeSeconds / 60)} minutes</div>
              <div>Last Processed Signal: {diagnostics.monitoring?.lastProcessedEventAt ? new Date(diagnostics.monitoring.lastProcessedEventAt).toLocaleString() : 'None yet'}</div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthDiagnosticModal;


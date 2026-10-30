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
  ShieldAlert,
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/60">
              <Server className="size-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-neutral-900 dark:text-white text-base">AgentShield Engine Diagnostics</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Internal subsystem and persistence health checks</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={fetchHealth}
              disabled={refreshing}
              className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition cursor-pointer"
              title="Refresh Engine Diagnostics"
            >
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-violet-600 dark:text-violet-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="size-8 rounded-full border-2 border-violet-500/20 border-t-violet-600 animate-spin mx-auto mb-2" />
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Querying backend subsystem health...</p>
          </div>
        ) : !diagnostics ? (
          <div className="py-8 text-center text-rose-600 dark:text-rose-400 text-xs font-semibold">
            Unable to communicate with AgentShield health diagnostic endpoint.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Top Engine Status Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between ${
                diagnostics.status === 'HEALTHY'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div className="text-xs font-extrabold uppercase tracking-wide">
                    {diagnostics.status === 'HEALTHY' ? 'SYSTEM HEALTHY • MONITORING ACTIVE' : 'SYSTEM DEGRADED'}
                  </div>
                  <div className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    Engine initialized and evaluating live ERP request signals.
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                <div className="flex items-center space-x-1.5 text-neutral-500 dark:text-neutral-400 text-[11px] mb-1 font-semibold">
                  <Database className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span>PostgreSQL Database</span>
                </div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{diagnostics.database?.status}</div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Latency: {diagnostics.database?.latencyMs}ms</div>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                <div className="flex items-center space-x-1.5 text-neutral-500 dark:text-neutral-400 text-[11px] mb-1 font-semibold">
                  <Radio className="size-3.5 text-violet-600 dark:text-violet-400" />
                  <span>SOC WebSocket Channel</span>
                </div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                  {diagnostics.telemetry?.connectedSocSubscribers} Active Subscriber(s)
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Channel: agentshield-soc</div>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                <div className="flex items-center space-x-1.5 text-neutral-500 dark:text-neutral-400 text-[11px] mb-1 font-semibold">
                  <Sliders className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Detection Rules</span>
                </div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                  {diagnostics.monitoring?.rulesEnabled} of {diagnostics.monitoring?.rulesLoaded} Enabled
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Sliding windows: ACTIVE</div>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                <div className="flex items-center space-x-1.5 text-neutral-500 dark:text-neutral-400 text-[11px] mb-1 font-semibold">
                  <Activity className="size-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Signal Pipeline</span>
                </div>
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                  {diagnostics.monitoring?.totalEventsProcessed} Processed
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Violations: {diagnostics.monitoring?.totalViolationsDetected}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 text-[11px] text-neutral-600 dark:text-neutral-300 space-y-1">
              <div><span className="font-semibold text-neutral-700 dark:text-neutral-200">Uptime:</span> {Math.floor(diagnostics.telemetry?.uptimeSeconds / 60)} minutes</div>
              <div><span className="font-semibold text-neutral-700 dark:text-neutral-200">Last Processed Signal:</span> {diagnostics.monitoring?.lastProcessedEventAt ? new Date(diagnostics.monitoring.lastProcessedEventAt).toLocaleString() : 'None yet'}</div>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthDiagnosticModal;

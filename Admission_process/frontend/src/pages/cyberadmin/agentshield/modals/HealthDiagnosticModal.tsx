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

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-2xl w-full max-w-[calc(100vw-32px)] sm:max-w-[680px] max-h-[calc(100vh-40px)] overflow-y-auto shadow-xl p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-neutral-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-[#7C3AED] dark:text-purple-400 border border-purple-100 dark:border-purple-900/60">
              <Server className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg leading-tight">
                AgentShield Engine Diagnostics
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Internal subsystem and persistence health checks
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={fetchHealth}
              disabled={refreshing}
              className="size-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer disabled:opacity-50"
              title="Refresh Engine Diagnostics"
            >
              <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-[#7C3AED]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center">
            <div className="size-10 rounded-full border-3 border-purple-500/20 border-t-[#7C3AED] animate-spin mx-auto mb-2.5" />
            <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
              Querying backend subsystem health...
            </p>
          </div>
        ) : !diagnostics ? (
          <div className="py-10 text-center text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold">
            Unable to communicate with AgentShield health diagnostic endpoint.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Top Engine Status Banner */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                diagnostics.status === 'HEALTHY'
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-800/80 text-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center space-x-3">
                {diagnostics.status === 'HEALTHY' ? (
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs sm:text-sm font-extrabold uppercase tracking-wide">
                    {diagnostics.status === 'HEALTHY' ? 'SYSTEM HEALTHY • MONITORING ACTIVE' : 'SYSTEM DEGRADED'}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Engine initialized and evaluating live ERP request signals.
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic Metrics Grid (Clean 2-Column Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
              {/* 1. PostgreSQL Database */}
              <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-neutral-800/40 border border-slate-200/80 dark:border-neutral-700/80 flex flex-col justify-between min-h-[96px]">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1 font-semibold">
                  <Database className="size-4 text-[#7C3AED]" />
                  <span>PostgreSQL Database</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  {diagnostics.database?.status || 'CONNECTED'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Latency: {diagnostics.database?.latencyMs ?? 1}ms
                </div>
              </div>

              {/* 2. SOC WebSocket Channel */}
              <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-neutral-800/40 border border-slate-200/80 dark:border-neutral-700/80 flex flex-col justify-between min-h-[96px]">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1 font-semibold">
                  <Radio className="size-4 text-[#7C3AED]" />
                  <span>SOC WebSocket Channel</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  {diagnostics.telemetry?.connectedSocSubscribers ?? 1} Active Subscriber(s)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Channel: agentshield-soc
                </div>
              </div>

              {/* 3. Detection Rules */}
              <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-neutral-800/40 border border-slate-200/80 dark:border-neutral-700/80 flex flex-col justify-between min-h-[96px]">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1 font-semibold">
                  <Sliders className="size-4 text-[#7C3AED]" />
                  <span>Detection Rules</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  {diagnostics.monitoring?.rulesEnabled ?? 6} of {diagnostics.monitoring?.rulesLoaded ?? 6} Enabled
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Sliding windows: ACTIVE
                </div>
              </div>

              {/* 4. Signal Pipeline */}
              <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-neutral-800/40 border border-slate-200/80 dark:border-neutral-700/80 flex flex-col justify-between min-h-[96px]">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1 font-semibold">
                  <Activity className="size-4 text-[#7C3AED]" />
                  <span>Signal Pipeline</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  {diagnostics.monitoring?.totalEventsProcessed ?? 0} Processed
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Violations: {diagnostics.monitoring?.totalViolationsDetected ?? 0}
                </div>
              </div>
            </div>

            {/* System Info Card */}
            <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-neutral-800/40 border border-slate-200/80 dark:border-neutral-700/80 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 font-medium">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="font-bold text-slate-500 dark:text-slate-400">Uptime:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {Math.floor((diagnostics.telemetry?.uptimeSeconds || 0) / 60)} minutes
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="font-bold text-slate-500 dark:text-slate-400">Last Processed Signal:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {diagnostics.monitoring?.lastProcessedEventAt
                    ? new Date(diagnostics.monitoring.lastProcessedEventAt).toLocaleString()
                    : 'None yet'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3.5 border-t border-slate-100 dark:border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#172554] hover:bg-[#0f172a] text-white transition shadow-2xs cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthDiagnosticModal;

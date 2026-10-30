import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import agentshieldService from '../../../../services/agentshield.service';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Flame,
  Activity,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Ban,
  CheckCircle2,
  Server,
  Zap,
  ChevronRight,
  Lock,
  FileCode2,
  Sliders,
} from 'lucide-react';

interface OverviewMetrics {
  openIncidents: number;
  criticalIncidents: number;
  highIncidents: number;
  recentEventsCount: number;
  blockedRequestsCount: number;
  activeRestrictionsCount: number;
  latestEventTimestamp: string | null;
  hourlyTrend: any[];
  isEngineHealthy: boolean;
}

export const SecurityOverviewTab: React.FC<{ onOpenHealthModal: () => void }> = ({ onOpenHealthModal }) => {
  const { socket } = useOutletContext<{ socket: Socket | null; socketConnected: boolean }>() || {};
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [recentIncidents, setRecentIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchOverviewData = async () => {
    try {
      setRefreshing(true);
      const res = await agentshieldService.getOverview();
      if (res.success) {
        setMetrics(res.data);
      }

      const incidentsRes = await agentshieldService.getIncidents({ limit: 6 });
      if (incidentsRes.success) {
        setRecentIncidents(incidentsRes.data);
      }
    } catch (err) {
      console.error('Failed to load overview data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
    // Bounded periodic refresh every 10 seconds
    const interval = setInterval(fetchOverviewData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Instant refresh when live threat event or incident is received over WebSocket
  useEffect(() => {
    if (!socket) return;
    const handleLivePulse = () => {
      fetchOverviewData();
    };
    socket.on('agentshield:event', handleLivePulse);
    socket.on('agentshield:incident', handleLivePulse);
    return () => {
      socket.off('agentshield:event', handleLivePulse);
      socket.off('agentshield:incident', handleLivePulse);
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="py-28 flex flex-col items-center justify-center space-y-4">
        <div className="size-12 rounded-full border-3 border-violet-500/20 border-t-violet-600 animate-spin" />
        <p className="text-sm font-bold tracking-wider text-neutral-500 uppercase">Loading Security Metrics...</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Open Incidents',
      value: metrics?.openIncidents ?? 0,
      description: 'Active investigations in queue',
      borderClass: 'border-l-blue-500',
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
      icon: AlertTriangle,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&status=ALL'),
    },
    {
      title: 'Critical Severity',
      value: metrics?.criticalIncidents ?? 0,
      description: 'Immediate action required',
      borderClass: 'border-l-rose-500',
      iconBg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
      icon: Flame,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=CRITICAL'),
    },
    {
      title: 'High Severity',
      value: metrics?.highIncidents ?? 0,
      description: 'Suspicious elevated risk',
      borderClass: 'border-l-amber-500',
      iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
      icon: ShieldAlert,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=HIGH'),
    },
    {
      title: 'Security Events — Last 24 Hours',
      value: metrics?.recentEventsCount ?? 0,
      description: 'Observable threat signals',
      borderClass: 'border-l-violet-500',
      iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
      icon: Activity,
      onClick: () => navigate('/cyberadmin/agentshield?tab=live'),
    },
    {
      title: 'Enforced Blocks / Throttles',
      value: metrics?.blockedRequestsCount ?? 0,
      description: `${metrics?.activeRestrictionsCount || 0} active IP cooldown(s)`,
      borderClass: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      icon: Ban,
      onClick: () => navigate('/cyberadmin/agentshield?tab=blocked'),
    },
  ];

  const isHealthy = metrics?.isEngineHealthy ?? true;

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight">
              Security Overview
            </h1>
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold uppercase border ${
                isHealthy
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
              }`}
              title={isHealthy ? 'Monitoring engine is healthy and actively evaluating request signals' : 'Engine reports degraded health status'}
            >
              <span className={`size-2 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isHealthy ? 'Engine Healthy' : 'Degraded'}</span>
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 font-medium">
            Monitor ERP security events, investigate incidents, and review protection activity.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenHealthModal}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition shadow-xs cursor-pointer"
          >
            <Server className="size-4 text-violet-600 dark:text-violet-400" />
            <span>Engine Diagnostics</span>
          </button>

          <button
            onClick={fetchOverviewData}
            disabled={refreshing}
            className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh Metrics"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-violet-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards (Larger, Prominent, 1 Row on Desktop) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 sm:gap-6">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className={`group bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-sm hover:shadow-md border border-neutral-200/80 dark:border-neutral-800 ${card.borderClass} border-l-4 hover:-translate-y-1 transition-all duration-200 cursor-pointer flex flex-col justify-between h-full min-h-[145px]`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-neutral-600 dark:text-neutral-400 tracking-wider uppercase">
                  {card.title}
                </span>
                <div className={`size-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${card.iconBg}`}>
                  <Icon className="size-5" />
                </div>
              </div>

              <div className="my-3">
                <div className="text-3xl sm:text-4xl font-extrabold text-neutral-900 dark:text-white tracking-tight leading-none">
                  {card.value}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm font-medium text-neutral-500 dark:text-neutral-400 pt-1">
                <span>{card.description}</span>
                <ArrowUpRight className="size-4 text-neutral-400 group-hover:text-violet-600 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main Dashboard Layout: Two-Column (67% / 33%) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* Left Section: Active Incident Queue (~67% width) */}
        <div className="lg:col-span-8 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white">
                    Active Incident Queue
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Recent uncontained security investigations requiring CyberAdmin triage.
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate('/cyberadmin/agentshield?tab=incidents')}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:hover:bg-violet-900/60 dark:text-violet-300 transition-all cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight className="size-4" />
              </button>
            </div>

            {recentIncidents.length === 0 ? (
              <div className="py-16 text-center text-neutral-400 space-y-2.5">
                <CheckCircle2 className="size-10 mx-auto text-emerald-500/70" />
                <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Zero Active Security Incidents</p>
                <p className="text-xs text-neutral-500">All institutional ERP telemetry signals are nominal.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => navigate(`/cyberadmin/agentshield?tab=incidents&id=${inc.id}`)}
                    className="py-4 hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 px-3.5 rounded-xl transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs sm:text-sm font-bold text-violet-700 dark:text-violet-400">
                          {inc.incidentNumber}
                        </span>
                        <span
                          className={`text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                            inc.severity === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                              : inc.severity === 'HIGH'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate group-hover:text-violet-600 transition-colors">
                          {inc.title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 font-medium pt-0.5">
                        <span>
                          Source: <span className="font-mono font-bold text-neutral-900 dark:text-white">{inc.sourceIdentifier}</span>
                        </span>
                        <span>•</span>
                        <span className="truncate max-w-sm" title={inc.targetResource}>
                          Target: <span className="font-mono text-violet-700 dark:text-violet-400 font-semibold">{inc.targetResource}</span>
                        </span>
                        <span>•</span>
                        <span>
                          Signals: <span className="font-bold text-neutral-800 dark:text-neutral-200">{inc.eventCount}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100 dark:border-neutral-800">
                      <span
                        className={`text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                          inc.status === 'NEW'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300'
                            : inc.status === 'INVESTIGATING'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300'
                        }`}
                      >
                        {inc.status}
                      </span>
                      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1 font-medium">
                        {new Date(inc.lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-3.5 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>Incidents correlated by AgentShield Rule Engine</span>
            <span>Last event: {metrics?.latestEventTimestamp ? new Date(metrics.latestEventTimestamp).toLocaleTimeString() : 'N/A'}</span>
          </div>
        </div>

        {/* Right Section: Protection Status (~33% width) */}
        <div className="lg:col-span-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-100 dark:border-neutral-800">
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
              <Zap className="size-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-neutral-900 dark:text-white">
                Protection Status
              </h2>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                Active defense controls and integrations.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Protection Card 1: Decoy Canary Honeypots */}
            <div className="p-4 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-900 dark:text-white text-sm sm:text-base">Decoy Canary Honeypots</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-extrabold text-xs bg-emerald-100/70 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  ARMED & ACTIVE
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
                5 non-destructive endpoints active across administrative and database routes.
              </p>
              <div className="pt-1">
                <button
                  onClick={() => navigate('/cyberadmin/agentshield?tab=rules')}
                  className="text-xs font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 flex items-center space-x-1 cursor-pointer"
                >
                  <span>Manage Honeypot Rules</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Protection Card 2: Rate Limiting & Cooldown */}
            <div className="p-4 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-900 dark:text-white text-sm sm:text-base">Rate Limiting & Cooldown</span>
                <span className="text-purple-700 dark:text-purple-300 font-extrabold text-xs bg-purple-100/70 dark:bg-purple-950/60 px-2.5 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                  {metrics?.activeRestrictionsCount || 0} ACTIVE
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
                Reversible sliding cooldowns enforced per client IP to isolate abusive scanning without campus lockouts.
              </p>
              <div className="pt-1">
                <button
                  onClick={() => navigate('/cyberadmin/agentshield?tab=blocked')}
                  className="text-xs font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 flex items-center space-x-1 cursor-pointer"
                >
                  <span>View Cooldown List</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Protection Card 3: OWASP ZAP Integration */}
            <div className="p-4 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-900 dark:text-white text-sm sm:text-base">OWASP ZAP Integration</span>
                <span className="text-blue-700 dark:text-blue-300 font-extrabold text-xs bg-blue-100/70 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  REPORT READY
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
                Import and review dynamic vulnerability scan findings with remediation lifecycle tracking.
              </p>
              <div className="pt-1">
                <button
                  onClick={() => navigate('/cyberadmin/agentshield?tab=zap')}
                  className="text-xs font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 flex items-center space-x-1 cursor-pointer"
                >
                  <span>Open ZAP Assessments</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => navigate('/cyberadmin/agentshield?tab=rules')}
              className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
            >
              <span>Manage Detection Rules</span>
              <ArrowUpRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityOverviewTab;

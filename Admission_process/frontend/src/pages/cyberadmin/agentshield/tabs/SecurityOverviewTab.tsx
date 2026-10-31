import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../store';
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
  Sparkles,
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
  const { user } = useSelector((state: RootState) => state.auth);
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

  const cleanIncidentTitle = (title: string) => {
    return title.replace(/^CRITICAL\s+/i, '').replace(/\s*\(\/.*?\)$/, '');
  };

  const statCards = [
    {
      title: 'Open Incidents',
      value: metrics?.openIncidents ?? 0,
      description: 'Active investigations in queue',
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/40',
      icon: AlertTriangle,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&status=ALL'),
    },
    {
      title: 'Critical Severity',
      value: metrics?.criticalIncidents ?? 0,
      description: 'Immediate action required',
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/40',
      icon: Flame,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=CRITICAL'),
    },
    {
      title: 'High Severity',
      value: metrics?.highIncidents ?? 0,
      description: 'Suspicious elevated risk',
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/40',
      icon: ShieldAlert,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=HIGH'),
    },
    {
      title: 'Security Events — 24H',
      value: metrics?.recentEventsCount ?? 0,
      description: 'Observable threat signals',
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-950/40',
      icon: Activity,
      onClick: () => navigate('/cyberadmin/agentshield?tab=live'),
    },
    {
      title: 'Enforced Blocks / Throttles',
      value: metrics?.blockedRequestsCount ?? 0,
      description: `${metrics?.activeRestrictionsCount || 0} active cooldown(s)`,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      icon: Ban,
      onClick: () => navigate('/cyberadmin/agentshield?tab=blocked'),
    },
  ];

  const isHealthy = metrics?.isEngineHealthy ?? true;

  return (
    <div className="space-y-6">
      {/* ── Top Action Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-xs font-bold text-slate-700 dark:text-neutral-300 shadow-2xs">
            <span className={`size-2 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{isHealthy ? 'Autonomous Defense Engine Healthy' : 'Telemetry Degraded'}</span>
          </span>
          <span className="text-xs text-slate-400 font-medium hidden md:inline">
            Active real-time telemetry and automated mitigation
          </span>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={fetchOverviewData}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-200 font-bold text-xs transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#6D35E8]' : ''}`} />
            <span>Refresh Telemetry</span>
          </button>
          <button
            onClick={onOpenHealthModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#6D35E8] hover:bg-[#5b2cc2] text-white font-bold text-xs shadow-xs transition cursor-pointer"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Engine Diagnostics</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards (Clean, Compact, 1 Aligned Row on Desktop) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className="bg-white dark:bg-neutral-900 rounded-xl p-4 border border-slate-200 dark:border-neutral-800 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase truncate pr-1">
                  {card.title}
                </span>
                <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                  <Icon className={`size-4 ${card.iconColor}`} />
                </div>
              </div>

              <div className="my-2.5">
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                  {card.value}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 dark:text-neutral-500 pt-0.5">
                <span className="truncate">{card.description}</span>
                <ArrowUpRight className="size-3.5 text-slate-300 dark:text-neutral-600 group-hover:text-[#6D35E8] shrink-0 ml-1 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main Dashboard Layout: Two-Column (67% / 33%) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Left Section: Active Incident Queue (~67% width) */}
        <div className="lg:col-span-8 bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-neutral-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="size-4.5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Active Incident Queue
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recent uncontained security investigations requiring CyberAdmin triage.
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate('/cyberadmin/agentshield?tab=incidents')}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-[#6D35E8] dark:bg-purple-950/40 dark:hover:bg-purple-900/60 dark:text-purple-300 transition-all cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            {recentIncidents.length === 0 ? (
              <div className="py-14 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="size-9 mx-auto text-emerald-500/80" />
                <p className="text-sm font-bold text-slate-800 dark:text-neutral-200">Zero Active Security Incidents</p>
                <p className="text-xs text-slate-500">All institutional ERP telemetry signals are nominal.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-neutral-800/80">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => navigate(`/cyberadmin/agentshield?tab=incidents&id=${inc.id}`)}
                    className="py-3 px-2 hover:bg-slate-50/80 dark:hover:bg-neutral-800/40 rounded-xl transition-all cursor-pointer flex flex-col gap-1.5 group"
                  >
                    {/* First Line: Incident ID, Severity Badge, Clean Incident Title, Status Badge, Time */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        <span className="font-mono text-xs font-bold text-[#6D35E8] dark:text-purple-400 shrink-0">
                          {inc.incidentNumber}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                            inc.severity === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                              : inc.severity === 'HIGH'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-neutral-800 dark:text-slate-300'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-[#6D35E8] transition-colors">
                          {cleanIncidentTitle(inc.title)}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                            inc.status === 'NEW'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30'
                              : inc.status === 'INVESTIGATING'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30'
                          }`}
                        >
                          {inc.status}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-neutral-500 hidden sm:inline">
                          {new Date(inc.lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Second Line: Source IP | Target Endpoint | Signals | Time */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <span>
                        Source: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{inc.sourceIdentifier}</span>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="truncate max-w-[200px] sm:max-w-xs md:max-w-sm" title={inc.targetResource}>
                        Target: <span className="font-mono text-slate-700 dark:text-slate-300">{inc.targetResource}</span>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span>
                        Signals: <span className="font-semibold text-slate-800 dark:text-slate-200">{inc.eventCount}</span>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700 sm:hidden">|</span>
                      <span className="text-slate-400 text-[11px] sm:hidden">
                        {new Date(inc.lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800 text-[11px] text-slate-400 font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>Incidents correlated by AgentShield Rule Engine</span>
            <span>Last event: {metrics?.latestEventTimestamp ? new Date(metrics.latestEventTimestamp).toLocaleTimeString() : 'N/A'}</span>
          </div>
        </div>

        {/* Right Section: Protection Status (~33% width) */}
        <div className="lg:col-span-4 bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100 dark:border-neutral-800">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-[#6D35E8] dark:text-purple-400">
              <Zap className="size-4.5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Protection Status
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active defense controls and integrations.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Protection Card 1: Decoy Canary Honeypots */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Decoy Canary Honeypots</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-bold text-[10px] bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  ARMED & ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                5 non-destructive endpoints active across administrative and database routes.
              </p>
              <div className="pt-0.5">
                <button
                  onClick={() => navigate('/cyberadmin/agentshield?tab=rules')}
                  className="text-xs font-bold text-[#6D35E8] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <span>Manage Honeypot Rules</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Protection Card 2: Rate Limiting & Cooldown */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">Rate Limiting & Cooldown</span>
                <span className="text-purple-700 dark:text-purple-300 font-bold text-[10px] bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                  {metrics?.activeRestrictionsCount || 0} ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Reversible sliding cooldowns enforced per client IP to isolate abusive scanning without campus lockouts.
              </p>
              <div className="pt-0.5">
                <button
                  onClick={() => navigate('/cyberadmin/agentshield?tab=blocked')}
                  className="text-xs font-bold text-[#6D35E8] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <span>View Cooldown List</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Protection Card 3: OWASP ZAP Integration */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">OWASP ZAP Integration</span>
                <span className="text-blue-700 dark:text-blue-300 font-bold text-[10px] bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  REPORT READY
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Import and review dynamic vulnerability scan findings with remediation lifecycle tracking.
              </p>
              <div className="pt-0.5">
                <button
                  onClick={() => navigate('/cyberadmin/agentshield?tab=zap')}
                  className="text-xs font-bold text-[#6D35E8] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <span>Open ZAP Assessments</span>
                  <ArrowUpRight className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <button
              onClick={() => navigate('/cyberadmin/agentshield?tab=rules')}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-[#6D35E8] hover:bg-[#5b2cc2] text-white transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
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

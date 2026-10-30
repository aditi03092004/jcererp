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

      const incidentsRes = await agentshieldService.getIncidents({ limit: 5 });
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
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <div className="size-10 rounded-full border-2 border-violet-500/20 border-t-violet-600 animate-spin" />
        <p className="text-xs font-bold tracking-wider text-neutral-400 uppercase">Loading Security Metrics...</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Open Incidents',
      value: metrics?.openIncidents ?? 0,
      subtext: 'Active investigations in queue',
      borderClass: 'border-l-blue-500',
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
      icon: AlertTriangle,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&status=OPEN'),
    },
    {
      title: 'Critical Severity',
      value: metrics?.criticalIncidents ?? 0,
      subtext: 'Immediate action required',
      borderClass: 'border-l-rose-500',
      iconBg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
      icon: Flame,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=CRITICAL'),
    },
    {
      title: 'High Severity',
      value: metrics?.highIncidents ?? 0,
      subtext: 'Suspicious elevated risk',
      borderClass: 'border-l-amber-500',
      iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
      icon: ShieldAlert,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=HIGH'),
    },
    {
      title: 'Security Events — Last 24 Hours',
      value: metrics?.recentEventsCount ?? 0,
      subtext: 'Observable threat signals',
      borderClass: 'border-l-violet-500',
      iconBg: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
      icon: Activity,
      onClick: () => navigate('/cyberadmin/agentshield?tab=live'),
    },
    {
      title: 'Enforced Blocks / Throttles',
      value: metrics?.blockedRequestsCount ?? 0,
      subtext: `${metrics?.activeRestrictionsCount || 0} active IP cooldown(s)`,
      borderClass: 'border-l-emerald-500',
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
      icon: Ban,
      onClick: () => navigate('/cyberadmin/agentshield?tab=blocked'),
    },
  ];

  const isHealthy = metrics?.isEngineHealthy ?? true;

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
              Security Overview
            </h1>
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                isHealthy
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
              }`}
              title={isHealthy ? 'Monitoring engine is healthy and actively evaluating request signals' : 'Engine reports degraded health status'}
            >
              <span className={`size-1.5 rounded-full ${isHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isHealthy ? 'Engine Healthy' : 'Degraded'}</span>
            </div>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Monitor ERP security events, investigate incidents, and review protection activity.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenHealthModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition shadow-sm cursor-pointer"
          >
            <Server className="size-3.5 text-violet-600 dark:text-violet-400" />
            <span>Engine Diagnostics</span>
          </button>

          <button
            onClick={fetchOverviewData}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Refresh Metrics"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-violet-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Interactive Summary Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className={`bg-white dark:bg-neutral-900 rounded-2xl p-4 sm:p-5 shadow-sm border border-neutral-200/80 dark:border-neutral-800 ${card.borderClass} border-l-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 tracking-wide uppercase">
                  {card.title}
                </span>
                <div className={`size-8 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                  <Icon className="size-4" />
                </div>
              </div>
              <div className="my-2.5">
                <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight">
                  {card.value}
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500 font-medium">
                <span>{card.subtext}</span>
                <ArrowUpRight className="size-3.5 text-neutral-400" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Two Column Layout: Active Incidents & Protection Status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Incidents Queue */}
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                  Active Incident Queue
                </h3>
              </div>
              <button
                onClick={() => navigate('/cyberadmin/agentshield?tab=incidents')}
                className="text-xs font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 flex items-center space-x-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowUpRight className="size-3" />
              </button>
            </div>

            {recentIncidents.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 space-y-2">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500/70" />
                <p className="text-xs font-bold text-neutral-700 dark:text-neutral-300">Zero Active Security Incidents</p>
                <p className="text-[11px] text-neutral-500">All institutional ERP telemetry is nominal.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => navigate(`/cyberadmin/agentshield?tab=incidents&id=${inc.id}`)}
                    className="py-3 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/40 px-2.5 rounded-xl transition cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0 pr-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-violet-600 dark:text-violet-400">{inc.incidentNumber}</span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            inc.severity === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                              : inc.severity === 'HIGH'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate">{inc.title}</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                        Source: {inc.sourceIdentifier} • Target: {inc.targetResource} • Events: {inc.eventCount}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          inc.status === 'NEW'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300'
                            : inc.status === 'INVESTIGATING'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300'
                        }`}
                      >
                        {inc.status}
                      </span>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium">
                        {new Date(inc.lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center justify-between">
            <span>Incidents correlated by AgentShield Rule Engine</span>
            <span>Last event: {metrics?.latestEventTimestamp ? new Date(metrics.latestEventTimestamp).toLocaleTimeString() : 'N/A'}</span>
          </div>
        </div>

        {/* Right: Protection Status, Honeypots & Rate Limiting */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-neutral-100 dark:border-neutral-800">
            <Zap className="size-4 text-violet-600 dark:text-violet-400" />
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white uppercase tracking-wider">Protection Status</h3>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 dark:text-neutral-200">Decoy Canary Honeypots</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-extrabold text-[10px] bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  ARMED & ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                5 non-destructive endpoints active across administrative and database routes.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 dark:text-neutral-200">Rate Limiting & Cooldown</span>
                <span className="text-violet-700 dark:text-violet-300 font-extrabold text-[10px] bg-violet-100/70 dark:bg-violet-950/60 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                  {metrics?.activeRestrictionsCount || 0} ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Reversible sliding cooldowns enforced per client IP to isolate abusive scanning without campus lockouts.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/60 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 dark:text-neutral-200">OWASP ZAP Integration</span>
                <span className="text-blue-700 dark:text-blue-300 font-extrabold text-[10px] bg-blue-100/70 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                  REPORT READY
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Import and review dynamic vulnerability scan findings with remediation lifecycle tracking.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => navigate('/cyberadmin/agentshield?tab=rules')}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition flex items-center justify-center space-x-1.5 shadow-sm shadow-violet-500/20 cursor-pointer"
            >
              <span>Manage Detection Rules</span>
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityOverviewTab;


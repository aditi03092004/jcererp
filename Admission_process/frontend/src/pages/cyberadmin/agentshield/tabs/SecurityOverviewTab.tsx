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
        <div className="size-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
        <p className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Loading AgentShield Metrics...</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Open Incidents',
      value: metrics?.openIncidents ?? 0,
      subtext: 'Active investigations in queue',
      color: 'border-blue-500/30 bg-blue-950/20 text-blue-400',
      icon: AlertTriangle,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents'),
    },
    {
      title: 'Critical Severity',
      value: metrics?.criticalIncidents ?? 0,
      subtext: 'Immediate action required',
      color: 'border-rose-500/30 bg-rose-950/20 text-rose-400',
      icon: Flame,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=CRITICAL'),
    },
    {
      title: 'High Severity',
      value: metrics?.highIncidents ?? 0,
      subtext: 'Suspicious elevated risk',
      color: 'border-amber-500/30 bg-amber-950/20 text-amber-400',
      icon: ShieldAlert,
      onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=HIGH'),
    },
    {
      title: '24h Security Events',
      value: metrics?.recentEventsCount ?? 0,
      subtext: 'Observable telemetry signals',
      color: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400',
      icon: Activity,
      onClick: () => navigate('/cyberadmin/agentshield?tab=live'),
    },
    {
      title: 'Enforced Blocks / Throttles',
      value: metrics?.blockedRequestsCount ?? 0,
      subtext: `${metrics?.activeRestrictionsCount || 0} active IP cooldown(s)`,
      color: 'border-purple-500/30 bg-purple-950/20 text-purple-400',
      icon: Ban,
      onClick: () => navigate('/cyberadmin/agentshield?tab=blocked'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Top Control Strip ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>Cybersecurity Command Center</span>
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time telemetry, threat detection, and automated defensive mitigation for JCER ERP.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenHealthModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            <Server className="size-3.5 text-emerald-400" />
            <span>Engine Diagnostics</span>
          </button>

          <button
            onClick={fetchOverviewData}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
            title="Refresh Metrics"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Metric Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className={`p-4 rounded-xl border backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] cursor-pointer shadow-lg flex flex-col justify-between ${card.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 tracking-wide uppercase">{card.title}</span>
                <Icon className="size-4 opacity-80" />
              </div>
              <div className="my-3">
                <div className="text-3xl font-black text-white tracking-tight">{card.value}</div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{card.subtext}</span>
                <ArrowUpRight className="size-3.5 opacity-60" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Two Column Layout: Active Incidents & Rapid Mitigation ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Incidents Queue */}
        <div className="lg:col-span-2 bg-slate-900/60 rounded-xl border border-slate-800 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="size-4 text-amber-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Active Incident Queue</h3>
              </div>
              <button
                onClick={() => navigate('/cyberadmin/agentshield?tab=incidents')}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 cursor-pointer"
              >
                <span>View All</span>
                <ArrowUpRight className="size-3" />
              </button>
            </div>

            {recentIncidents.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500/60" />
                <p className="text-xs font-bold text-slate-400">Zero Active Security Incidents</p>
                <p className="text-[11px] text-slate-500">All institutional telemetry is nominal.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {recentIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => navigate(`/cyberadmin/agentshield?tab=incidents&id=${inc.id}`)}
                    className="py-3 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-lg transition cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-emerald-400">{inc.incidentNumber}</span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            inc.severity === 'CRITICAL'
                              ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                              : inc.severity === 'HIGH'
                              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                              : 'bg-blue-950/60 border-blue-500/40 text-blue-300'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span className="text-[11px] font-bold text-slate-300">{inc.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Source: {inc.sourceIdentifier} • Target: {inc.targetResource} • Events: {inc.eventCount}
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                          inc.status === 'NEW'
                            ? 'bg-rose-500/20 text-rose-300'
                            : inc.status === 'INVESTIGATING'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {inc.status}
                      </span>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {new Date(inc.lastObservedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Incidents correlated by AgentShield Rule Engine</span>
            <span>Last event: {metrics?.latestEventTimestamp ? new Date(metrics.latestEventTimestamp).toLocaleTimeString() : 'N/A'}</span>
          </div>
        </div>

        {/* Right: Rapid Defensive Status & Honeypot Summary */}
        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5 shadow-xl space-y-4">
          <div className="flex items-center space-x-2">
            <Zap className="size-4 text-cyan-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Autonomous Defenses</h3>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Decoy Canary Honeypots</span>
                <span className="text-emerald-400 font-bold text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  ARMED & ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                5 non-destructive endpoints active across administrative and database routes.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">Rate Limiting & Throttle Cooldown</span>
                <span className="text-purple-400 font-bold text-[11px] bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                  {metrics?.activeRestrictionsCount || 0} ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Reversible sliding cooldowns enforced per client IP to isolate abusive scanning without campus lockouts.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">OWASP ZAP Integration</span>
                <span className="text-cyan-400 font-bold text-[11px] bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  REPORT READY
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Import and review dynamic vulnerability scan findings with remediation lifecycle tracking.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => navigate('/cyberadmin/agentshield?tab=rules')}
              className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <span>Manage Detection Rules</span>
              <ArrowUpRight className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityOverviewTab;


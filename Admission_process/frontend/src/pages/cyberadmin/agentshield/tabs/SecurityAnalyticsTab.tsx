import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Ban,
  CheckCircle2,
  RefreshCw,
  Calendar,
  Layers,
  ShieldCheck,
  TrendingUp,
  PieChart as PieIcon,
  BarChart2,
  Target,
  Globe,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import agentshieldService, { SecurityAnalyticsData } from '../../../../services/agentshield.service';

export const SecurityAnalyticsTab: React.FC = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [data, setData] = useState<SecurityAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (range = timeRange) => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await agentshieldService.getAnalytics({ timeRange: range });
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError('Failed to fetch analytics dataset.');
      }
    } catch (err: any) {
      console.error('Failed to load security analytics:', err);
      setError(err?.response?.data?.error || 'Failed to connect to AgentShield Analytics API.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchAnalytics(timeRange);
  }, [timeRange]);

  const handleRangeChange = (newRange: '24h' | '7d' | '30d') => {
    if (newRange !== timeRange) {
      setTimeRange(newRange);
    }
  };

  // Severity color mapping
  const severityColors: Record<string, string> = {
    CRITICAL: '#DC2626',
    HIGH: '#EA580C',
    MEDIUM: '#D97706',
    LOW: '#64748B',
  };

  const getSeverityBadge = (sev: string) => {
    const s = sev?.toUpperCase();
    if (s === 'CRITICAL') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300';
    if (s === 'HIGH') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300';
    if (s === 'MEDIUM') return 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-neutral-800 dark:text-slate-300';
  };

  const summary = data?.summary;
  const totalEvents = summary?.totalEvents ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Top Filters Toolbar ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 mr-2 text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <Calendar className="size-4 text-[#6D35E8]" />
            <span>Time Horizon:</span>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700">
            {(
              [
                { id: '24h', label: 'Last 24 Hours' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleRangeChange(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  timeRange === opt.id
                    ? 'bg-[#6D35E8] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          {data?.startDate && (
            <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
              {new Date(data.startDate).toLocaleDateString()} – {new Date(data.endDate).toLocaleDateString()}
            </span>
          )}

          <button
            onClick={() => fetchAnalytics(timeRange)}
            disabled={refreshing}
            className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-neutral-700 transition shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[#6D35E8]' : ''}`} />
            <span>Refresh Analytics</span>
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs sm:text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="size-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchAnalytics(timeRange)}
            className="text-xs font-bold underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── A. Analytics Summary Cards (6 Aligned Cards) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          {
            title: 'Total Events',
            value: summary?.totalEvents ?? 0,
            desc: 'Telemetry signals',
            icon: Activity,
            iconColor: 'text-[#6D35E8]',
            iconBg: 'bg-purple-50 dark:bg-purple-950/40',
            onClick: () => navigate('/cyberadmin/agentshield?tab=live'),
          },
          {
            title: 'Critical Threats',
            value: summary?.criticalThreats ?? 0,
            desc: 'Urgent containment',
            icon: Flame,
            iconColor: 'text-rose-600',
            iconBg: 'bg-rose-50 dark:bg-rose-950/40',
            onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=CRITICAL'),
          },
          {
            title: 'High-Risk Threats',
            value: summary?.highThreats ?? 0,
            desc: 'Elevated anomalies',
            icon: ShieldAlert,
            iconColor: 'text-amber-600',
            iconBg: 'bg-amber-50 dark:bg-amber-950/40',
            onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&severity=HIGH'),
          },
          {
            title: 'Blocked Requests',
            value: summary?.blockedRequests ?? 0,
            desc: 'Throttled / isolated',
            icon: Ban,
            iconColor: 'text-rose-600',
            iconBg: 'bg-rose-50 dark:bg-rose-950/40',
            onClick: () => navigate('/cyberadmin/agentshield?tab=blocked'),
          },
          {
            title: 'Open Incidents',
            value: summary?.openIncidents ?? 0,
            desc: 'Under active triage',
            icon: AlertTriangle,
            iconColor: 'text-blue-600',
            iconBg: 'bg-blue-50 dark:bg-blue-950/40',
            onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&status=ALL'),
          },
          {
            title: 'Resolved Incidents',
            value: summary?.resolvedIncidents ?? 0,
            desc: 'Closed with evidence',
            icon: CheckCircle2,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
            onClick: () => navigate('/cyberadmin/agentshield?tab=incidents&status=RESOLVED'),
          },
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              onClick={item.onClick}
              className="bg-white dark:bg-neutral-900 rounded-xl p-3.5 sm:p-4 border border-slate-200 dark:border-neutral-800 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase truncate pr-1">
                  {item.title}
                </span>
                <div className={`size-6 rounded-md flex items-center justify-center shrink-0 ${item.iconBg}`}>
                  <Icon className={`size-3.5 ${item.iconColor}`} />
                </div>
              </div>

              <div className="my-2">
                <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                  {loading ? '...' : item.value}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-medium text-slate-400 dark:text-neutral-500 pt-0.5">
                <span className="truncate">{item.desc}</span>
                <ArrowUpRight className="size-3 text-slate-300 dark:text-neutral-600 group-hover:text-[#6D35E8] shrink-0 ml-1 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── B. Security Events Over Time (Line / Area Chart) ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100 dark:border-neutral-800">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <TrendingUp className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Security Events Over Time
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated threat detections and telemetry trends for {timeRange === '24h' ? 'the last 24 hours' : timeRange === '7d' ? 'the past 7 days' : 'the past 30 days'}.
            </p>
          </div>

          <div className="flex items-center space-x-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <div className="flex items-center space-x-1.5">
              <span className="size-2 rounded-full bg-[#6D35E8]" />
              <span>Total Events</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="size-2 rounded-full bg-rose-500" />
              <span>Critical</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>High</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="size-8 rounded-full border-2 border-purple-500/20 border-t-[#6D35E8] animate-spin" />
          </div>
        ) : !data?.eventsOverTime || data.eventsOverTime.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
            <ShieldCheck className="size-8 text-emerald-500/70 mb-2" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No Security Events in this Horizon</p>
            <p>System traffic during this period has been nominal.</p>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.eventsOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="eventGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6D35E8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6D35E8" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="criticalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" strokeOpacity={0.6} />
                <XAxis
                  dataKey="label"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      return (
                        <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-3 rounded-xl shadow-lg text-xs space-y-1">
                          <p className="font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-1">
                            {label} ({item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''})
                          </p>
                          <div className="space-y-1 pt-1">
                            <p className="flex justify-between gap-4 text-purple-700 dark:text-purple-300 font-semibold">
                              <span>Total Events:</span>
                              <span>{item.events}</span>
                            </p>
                            <p className="flex justify-between gap-4 text-rose-600 font-semibold">
                              <span>Critical:</span>
                              <span>{item.critical}</span>
                            </p>
                            <p className="flex justify-between gap-4 text-amber-600 font-semibold">
                              <span>High:</span>
                              <span>{item.high}</span>
                            </p>
                            <p className="flex justify-between gap-4 text-slate-500">
                              <span>Medium / Low:</span>
                              <span>{item.medium + item.low}</span>
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="events"
                  name="Total Events"
                  stroke="#6D35E8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#eventGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="critical"
                  name="Critical"
                  stroke="#DC2626"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#criticalGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── C & F. Donut Charts Row: Threat Severity & Incident Status Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* C. Threat Severity Distribution */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
            <div className="flex items-center space-x-2">
              <PieIcon className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Threat Severity Distribution
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-400 font-mono">
              {totalEvents} total signals
            </span>
          </div>

          <div className="py-4 flex flex-col sm:flex-row items-center justify-around gap-6">
            <div className="relative size-48 flex items-center justify-center shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.severityDistribution || []}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(data?.severityDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        const pct = totalEvents > 0 ? ((d.value / totalEvents) * 100).toFixed(1) : '0';
                        return (
                          <div className="bg-white dark:bg-neutral-900 border border-slate-200 p-2 rounded-lg shadow text-xs">
                            <span className="font-bold text-slate-900">{d.name}: </span>
                            <span>{d.value} ({pct}%)</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Total Events in Center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                  {totalEvents}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">Events</span>
              </div>
            </div>

            {/* Severity Legend */}
            <div className="space-y-2.5 w-full max-w-xs">
              {(data?.severityDistribution || []).map((item) => {
                const pct = totalEvents > 0 ? ((item.value / totalEvents) * 100).toFixed(1) : '0';
                return (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
                      <span className="text-slate-400 font-mono text-[11px] w-12 text-right">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* F. Incident Status Distribution */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
            <div className="flex items-center space-x-2">
              <Layers className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Incident Lifecycle Breakdown
              </h2>
            </div>
            <button
              onClick={() => navigate('/cyberadmin/agentshield?tab=incidents')}
              className="text-xs font-bold text-[#6D35E8] hover:underline flex items-center space-x-1 cursor-pointer"
            >
              <span>View Ledger</span>
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>

          <div className="py-4 flex flex-col sm:flex-row items-center justify-around gap-6">
            <div className="relative size-48 flex items-center justify-center shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.incidentStatusDistribution || []}
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(data?.incidentStatusDistribution || []).map((entry, index) => (
                      <Cell key={`cell-inc-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-neutral-900 border border-slate-200 p-2 rounded-lg shadow text-xs">
                            <span className="font-bold text-slate-900">{d.name}: </span>
                            <span>{d.value}</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Total Incidents in Center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                  {(data?.incidentStatusDistribution || []).reduce((acc, curr) => acc + curr.value, 0)}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 mt-1">Incidents</span>
              </div>
            </div>

            {/* Status Legend */}
            <div className="space-y-2.5 w-full max-w-xs">
              {(data?.incidentStatusDistribution || []).map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── D & E. Bar Charts Row: Category Distribution & Security Responses ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* D. Threat Category Distribution */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800 mb-4">
            <div className="flex items-center space-x-2">
              <BarChart2 className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Threat Category Distribution
              </h2>
            </div>
            <span className="text-xs text-slate-400">Database Detection Rules</span>
          </div>

          {!data?.categoryDistribution || data.categoryDistribution.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400">
              No category signals detected in this period.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.categoryDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" strokeOpacity={0.6} />
                  <XAxis type="number" stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} width={130} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-neutral-900 border border-slate-200 p-2 rounded-lg shadow text-xs">
                            <p className="font-bold text-slate-900">{d.name}</p>
                            <p className="text-[#6D35E8] font-semibold">{d.count} occurrences</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" fill="#6D35E8" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* E. Security Response Analytics */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800 mb-4">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Automated Defensive Actions
              </h2>
            </div>
            <span className="text-xs text-slate-400">Enforced Policies</span>
          </div>

          {!data?.securityResponseAnalytics || data.securityResponseAnalytics.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-slate-400">
              No defensive responses executed in this period.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.securityResponseAnalytics} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" strokeOpacity={0.6} />
                  <XAxis type="number" stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={11} width={140} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-neutral-900 border border-slate-200 p-2 rounded-lg shadow text-xs">
                            <p className="font-bold text-slate-900">{d.label}</p>
                            <p className="text-slate-700 font-semibold">{d.count} requests</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                    {(data.securityResponseAnalytics || []).map((entry, index) => (
                      <Cell key={`resp-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── G & H. Data Tables Row: Top Targeted Endpoints & Top Threat Sources ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* G. Top Targeted Endpoints */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800 mb-3">
            <div className="flex items-center space-x-2">
              <Target className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Top Targeted Endpoints
              </h2>
            </div>
            <span className="text-xs text-slate-400">By Event Frequency</span>
          </div>

          {!data?.topEndpoints || data.topEndpoints.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No endpoint violation targets recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-neutral-800 text-slate-400 uppercase text-[10px] font-bold">
                    <th className="py-2.5 px-3">Target Endpoint</th>
                    <th className="py-2.5 px-2 text-center">Events</th>
                    <th className="py-2.5 px-2 text-center">Max Severity</th>
                    <th className="py-2.5 px-3 text-right">Last Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/60 font-sans">
                  {data.topEndpoints.map((ep, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40 transition">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs" title={ep.endpoint}>
                        {ep.endpoint}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-900 dark:text-white">
                        {ep.eventCount}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadge(ep.highestSeverity)}`}>
                          {ep.highestSeverity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-400">
                        {new Date(ep.lastOccurrence).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* H. Top Detection Sources */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800 mb-3">
            <div className="flex items-center space-x-2">
              <Globe className="size-4.5 text-[#6D35E8]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Top Threat Sources
              </h2>
            </div>
            <span className="text-xs text-slate-400">Source Identifier / IP</span>
          </div>

          {!data?.topSources || data.topSources.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No threat sources identified in this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-neutral-800 text-slate-400 uppercase text-[10px] font-bold">
                    <th className="py-2.5 px-3">Client Identifier</th>
                    <th className="py-2.5 px-2 text-center">Total Signals</th>
                    <th className="py-2.5 px-2 text-center">Severity</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-neutral-800/60 font-sans">
                  {data.topSources.map((src, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {src.sourceIdentifier}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-900 dark:text-white">
                        {src.eventCount}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadge(src.highestSeverity)}`}>
                          {src.highestSeverity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => navigate(`/cyberadmin/agentshield?tab=live&search=${src.sourceIdentifier}`)}
                          className="text-[11px] font-bold text-[#6D35E8] hover:underline cursor-pointer"
                        >
                          Filter Events
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecurityAnalyticsTab;

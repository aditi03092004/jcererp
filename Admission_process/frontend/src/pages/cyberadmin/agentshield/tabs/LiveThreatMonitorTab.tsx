import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import agentshieldService, { SecurityEventItem } from '../../../../services/agentshield.service';
import {
  Radio,
  Search,
  Filter,
  RefreshCw,
  Eye,
  AlertTriangle,
  Flame,
  ShieldAlert,
  ShieldCheck,
  Ban,
  X,
  Code,
  Globe,
  Clock,
  Layers,
} from 'lucide-react';

export const LiveThreatMonitorTab: React.FC = () => {
  const { socket, socketConnected } = useOutletContext<{ socket: Socket | null; socketConnected: boolean }>() || {};

  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectEvent, setInspectEvent] = useState<SecurityEventItem | null>(null);

  const fetchEvents = async () => {
    try {
      setRefreshing(true);
      const params: any = { limit: 50 };
      if (selectedRisk !== 'ALL') params.riskLevel = selectedRisk;
      if (selectedCategory !== 'ALL') params.category = selectedCategory;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await agentshieldService.getEvents(params);
      if (res.success) {
        setEvents(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch security events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedRisk, selectedCategory]);

  // Real-time live event streaming via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNewEvent = (newEvent: SecurityEventItem) => {
      setEvents((prev) => {
        // Prevent duplicate events
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        return [newEvent, ...prev.slice(0, 49)];
      });
    };

    socket.on('agentshield:event', handleNewEvent);

    return () => {
      socket.off('agentshield:event', handleNewEvent);
    };
  }, [socket]);

  // Polling fallback when WebSocket is offline
  useEffect(() => {
    if (socketConnected) return;
    const interval = setInterval(fetchEvents, 8000);
    return () => clearInterval(interval);
  }, [socketConnected, selectedRisk, selectedCategory, searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents();
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'MEDIUM':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'BLOCKED':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'RATE_LIMITED':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'HONEYPOT_TRIGGER':
        return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700';
    }
  };

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* ── Filter & Search Toolbar (Top element, no duplicate title) ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Risk Level Filter Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((risk) => (
              <button
                key={risk}
                onClick={() => setSelectedRisk(risk)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-tight transition cursor-pointer ${
                  selectedRisk === risk
                    ? 'bg-[#6D35E8] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {risk}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-800 dark:text-neutral-200 text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#6D35E8]/20 focus:border-[#6D35E8] cursor-pointer shadow-2xs font-semibold"
          >
            <option value="ALL">All Categories</option>
            <option value="RECONNAISSANCE">Reconnaissance</option>
            <option value="ACCESS_CONTROL">Access Control</option>
            <option value="AUTHENTICATION">Authentication</option>
            <option value="DECEPTION">Deception (Honeypot)</option>
            <option value="INJECTION">Injection</option>
            <option value="DOS_THROTTLE">Rate Anomaly</option>
          </select>

          {/* Streaming Status Badge */}
          <span
            className={`hidden xl:inline-flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-1 rounded-full border ${
              socketConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            }`}
          >
            <span className={`size-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>{socketConnected ? 'STREAMING REAL-TIME' : 'POLLING FALLBACK (8s)'}</span>
          </span>
        </div>

        {/* Text Search Form & Refresh Feed Button */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative min-w-[260px] flex-1 sm:flex-initial">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search endpoint, IP, correlation ID..."
              className="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-800 dark:text-neutral-200 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#6D35E8]/20 focus:border-[#6D35E8] placeholder:text-slate-400 shadow-2xs"
            />
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </form>

          <button
            onClick={fetchEvents}
            disabled={refreshing}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-neutral-700 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
            title="Refresh Feed"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[#6D35E8]' : ''}`} />
            <span className="hidden sm:inline">Refresh Feed</span>
          </button>
        </div>
      </div>

      {/* ── Events Table ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="size-10 rounded-full border-3 border-violet-500/20 border-t-violet-600 animate-spin mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-neutral-500 uppercase tracking-wider">Loading live security events...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-24 text-center space-y-3 text-neutral-500 dark:text-neutral-400">
            <ShieldCheck className="size-12 mx-auto text-emerald-500/70" />
            <p className="text-base font-bold text-neutral-800 dark:text-neutral-200">No Security Events Matching Criteria</p>
            <p className="text-xs sm:text-sm text-neutral-500">All request signals are nominal within current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 uppercase font-black tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 sm:px-5">Timestamp</th>
                  <th className="py-3.5 px-4">Risk</th>
                  <th className="py-3.5 px-4">HTTP / Endpoint</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Client IP</th>
                  <th className="py-3.5 px-4">Rule Matched</th>
                  <th className="py-3.5 px-4">Action Taken</th>
                  <th className="py-3.5 px-4 sm:px-5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-4 px-4 sm:px-5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap font-mono text-xs">
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase border ${getRiskBadge(evt.riskLevel)}`}>
                        {evt.riskLevel}
                      </span>
                    </td>
                    <td className="py-4 px-4 max-w-sm truncate" title={evt.route}>
                      <span className="font-bold text-neutral-800 dark:text-neutral-200 mr-2 font-mono text-xs">{evt.method}</span>
                      <span className="text-violet-700 dark:text-violet-400 font-semibold">{evt.route}</span>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                          evt.statusCode >= 500
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                            : evt.statusCode >= 400
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        }`}
                      >
                        {evt.statusCode}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-neutral-700 dark:text-neutral-300 font-mono text-xs whitespace-nowrap">{evt.clientIp}</td>
                    <td className="py-4 px-4 text-neutral-600 dark:text-neutral-400 text-xs whitespace-nowrap font-mono">{evt.ruleId}</td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${getActionBadge(evt.responseAction)}`}>
                        {evt.responseAction}
                      </span>
                    </td>
                    <td className="py-4 px-4 sm:px-5 text-right whitespace-nowrap">
                      <button
                        onClick={() => setInspectEvent(evt)}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-xs font-bold transition flex items-center space-x-1.5 ml-auto cursor-pointer shadow-xs"
                      >
                        <Eye className="size-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Event Inspection Modal ── */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3.5 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/60">
                  <ShieldAlert className="size-5 sm:size-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 dark:text-white text-base sm:text-lg">Security Event Telemetry Inspector</h3>
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">Detailed diagnostic payload and risk breakdown</p>
                </div>
              </div>
              <button
                onClick={() => setInspectEvent(null)}
                className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm">
              {/* Risk explanation callout */}
              <div className="p-4 sm:p-5 rounded-xl bg-violet-50/50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/40 space-y-2">
                <span className="text-xs uppercase font-extrabold text-violet-700 dark:text-violet-400 tracking-wider">
                  Explainable Risk Analysis
                </span>
                <p className="text-neutral-800 dark:text-neutral-200 text-sm leading-relaxed font-medium">
                  {inspectEvent.evidence?.explanation || 'No detailed explanation provided for this event.'}
                </p>
                {inspectEvent.evidence?.factors && (
                  <ul className="list-disc list-inside text-neutral-600 dark:text-neutral-400 text-xs sm:text-sm pt-1 space-y-1">
                    {inspectEvent.evidence.factors.map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Key metadata grid */}
              <div className="grid grid-cols-2 gap-3.5 font-mono">
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Event ID</span>
                  <span className="text-neutral-800 dark:text-neutral-200 select-all text-xs sm:text-sm">{inspectEvent.id}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Correlation ID</span>
                  <span className="text-neutral-800 dark:text-neutral-200 select-all text-xs sm:text-sm">{inspectEvent.correlationId}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Client IP / Source</span>
                  <span className="text-neutral-800 dark:text-neutral-200 font-bold text-xs sm:text-sm">{inspectEvent.clientIp}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Endpoint Target</span>
                  <span className="text-violet-700 dark:text-violet-400 truncate block text-xs sm:text-sm font-semibold">
                    [{inspectEvent.method}] {inspectEvent.route}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Role Attribution</span>
                  <span className="text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm">{inspectEvent.role}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Enforced Response Action</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs sm:text-sm">{inspectEvent.responseAction}</span>
                </div>
              </div>

              {inspectEvent.userAgent && (
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 font-mono text-xs">
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">User Agent</span>
                  <span className="text-neutral-600 dark:text-neutral-400 break-all">{inspectEvent.userAgent}</span>
                </div>
              )}
            </div>

            <div className="pt-3.5 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                onClick={() => setInspectEvent(null)}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveThreatMonitorTab;

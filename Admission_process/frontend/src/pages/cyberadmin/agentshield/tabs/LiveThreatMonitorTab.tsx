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
  const { socket, socketConnected } = useOutletContext<{ socket: Socket | null; socketConnected: boolean }>();

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
        return 'bg-rose-950/80 text-rose-300 border-rose-500/50';
      case 'HIGH':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/50';
      case 'MEDIUM':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-500/50';
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-500/50';
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'BLOCKED':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'RATE_LIMITED':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'HONEYPOT_TRIGGER':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar with Live Streaming Pulse ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Radio className="size-5 text-emerald-400 animate-pulse" />
            <h1 className="text-xl font-black text-white tracking-tight">Live Threat Monitor</h1>
            <span
              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                socketConnected
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-400'
              }`}
            >
              {socketConnected ? 'STREAMING REAL-TIME' : 'POLLING FALLBACK (8s)'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time feed of observable backend request signals, automated detection triggers, and mitigation actions.
          </p>
        </div>

        <button
          onClick={fetchEvents}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Risk Level Filter Buttons */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((risk) => (
              <button
                key={risk}
                onClick={() => setSelectedRisk(risk)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-tight transition cursor-pointer ${
                  selectedRisk === risk
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
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
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Categories</option>
            <option value="RECONNAISSANCE">Reconnaissance</option>
            <option value="ACCESS_CONTROL">Access Control</option>
            <option value="AUTHENTICATION">Authentication</option>
            <option value="DECEPTION">Deception (Honeypot)</option>
            <option value="INJECTION">Injection</option>
            <option value="DOS_THROTTLE">Rate Anomaly</option>
          </select>
        </div>

        {/* Text Search Form */}
        <form onSubmit={handleSearchSubmit} className="relative min-w-[240px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search endpoint, IP, correlation ID..."
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
          />
          <Search className="size-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </form>
      </div>

      {/* ── Events Table ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 text-center space-y-2">
            <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-400">Loading live security events...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-20 text-center space-y-2 text-slate-500">
            <ShieldCheck className="size-10 mx-auto text-emerald-500/40" />
            <p className="text-sm font-bold text-slate-300">No Security Events Matching Criteria</p>
            <p className="text-xs text-slate-500">All request signals are nominal within current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Risk</th>
                  <th className="py-3 px-4">HTTP / Endpoint</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Client IP</th>
                  <th className="py-3 px-4">Rule Matched</th>
                  <th className="py-3 px-4">Action Taken</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getRiskBadge(evt.riskLevel)}`}>
                        {evt.riskLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate" title={evt.route}>
                      <span className="font-bold text-slate-200 mr-1.5">{evt.method}</span>
                      <span className="text-emerald-400 font-sans">{evt.route}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          evt.statusCode >= 500
                            ? 'bg-rose-500/20 text-rose-300'
                            : evt.statusCode >= 400
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}
                      >
                        {evt.statusCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 whitespace-nowrap">{evt.clientIp}</td>
                    <td className="py-3 px-4 text-slate-400 font-sans text-[11px] whitespace-nowrap">{evt.ruleId}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getActionBadge(evt.responseAction)}`}>
                        {evt.responseAction}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setInspectEvent(evt)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-sans font-bold transition flex items-center space-x-1 ml-auto cursor-pointer"
                      >
                        <Eye className="size-3" />
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="size-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Security Event Telemetry Inspector</h3>
              </div>
              <button
                onClick={() => setInspectEvent(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Risk explanation callout */}
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Explainable Risk Analysis</span>
                <p className="text-slate-200 font-sans text-xs leading-relaxed">
                  {inspectEvent.evidence?.explanation || 'No detailed explanation provided for this event.'}
                </p>
                {inspectEvent.evidence?.factors && (
                  <ul className="list-disc list-inside text-slate-400 text-[11px] pt-1">
                    {inspectEvent.evidence.factors.map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Key metadata grid */}
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Event ID</span>
                  <span className="text-slate-300 select-all">{inspectEvent.id}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Correlation ID</span>
                  <span className="text-slate-300 select-all">{inspectEvent.correlationId}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Client IP / Source</span>
                  <span className="text-slate-300">{inspectEvent.clientIp}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Endpoint Target</span>
                  <span className="text-slate-300 truncate block">
                    [{inspectEvent.method}] {inspectEvent.route}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Role Attribution</span>
                  <span className="text-slate-300">{inspectEvent.role}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block">Enforced Response Action</span>
                  <span className="text-emerald-400 font-bold">{inspectEvent.responseAction}</span>
                </div>
              </div>

              {inspectEvent.userAgent && (
                <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80 font-mono text-[11px]">
                  <span className="text-slate-500 text-[10px] block">User Agent</span>
                  <span className="text-slate-400 break-all">{inspectEvent.userAgent}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectEvent(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
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

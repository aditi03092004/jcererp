import React, { useState, useEffect } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { Socket } from 'socket.io-client';
import agentshieldService, { SecurityIncidentItem, InvestigationNoteItem } from '../../../../services/agentshield.service';
import {
  AlertTriangle,
  Flame,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  Eye,
  X,
  RefreshCw,
  FileText,
  User,
  ArrowRight,
} from 'lucide-react';

export const SecurityIncidentsTab: React.FC = () => {
  const { socket, socketConnected } = useOutletContext<{ socket: Socket | null; socketConnected: boolean }>() || {};
  const [searchParams] = useSearchParams();
  const initialId = searchParams.get('id');

  const [incidents, setIncidents] = useState<SecurityIncidentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Incident Detail State
  const [selectedIncident, setSelectedIncident] = useState<SecurityIncidentItem | null>(null);
  const [newNote, setNewNote] = useState<string>('');
  const [submittingNote, setSubmittingNote] = useState<boolean>(false);
  const [resolutionSummary, setResolutionSummary] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  const fetchIncidents = async () => {
    try {
      setRefreshing(true);
      const params: any = { limit: 50 };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (severityFilter !== 'ALL') params.severity = severityFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await agentshieldService.getIncidents(params);
      if (res.success) {
        setIncidents(res.data);

        // If an initial ID was specified in URL
        if (initialId && !selectedIncident) {
          const match = res.data.find((i: SecurityIncidentItem) => i.id === initialId);
          if (match) openIncidentDetail(match.id);
        }
      }
    } catch (err) {
      console.error('Failed to load incidents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter, severityFilter]);

  // Real-time live incident streaming via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNewIncident = (incident: SecurityIncidentItem) => {
      setIncidents((prev) => {
        const existingIdx = prev.findIndex((i) => i.id === incident.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = incident;
          return updated;
        }
        return [incident, ...prev];
      });

      setSelectedIncident((prevSelected) => {
        if (prevSelected && prevSelected.id === incident.id) {
          return incident;
        }
        return prevSelected;
      });
    };

    socket.on('agentshield:incident', handleNewIncident);
    return () => {
      socket.off('agentshield:incident', handleNewIncident);
    };
  }, [socket]);

  // Polling fallback when WebSocket is offline
  useEffect(() => {
    if (socketConnected) return;
    const interval = setInterval(fetchIncidents, 8000);
    return () => clearInterval(interval);
  }, [socketConnected, statusFilter, severityFilter, searchQuery]);

  const openIncidentDetail = async (id: string) => {
    try {
      const res = await agentshieldService.getIncidentById(id);
      if (res.success) {
        setSelectedIncident(res.data);
        setResolutionSummary(res.data.resolutionSummary || '');
      }
    } catch (err) {
      console.error('Failed to load incident detail:', err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedIncident) return;
    try {
      setUpdatingStatus(true);
      const res = await agentshieldService.updateIncidentStatus(
        selectedIncident.id,
        newStatus,
        newStatus === 'RESOLVED' ? resolutionSummary : undefined
      );
      if (res.success) {
        setSelectedIncident(res.data);
        fetchIncidents();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !newNote.trim()) return;

    try {
      setSubmittingNote(true);
      const res = await agentshieldService.addIncidentNote(selectedIncident.id, newNote.trim());
      if (res.success) {
        setSelectedIncident(res.incident);
        setNewNote('');
        fetchIncidents();
      }
    } catch (err) {
      console.error('Failed to append investigation note:', err);
    } finally {
      setSubmittingNote(false);
    }
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
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

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'NEW':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'INVESTIGATING':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'MITIGATED':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'RESOLVED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>Security Incidents Ledger</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Correlated investigations, threat containment lifecycles, and audited administrative evidence notes.
          </p>
        </div>

        <button
          onClick={fetchIncidents}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['ALL', 'NEW', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-tight transition cursor-pointer ${
                  statusFilter === st
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Severity Dropdown */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Text Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchIncidents();
          }}
          className="relative min-w-[240px]"
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search incident number, title, IP..."
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
          />
          <Search className="size-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </form>
      </div>

      {/* ── Incidents Table ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 text-center space-y-2">
            <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-400">Loading incident queue...</p>
          </div>
        ) : incidents.length === 0 ? (
          <div className="py-20 text-center space-y-2 text-slate-500">
            <CheckCircle2 className="size-10 mx-auto text-emerald-500/40" />
            <p className="text-sm font-bold text-slate-300">No Incidents Found</p>
            <p className="text-xs text-slate-500">There are no security incidents matching your filter settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                  <th className="py-3 px-4">Incident ID</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Incident Title</th>
                  <th className="py-3 px-4">Source Identifier</th>
                  <th className="py-3 px-4">Target Resource</th>
                  <th className="py-3 px-4">Signals</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {inc.incidentNumber}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getSeverityBadge(inc.severity)}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusBadge(inc.status)}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-200 max-w-xs truncate" title={inc.title}>
                      {inc.title}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">{inc.sourceIdentifier}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px] truncate max-w-[180px]" title={inc.targetResource}>
                      {inc.targetResource}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300 font-bold whitespace-nowrap">
                      {inc.eventCount}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(inc.lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openIncidentDetail(inc.id)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold transition flex items-center space-x-1 ml-auto cursor-pointer"
                      >
                        <Eye className="size-3" />
                        <span>Investigate</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Comprehensive Incident Investigation Modal / Drawer ── */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-emerald-400 font-black text-sm">{selectedIncident.incidentNumber}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getSeverityBadge(selectedIncident.severity)}`}>
                    {selectedIncident.severity}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusBadge(selectedIncident.status)}`}>
                    {selectedIncident.status}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white leading-snug">{selectedIncident.title}</h2>
              </div>

              <button
                onClick={() => setSelectedIncident(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Lifecycle State Controls */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    Incident Lifecycle Transitions
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Transitions are audited under security compliance rules.
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(['NEW', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'] as const).map((st) => (
                    <button
                      key={st}
                      disabled={updatingStatus || selectedIncident.status === st}
                      onClick={() => handleStatusChange(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 ${
                        selectedIncident.status === st
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {st === selectedIncident.status ? `✓ ${st}` : `Mark as ${st}`}
                    </button>
                  ))}
                </div>

                {selectedIncident.status === 'RESOLVED' && (
                  <div className="pt-2">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Resolution Summary Note:</label>
                    <textarea
                      rows={2}
                      value={resolutionSummary}
                      onChange={(e) => setResolutionSummary(e.target.value)}
                      placeholder="Describe corrective actions or findings..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Observable Evidence Summary */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                  Correlated Evidence Log
                </span>
                <pre className="font-mono text-emerald-300 text-[11px] whitespace-pre-wrap bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 max-h-40 overflow-y-auto">
                  {selectedIncident.evidenceSummary}
                </pre>
              </div>

              {/* Recommended Investigation Steps */}
              {selectedIncident.recommendedSteps && selectedIncident.recommendedSteps.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    Recommended Security Response Checklist
                  </span>
                  <ul className="space-y-1.5 text-slate-300 text-xs">
                    {selectedIncident.recommendedSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="size-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Supporting Security Events Stream */}
              {selectedIncident.events && selectedIncident.events.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    Supporting Security Signals ({selectedIncident.events.length})
                  </span>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Time</th>
                          <th className="py-2 px-3">Risk</th>
                          <th className="py-2 px-3">Method / Route</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Source IP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {selectedIncident.events.map((evt) => (
                          <tr key={evt.id} className="hover:bg-slate-900/40">
                            <td className="py-1.5 px-3 text-slate-400">
                              {new Date(evt.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-1.5 px-3 font-sans font-bold text-[10px] text-amber-400">{evt.riskLevel}</td>
                            <td className="py-1.5 px-3 text-slate-200 truncate max-w-xs">{evt.method} {evt.route}</td>
                            <td className="py-1.5 px-3">{evt.statusCode}</td>
                            <td className="py-1.5 px-3 text-slate-400">{evt.clientIp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Investigation Notes Thread */}
              <div className="space-y-3">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                  Administrative Investigation Journal ({selectedIncident.investigationNotes?.length || 0})
                </span>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {(!selectedIncident.investigationNotes || selectedIncident.investigationNotes.length === 0) ? (
                    <p className="text-slate-500 italic text-[11px] p-3 bg-slate-950 rounded-lg border border-slate-800/80">
                      No investigation notes have been logged yet for this incident.
                    </p>
                  ) : (
                    selectedIncident.investigationNotes.map((noteItem) => (
                      <div key={noteItem.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-emerald-400">{noteItem.author} ({noteItem.authorEmail})</span>
                          <span className="text-slate-500">{new Date(noteItem.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-200 text-xs font-sans whitespace-pre-wrap">{noteItem.note}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Append an investigation note or compliance remark..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black transition cursor-pointer disabled:opacity-40 flex items-center space-x-1"
                  >
                    <Send className="size-3" />
                    <span>Post Note</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span>First detected: {new Date(selectedIncident.firstObservedAt).toLocaleString()}</span>
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              >
                Close Investigation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityIncidentsTab;


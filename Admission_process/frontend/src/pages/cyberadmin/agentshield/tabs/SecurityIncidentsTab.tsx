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
  Shield,
  Layers,
  Mail,
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
  const [resendingEmail, setResendingEmail] = useState<boolean>(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

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
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'MEDIUM':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'NEW':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'INVESTIGATING':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'MITIGATED':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  const getNotificationBadge = (st?: string) => {
    switch (st) {
      case 'SENT':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'PENDING':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'FAILED':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      default:
        return 'bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700';
    }
  };

  const handleResendNotification = async () => {
    if (!selectedIncident) return;
    try {
      setResendingEmail(true);
      setResendNotice(null);
      const res = await agentshieldService.resendIncidentNotification(selectedIncident.id);
      if (res.success) {
        setResendNotice('Alert email queued for delivery.');
        await openIncidentDetail(selectedIncident.id);
        fetchIncidents();
      }
    } catch (err: any) {
      setResendNotice(err.response?.data?.error || 'Failed to resend alert email.');
    } finally {
      setResendingEmail(false);
    }
  };

  // Metrics for top status cards
  const totalCount = incidents.length;
  const newCount = incidents.filter((i) => i.status === 'NEW').length;
  const investigatingCount = incidents.filter((i) => i.status === 'INVESTIGATING').length;
  const mitigatedCount = incidents.filter((i) => i.status === 'MITIGATED').length;
  const resolvedCount = incidents.filter((i) => i.status === 'RESOLVED').length;

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* ── Summary Cards Row (Clean, Compact, Aligned) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 sm:gap-4">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
            statusFilter === 'ALL' ? 'ring-2 ring-[#6D35E8]/40 border-purple-200' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total</span>
            <div className="size-7 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-[#6D35E8] dark:text-purple-400 flex items-center justify-center">
              <Shield className="size-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-none my-1.5">{totalCount}</div>
          <p className="text-[11px] text-slate-400 font-medium">All ledger records</p>
        </div>

        <div
          onClick={() => setStatusFilter('NEW')}
          className={`p-4 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
            statusFilter === 'NEW' ? 'ring-2 ring-rose-500/40 border-rose-200' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New</span>
            <div className="size-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Flame className="size-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400 leading-none my-1.5">{newCount}</div>
          <p className="text-[11px] text-slate-400 font-medium">Pending triage</p>
        </div>

        <div
          onClick={() => setStatusFilter('INVESTIGATING')}
          className={`p-4 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
            statusFilter === 'INVESTIGATING' ? 'ring-2 ring-amber-500/40 border-amber-200' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Investigating</span>
            <div className="size-7 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 leading-none my-1.5">{investigatingCount}</div>
          <p className="text-[11px] text-slate-400 font-medium">Active analysis</p>
        </div>

        <div
          onClick={() => setStatusFilter('MITIGATED')}
          className={`p-4 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
            statusFilter === 'MITIGATED' ? 'ring-2 ring-blue-500/40 border-blue-200' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mitigated</span>
            <div className="size-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldAlert className="size-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 leading-none my-1.5">{mitigatedCount}</div>
          <p className="text-[11px] text-slate-400 font-medium">Threat contained</p>
        </div>

        <div
          onClick={() => setStatusFilter('RESOLVED')}
          className={`p-4 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xs cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
            statusFilter === 'RESOLVED' ? 'ring-2 ring-emerald-500/40 border-emerald-200' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Resolved</span>
            <div className="size-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 leading-none my-1.5">{resolvedCount}</div>
          <p className="text-[11px] text-slate-400 font-medium">Closed with notes</p>
        </div>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700">
            {['ALL', 'NEW', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-tight transition cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#6D35E8] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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
            className="bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-800 dark:text-slate-200 text-xs rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#6D35E8]/20 focus:border-[#6D35E8] cursor-pointer shadow-2xs font-semibold"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Text Search & Refresh */}
        <div className="flex items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchIncidents();
            }}
            className="relative min-w-[260px] flex-1 sm:flex-initial"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search incident number, title, IP..."
              className="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-slate-800 dark:text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#6D35E8]/20 focus:border-[#6D35E8] placeholder:text-slate-400 shadow-2xs"
            />
            <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </form>

          <button
            onClick={fetchIncidents}
            disabled={refreshing}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-neutral-700 transition shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
            title="Refresh Incidents"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[#6D35E8]' : ''}`} />
            <span className="hidden sm:inline">Refresh Incidents</span>
          </button>
        </div>
      </div>

      {/* ── Incidents Table ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="size-10 rounded-full border-3 border-violet-500/20 border-t-violet-600 animate-spin mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-neutral-500 uppercase tracking-wider">Loading incident queue...</p>
          </div>
        ) : incidents.length === 0 ? (
          <div className="py-24 text-center space-y-3 text-neutral-500 dark:text-neutral-400">
            <CheckCircle2 className="size-12 mx-auto text-emerald-500/70" />
            <p className="text-base font-bold text-neutral-800 dark:text-neutral-200">No Incidents Found</p>
            <p className="text-xs sm:text-sm text-neutral-500">There are no security incidents matching your filter settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 uppercase font-black tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 sm:px-5">Incident ID</th>
                  <th className="py-3.5 px-4">Severity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Alert Email</th>
                  <th className="py-3.5 px-4">Incident Title</th>
                  <th className="py-3.5 px-4">Source Identifier</th>
                  <th className="py-3.5 px-4">Target Resource</th>
                  <th className="py-3.5 px-4">Signals</th>
                  <th className="py-3.5 px-4">Last Activity</th>
                  <th className="py-3.5 px-4 sm:px-5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-sans">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-4 px-4 sm:px-5 font-mono font-bold text-violet-700 dark:text-violet-400 whitespace-nowrap text-xs sm:text-sm">
                      {inc.incidentNumber}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase border ${getSeverityBadge(inc.severity)}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${getStatusBadge(inc.status)}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase border inline-flex items-center space-x-1 ${getNotificationBadge(inc.notificationStatus)}`}>
                        <Mail className="size-3" />
                        <span>{inc.notificationStatus === 'SENT' ? 'Sent' : inc.notificationStatus === 'PENDING' ? 'Queued' : inc.notificationStatus === 'FAILED' ? 'Failed' : 'None'}</span>
                      </span>
                    </td>
                    <td className="py-4 px-4 font-bold text-neutral-900 dark:text-white max-w-sm truncate" title={inc.title}>
                      {inc.title}
                    </td>
                    <td className="py-4 px-4 font-mono text-neutral-700 dark:text-neutral-300 whitespace-nowrap text-xs">{inc.sourceIdentifier}</td>
                    <td className="py-4 px-4 font-mono text-neutral-500 dark:text-neutral-400 text-xs truncate max-w-[200px]" title={inc.targetResource}>
                      {inc.targetResource}
                    </td>
                    <td className="py-4 px-4 font-mono text-neutral-800 dark:text-neutral-200 font-bold whitespace-nowrap text-xs sm:text-sm">
                      {inc.eventCount}
                    </td>
                    <td className="py-4 px-4 text-neutral-500 dark:text-neutral-400 text-xs whitespace-nowrap">
                      {new Date(inc.lastObservedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-4 px-4 sm:px-5 text-right whitespace-nowrap">
                      <button
                        onClick={() => openIncidentDetail(inc.id)}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-xs font-bold transition flex items-center space-x-1.5 ml-auto cursor-pointer shadow-xs"
                      >
                        <Eye className="size-3.5" />
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2.5">
                  <span className="font-mono text-violet-700 dark:text-violet-400 font-black text-sm sm:text-base">{selectedIncident.incidentNumber}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase border ${getSeverityBadge(selectedIncident.severity)}`}>
                    {selectedIncident.severity}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${getStatusBadge(selectedIncident.status)}`}>
                    {selectedIncident.status}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white leading-snug">{selectedIncident.title}</h2>
              </div>

              <button
                onClick={() => setSelectedIncident(null)}
                className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6 text-xs sm:text-sm">
              {/* Lifecycle State Controls */}
              <div className="p-4 sm:p-5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold text-neutral-600 dark:text-neutral-400 tracking-wider">
                    Incident Lifecycle Transitions
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Transitions are audited under security compliance rules.
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {(['NEW', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'] as const).map((st) => (
                    <button
                      key={st}
                      disabled={updatingStatus || selectedIncident.status === st}
                      onClick={() => handleStatusChange(st)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer disabled:opacity-40 shadow-xs ${
                        selectedIncident.status === st
                          ? 'bg-violet-600 text-white font-extrabold'
                          : 'bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {st === selectedIncident.status ? `✓ ${st}` : `Mark as ${st}`}
                    </button>
                  ))}
                </div>

                {selectedIncident.status === 'RESOLVED' && (
                  <div className="pt-2">
                    <label className="text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300 block mb-1.5">Resolution Summary Note:</label>
                    <textarea
                      rows={2}
                      value={resolutionSummary}
                      onChange={(e) => setResolutionSummary(e.target.value)}
                      placeholder="Describe corrective actions or findings..."
                      className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                    />
                  </div>
                )}
              </div>

              {/* Automated Brevo Email Alert Telemetry */}
              <div className="p-4 sm:p-5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Mail className="size-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-xs uppercase font-extrabold text-neutral-700 dark:text-neutral-300 tracking-wider">
                      Automated Brevo Security Alert
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${getNotificationBadge(selectedIncident.notificationStatus)}`}>
                    {selectedIncident.notificationStatus || 'NONE'}
                  </span>
                </div>

                <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
                  {selectedIncident.notificationSentAt && (
                    <div>
                      <strong className="text-neutral-800 dark:text-neutral-200">Dispatched:</strong>{' '}
                      {new Date(selectedIncident.notificationSentAt).toLocaleString()}
                    </div>
                  )}
                  {selectedIncident.notificationFailureReason && (
                    <div className="text-rose-600 dark:text-rose-400 font-medium">
                      <strong>Delivery Notice:</strong> {selectedIncident.notificationFailureReason}
                    </div>
                  )}
                  {selectedIncident.severity !== 'CRITICAL' && selectedIncident.severity !== 'HIGH' && (
                    <div className="text-neutral-500 italic">
                      Automatic email alerts are strictly routed for HIGH and CRITICAL severity threats to prevent alert fatigue.
                    </div>
                  )}
                </div>

                {(selectedIncident.severity === 'CRITICAL' || selectedIncident.severity === 'HIGH') && (
                  <div className="flex items-center space-x-3 pt-1">
                    <button
                      onClick={handleResendNotification}
                      disabled={resendingEmail}
                      className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Mail className={`size-3.5 ${resendingEmail ? 'animate-pulse text-violet-600' : ''}`} />
                      <span>{resendingEmail ? 'Dispatching...' : 'Resend Alert Email'}</span>
                    </button>
                    {resendNotice && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                        {resendNotice}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Observable Evidence Summary */}
              <div className="p-4 sm:p-5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2">
                <span className="text-xs uppercase font-extrabold text-neutral-600 dark:text-neutral-400 tracking-wider">
                  Correlated Evidence Log
                </span>
                <pre className="font-mono text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm whitespace-pre-wrap bg-white dark:bg-neutral-900 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 max-h-40 overflow-y-auto">
                  {selectedIncident.evidenceSummary}
                </pre>
              </div>

              {/* Recommended Investigation Steps */}
              {selectedIncident.recommendedSteps && selectedIncident.recommendedSteps.length > 0 && (
                <div className="p-4 sm:p-5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-2.5">
                  <span className="text-xs uppercase font-extrabold text-neutral-600 dark:text-neutral-400 tracking-wider">
                    Recommended Security Response Checklist
                  </span>
                  <ul className="space-y-2 text-neutral-700 dark:text-neutral-300 text-xs sm:text-sm">
                    {selectedIncident.recommendedSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start space-x-2.5">
                        <span className="size-5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="font-medium">{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Supporting Security Events Stream */}
              {selectedIncident.events && selectedIncident.events.length > 0 && (
                <div className="space-y-2.5">
                  <span className="text-xs uppercase font-extrabold text-neutral-600 dark:text-neutral-400 tracking-wider">
                    Supporting Security Signals ({selectedIncident.events.length})
                  </span>
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="bg-neutral-50 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800 text-[11px] uppercase font-bold">
                        <tr>
                          <th className="py-2.5 px-3">Time</th>
                          <th className="py-2.5 px-3">Risk</th>
                          <th className="py-2.5 px-3">Method / Route</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Source IP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                        {selectedIncident.events.map((evt) => (
                          <tr key={evt.id} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                            <td className="py-2 px-3 text-neutral-500 dark:text-neutral-400">
                              {new Date(evt.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-2 px-3 font-sans font-bold text-xs">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase border ${getSeverityBadge(evt.riskLevel)}`}>
                                {evt.riskLevel}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-neutral-800 dark:text-neutral-200 truncate max-w-xs">{evt.method} {evt.route}</td>
                            <td className="py-2 px-3 text-neutral-700 dark:text-neutral-300">{evt.statusCode}</td>
                            <td className="py-2 px-3 text-neutral-500 dark:text-neutral-400">{evt.clientIp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Investigation Notes Thread */}
              <div className="space-y-3.5">
                <span className="text-xs uppercase font-extrabold text-neutral-600 dark:text-neutral-400 tracking-wider">
                  Administrative Investigation Journal ({selectedIncident.investigationNotes?.length || 0})
                </span>

                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {(!selectedIncident.investigationNotes || selectedIncident.investigationNotes.length === 0) ? (
                    <p className="text-neutral-500 dark:text-neutral-400 italic text-xs sm:text-sm p-4 bg-neutral-50/70 dark:bg-neutral-800/40 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80">
                      No investigation notes have been logged yet for this incident.
                    </p>
                  ) : (
                    selectedIncident.investigationNotes.map((noteItem) => (
                      <div key={noteItem.id} className="p-3.5 sm:p-4 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-violet-700 dark:text-violet-400">{noteItem.author} ({noteItem.authorEmail})</span>
                          <span className="text-neutral-400 font-medium">{new Date(noteItem.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm font-sans whitespace-pre-wrap leading-relaxed">{noteItem.note}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="flex gap-2.5 pt-1">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Append an investigation note or compliance remark..."
                    className="flex-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                  />
                  <button
                    type="submit"
                    disabled={submittingNote || !newNote.trim()}
                    className="px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white transition cursor-pointer disabled:opacity-40 flex items-center space-x-1.5 shadow-xs"
                  >
                    <Send className="size-3.5" />
                    <span>Post Note</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 flex items-center justify-between text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
              <span>First detected: {new Date(selectedIncident.firstObservedAt).toLocaleString()}</span>
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition cursor-pointer"
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

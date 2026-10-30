import React, { useState, useEffect } from 'react';
import agentshieldService, { SecurityAuditLogItem } from '../../../../services/agentshield.service';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle2,
  X,
} from 'lucide-react';

export const SecurityAuditLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<SecurityAuditLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const fetchAuditLogs = async () => {
    try {
      setRefreshing(true);
      const params: any = { limit: 100 };
      if (actionFilter !== 'ALL') params.action = actionFilter;
      const res = await agentshieldService.getAuditLogs(params);
      if (res.success) {
        setLogs(res.data);
      }
    } catch (err) {
      console.error('Failed to load security audit logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [actionFilter]);

  const toggleExpand = (id: string) => {
    setExpandedLogId((prev) => (prev === id ? null : id));
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'UPDATE_INCIDENT_STATUS':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'ADD_INVESTIGATION_NOTE':
        return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800';
      case 'UPDATE_DETECTION_RULE':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'IMPORT_ZAP_ASSESSMENT':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'UPDATE_FINDING_STATUS':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'LIFT_IP_RESTRICTION':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* ── Top Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white tracking-tight flex items-center space-x-2">
            <span>Security Administration Audit Trail</span>
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 font-medium">
            Immutable log of all CyberAdmin investigations, rule edits, remediation overrides, and defensive actions.
          </p>
        </div>

        <button
          onClick={fetchAuditLogs}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin text-violet-600 dark:text-violet-400' : ''}`} />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span className="text-xs sm:text-sm font-bold text-neutral-600 dark:text-neutral-400">Filter Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs sm:text-sm rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 cursor-pointer shadow-xs"
          >
            <option value="ALL">All Actions</option>
            <option value="UPDATE_INCIDENT_STATUS">Incident Status Updates</option>
            <option value="ADD_INVESTIGATION_NOTE">Investigation Notes</option>
            <option value="UPDATE_DETECTION_RULE">Rule Configurations</option>
            <option value="IMPORT_ZAP_ASSESSMENT">ZAP Report Imports</option>
            <option value="UPDATE_FINDING_STATUS">Vulnerability Statuses</option>
            <option value="LIFT_IP_RESTRICTION">Lift IP Restrictions</option>
          </select>
        </div>

        <span className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 font-mono font-medium">
          Showing {logs.length} audited entries
        </span>
      </div>

      {/* ── Audit Logs List / Table ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="size-10 rounded-full border-3 border-violet-500/20 border-t-violet-600 animate-spin mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-neutral-500 uppercase tracking-wider">Loading audit trail...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-neutral-500 space-y-2">
            <Shield className="size-10 mx-auto text-neutral-400 mb-2" />
            <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200">Zero Administrative Actions Recorded Yet</p>
            <p className="text-xs text-neutral-400">Security administrative events will be logged here with immutable evidence.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-sans">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className="p-5 sm:p-6 hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40 transition">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-3.5">
                      <span className="font-mono text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 flex items-center space-x-1.5">
                        <Clock className="size-4 text-neutral-400" />
                        <span>{new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}</span>
                      </span>

                      <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase border ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>

                      <span className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 font-semibold">
                        Target: <span className="font-mono text-neutral-900 dark:text-white font-bold">{log.targetType} / {log.targetId}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-4 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
                      <div className="flex items-center space-x-1.5">
                        <User className="size-4 text-neutral-400" />
                        <span className="font-mono text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 font-medium">{log.actorEmail}</span>
                      </div>
                      <button
                        type="button"
                        className="p-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
                      >
                        {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-xs sm:text-sm font-mono space-y-3.5 animate-in fade-in duration-100">
                      {log.details && (
                        <div>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 block uppercase font-bold tracking-wider mb-1.5 font-sans">
                            Operation Details
                          </span>
                          <pre className="p-4 rounded-xl bg-neutral-50/80 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-700/80 text-xs text-neutral-800 dark:text-neutral-200 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {log.previousState && (
                          <div>
                            <span className="text-xs text-rose-600 dark:text-rose-400 block uppercase font-bold tracking-wider mb-1.5 font-sans">
                              Previous State (Before)
                            </span>
                            <pre className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 text-xs text-rose-900 dark:text-rose-200 overflow-x-auto max-h-52">
                              {JSON.stringify(log.previousState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.newState && (
                          <div>
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 block uppercase font-bold tracking-wider mb-1.5 font-sans">
                              New State (After)
                            </span>
                            <pre className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 text-xs text-emerald-900 dark:text-emerald-200 overflow-x-auto max-h-52">
                              {JSON.stringify(log.newState, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityAuditLogsTab;

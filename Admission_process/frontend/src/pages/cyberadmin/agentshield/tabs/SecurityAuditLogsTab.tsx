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
      const params: any = { limit: 50 };
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

  return (
    <div className="space-y-6">
      {/* ── Top Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>Security Administration Audit Trail</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable log of all CyberAdmin investigations, rule edits, remediation overrides, and defensive actions.
          </p>
        </div>

        <button
          onClick={fetchAuditLogs}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Filter Toolbar ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 shadow-lg flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-400">Filter Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
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

        <span className="text-xs text-slate-500 font-mono">Showing {logs.length} audited entries</span>
      </div>

      {/* ── Audit Logs Table ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 text-center">
            <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-1">
            <Shield className="size-8 mx-auto text-slate-600 mb-2" />
            <p className="text-xs font-bold text-slate-400">Zero Administrative Actions Recorded Yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 font-sans">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className="p-4 hover:bg-slate-800/30 transition">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                        {log.action}
                      </span>
                      <span className="text-xs text-slate-300 font-bold">
                        Target: <span className="font-mono text-white">{log.targetType} / {log.targetId}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-slate-400">
                      <div className="flex items-center space-x-1">
                        <User className="size-3 text-slate-500" />
                        <span className="font-mono text-[11px]">{log.actorEmail}</span>
                      </div>
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800 text-xs font-mono space-y-2">
                      {log.details && (
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">Operation Details</span>
                          <pre className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {log.previousState && (
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">Previous State</span>
                            <pre className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-rose-300 overflow-x-auto max-h-36">
                              {JSON.stringify(log.previousState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.newState && (
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">New State</span>
                            <pre className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] text-emerald-300 overflow-x-auto max-h-36">
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

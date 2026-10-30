import React, { useState, useEffect } from 'react';
import agentshieldService from '../../../../services/agentshield.service';
import {
  Ban,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Unlock,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Lock,
} from 'lucide-react';

export const BlockedRequestsTab: React.FC = () => {
  const [activeRestrictions, setActiveRestrictions] = useState<any[]>([]);
  const [recentBlockedEvents, setRecentBlockedEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [liftingIp, setLiftingIp] = useState<string | null>(null);

  const fetchBlockedData = async () => {
    try {
      setRefreshing(true);
      const res = await agentshieldService.getBlockedRequests();
      if (res.success) {
        setActiveRestrictions(res.data.activeRestrictions || []);
        setRecentBlockedEvents(res.data.recentBlockedEvents || []);
      }
    } catch (err) {
      console.error('Failed to load blocked requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBlockedData();
    const interval = setInterval(fetchBlockedData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLift = async (clientIp: string) => {
    try {
      setLiftingIp(clientIp);
      const res = await agentshieldService.liftRestriction(clientIp);
      if (res.success) {
        fetchBlockedData();
      }
    } catch (err) {
      console.error('Failed to lift restriction:', err);
    } finally {
      setLiftingIp(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight flex items-center space-x-2">
            <span>Enforced Blocks & Active Throttles</span>
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Isolated defensive cooldowns and blocked anomalous requests enforced by AgentShield response policies.
          </p>
        </div>

        <button
          onClick={fetchBlockedData}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition shadow-sm cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-violet-600 dark:text-violet-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Active Restrictions Section ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/60">
              <Lock className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-neutral-900 dark:text-white uppercase tracking-wider">
                Active Source IP Cooldowns ({activeRestrictions.length})
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Temporary, reversible protective throttles applied to abusive sources.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center">
            <div className="size-6 rounded-full border-2 border-purple-500/20 border-t-purple-600 animate-spin mx-auto" />
          </div>
        ) : activeRestrictions.length === 0 ? (
          <div className="py-8 text-center text-neutral-500 space-y-1 bg-neutral-50/70 dark:bg-neutral-800/40 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80">
            <ShieldCheck className="size-8 mx-auto text-emerald-500/60 mb-1" />
            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">No Sources Under Active Restriction</p>
            <p className="text-[11px] text-neutral-500">No client IPs currently exceed protective threshold policies.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeRestrictions.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-neutral-900 dark:text-white text-sm">{item.clientIp}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
                      {item.policy}
                    </span>
                    {item.targetUserId && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                        User: {item.targetUserId}
                      </span>
                    )}
                    <span className="text-xs text-neutral-600 dark:text-neutral-400 font-medium">{item.reason}</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Enforced at {new Date(item.restrictedAt).toLocaleTimeString()} • Expires at {new Date(item.expiresAt).toLocaleTimeString()} • Repeat attempts: {item.hitCount}
                  </div>
                </div>

                <button
                  onClick={() => handleLift(item.clientIp)}
                  disabled={liftingIp === item.clientIp}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-neutral-200 dark:border-neutral-700 hover:border-rose-200 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 shadow-sm"
                >
                  <Unlock className="size-3.5" />
                  <span>{liftingIp === item.clientIp ? 'Lifting...' : 'Lift Restriction'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Blocked Events Log ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-sm space-y-3 p-5">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/60">
            <Ban className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-neutral-900 dark:text-white uppercase tracking-wider">
              Blocked & Rate-Limited Telemetry History
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Historical records of blocked or throttled requests</p>
          </div>
        </div>

        {recentBlockedEvents.length === 0 ? (
          <div className="py-12 text-center text-neutral-500 space-y-1">
            <CheckCircle2 className="size-8 mx-auto text-emerald-500/60 mb-1" />
            <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">Zero Blocked Requests Logged</p>
            <p className="text-[11px] text-neutral-500">No anomalous requests have triggered blocking policies yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/80 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 text-[10px] uppercase font-bold border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Client IP</th>
                  <th className="py-2.5 px-3">Target Endpoint</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Rule</th>
                  <th className="py-2.5 px-3">Defensive Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {recentBlockedEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-2.5 px-3 text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 dark:text-white">{evt.clientIp}</td>
                    <td className="py-2.5 px-3 text-violet-600 dark:text-violet-400 font-medium truncate max-w-xs">
                      <span className="font-mono mr-1 text-neutral-700 dark:text-neutral-300">[{evt.method}]</span>
                      {evt.route}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                        {evt.statusCode}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500 dark:text-neutral-400 text-[11px] font-mono">{evt.ruleId}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
                        {evt.responseAction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockedRequestsTab;

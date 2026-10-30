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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>Enforced Blocks & Active Throttles</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Isolated defensive cooldowns and blocked anomalous requests enforced by AgentShield response policies.
          </p>
        </div>

        <button
          onClick={fetchBlockedData}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Active Restrictions Section ── */}
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Lock className="size-4 text-purple-400" />
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              Active Source IP Cooldowns ({activeRestrictions.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Temporary, reversible protective throttles applied to abusive sources.
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center">
            <div className="size-6 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin mx-auto" />
          </div>
        ) : activeRestrictions.length === 0 ? (
          <div className="py-8 text-center text-slate-500 space-y-1 bg-slate-950/60 rounded-lg border border-slate-800/80">
            <ShieldCheck className="size-6 mx-auto text-emerald-500/60" />
            <p className="text-xs font-bold text-slate-400">No Sources Under Active Restriction</p>
            <p className="text-[11px] text-slate-500">No client IPs currently exceed protective threshold policies.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {activeRestrictions.map((item, idx) => (
              <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 font-mono text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-sm">{item.clientIp}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      {item.policy}
                    </span>
                    <span className="text-[11px] text-slate-400 font-sans">{item.reason}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-sans">
                    Enforced at {new Date(item.restrictedAt).toLocaleTimeString()} • Expires at {new Date(item.expiresAt).toLocaleTimeString()} • Repeat attempts: {item.hitCount}
                  </div>
                </div>

                <button
                  onClick={() => handleLift(item.clientIp)}
                  disabled={liftingIp === item.clientIp}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-emerald-950/60 text-slate-300 hover:text-emerald-300 border border-slate-700 hover:border-emerald-600/50 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-40"
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
      <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-xl space-y-3 p-5">
        <div className="flex items-center space-x-2">
          <Ban className="size-4 text-rose-400" />
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Blocked & Rate-Limited Telemetry History
          </h3>
        </div>

        {recentBlockedEvents.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-1">
            <CheckCircle2 className="size-8 mx-auto text-emerald-500/40" />
            <p className="text-xs font-bold text-slate-400">Zero Blocked Requests Logged</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-950/80 text-slate-400 text-[10px] uppercase font-black border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Client IP</th>
                  <th className="py-2.5 px-3">Target Endpoint</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Rule</th>
                  <th className="py-2.5 px-3">Defensive Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {recentBlockedEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                    <td className="py-2 px-3 text-white font-bold">{evt.clientIp}</td>
                    <td className="py-2 px-3 text-emerald-400 truncate max-w-xs">{evt.method} {evt.route}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300">
                        {evt.statusCode}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 font-sans text-[11px]">{evt.ruleId}</td>
                    <td className="py-2 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
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


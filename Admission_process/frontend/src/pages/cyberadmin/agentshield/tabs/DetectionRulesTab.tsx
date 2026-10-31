import React, { useState, useEffect } from 'react';
import agentshieldService, { DetectionRuleItem } from '../../../../services/agentshield.service';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Save,
  X,
  Shield,
  Clock,
  Layers,
} from 'lucide-react';

export const DetectionRulesTab: React.FC = () => {
  const [rules, setRules] = useState<DetectionRuleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<DetectionRuleItem | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRules = async () => {
    try {
      setRefreshing(true);
      const res = await agentshieldService.getRules();
      if (res.success) {
        setRules(res.data);
      }
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleToggleEnabled = async (rule: DetectionRuleItem) => {
    try {
      const res = await agentshieldService.updateRule(rule.id, { enabled: !rule.enabled });
      if (res.success) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? res.data : r)));
      }
    } catch (err: any) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    try {
      setSaving(true);
      setErrorMsg(null);
      const res = await agentshieldService.updateRule(editingRule.id, {
        threshold: editingRule.threshold,
        observationWindowSeconds: editingRule.observationWindowSeconds,
        riskLevel: editingRule.riskLevel,
        responsePolicy: editingRule.responsePolicy,
        description: editingRule.description,
      });

      if (res.success) {
        setRules((prev) => prev.map((r) => (r.id === editingRule.id ? res.data : r)));
        setEditingRule(null);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to update rule');
    } finally {
      setSaving(false);
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
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

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* ── Top Toolbar (No duplicate title) ── */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-200 dark:border-neutral-800 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-[#6D35E8] dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{rules.filter((r) => r.enabled).length} of {rules.length} Rules Active</span>
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
            Configured anomaly thresholds & automated response policies
          </span>
        </div>

        <button
          onClick={fetchRules}
          disabled={refreshing}
          className="self-start sm:self-auto flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 border border-slate-200 dark:border-neutral-700 transition shadow-2xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[#6D35E8]' : ''}`} />
          <span>Refresh Rules</span>
        </button>
      </div>

      {/* ── Rules Catalog Grid ── */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="size-10 rounded-full border-3 border-violet-500/20 border-t-violet-600 animate-spin mx-auto" />
          <p className="text-xs sm:text-sm font-bold text-neutral-500 uppercase tracking-wider mt-3">Loading detection rules...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-6 sm:p-7 rounded-2xl border bg-white dark:bg-neutral-900 transition shadow-sm hover:shadow-md space-y-5 flex flex-col justify-between ${
                rule.enabled
                  ? 'border-neutral-200/80 dark:border-neutral-800'
                  : 'border-neutral-200/50 dark:border-neutral-800/50 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono text-xs sm:text-sm font-extrabold text-violet-700 dark:text-violet-400">{rule.id}</span>
                    <span className="text-xs uppercase font-extrabold px-3 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                      {rule.category}
                    </span>
                  </div>

                  {/* Enable/Disable Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggleEnabled(rule)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 dark:bg-neutral-700" />
                  </label>
                </div>

                <h3 className="text-base sm:text-lg font-extrabold text-neutral-900 dark:text-white mb-2">{rule.name}</h3>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">{rule.description}</p>
              </div>

              <div className="space-y-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm font-mono">
                  <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Trigger Threshold</span>
                    <span className="text-neutral-900 dark:text-white font-bold">{rule.threshold} occurrences</span>
                  </div>
                  <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Sliding Window</span>
                    <span className="text-neutral-900 dark:text-white font-bold">{rule.observationWindowSeconds}s window</span>
                  </div>
                  <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Risk Assessment</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-extrabold uppercase border mt-1 ${getRiskBadge(rule.riskLevel)}`}>
                      {rule.riskLevel}
                    </span>
                  </div>
                  <div className="p-3 sm:p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80">
                    <span className="text-neutral-500 dark:text-neutral-400 text-xs block font-sans font-semibold">Defensive Policy</span>
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 mt-1">
                      {rule.responsePolicy}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-neutral-400 font-medium">
                    Last triggered: {rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString() : 'Never'}
                  </span>
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-xs sm:text-sm font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <Edit2 className="size-3.5" />
                    <span>Configure</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Edit Rule Modal ── */}
      {editingRule && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3.5 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/60">
                  <Sliders className="size-5 sm:size-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-neutral-900 dark:text-white text-base sm:text-lg">Configure Rule: {editingRule.id}</h3>
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">Update detection parameters and response policies</p>
                </div>
              </div>
              <button
                onClick={() => setEditingRule(null)}
                className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs sm:text-sm font-semibold">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 font-bold mb-1.5">Rule Description</label>
                <textarea
                  rows={2}
                  value={editingRule.description}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-3 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 font-bold mb-1.5">Trigger Threshold (count)</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={editingRule.threshold}
                    onChange={(e) => setEditingRule({ ...editingRule, threshold: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-2.5 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 font-bold mb-1.5">Window (seconds)</label>
                  <input
                    type="number"
                    min={5}
                    max={86400}
                    value={editingRule.observationWindowSeconds}
                    onChange={(e) => setEditingRule({ ...editingRule, observationWindowSeconds: parseInt(e.target.value, 10) || 10 })}
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-2.5 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 font-bold mb-1.5">Risk Level Mapping</label>
                  <select
                    value={editingRule.riskLevel}
                    onChange={(e) => setEditingRule({ ...editingRule, riskLevel: e.target.value as any })}
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-2.5 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 dark:text-neutral-300 font-bold mb-1.5">Defensive Response Policy</label>
                  <select
                    value={editingRule.responsePolicy}
                    onChange={(e) => setEditingRule({ ...editingRule, responsePolicy: e.target.value as any })}
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-2.5 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-xs"
                  >
                    <option value="MONITOR">MONITOR (Telemetry Only)</option>
                    <option value="RATE_LIMIT">RATE_LIMIT (Temporary IP Cooldown)</option>
                    <option value="BLOCK">BLOCK (Immediate Request Denial)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3.5 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition cursor-pointer shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white transition cursor-pointer disabled:opacity-50 flex items-center space-x-2 shadow-xs"
                >
                  <Save className="size-4" />
                  <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DetectionRulesTab;

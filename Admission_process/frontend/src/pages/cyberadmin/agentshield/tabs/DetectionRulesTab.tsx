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

  return (
    <div className="space-y-6">
      {/* ── Top Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>Configurable Detection Rules</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage detection parameters, anomaly thresholds, and automated defensive mitigation policies.
          </p>
        </div>

        <button
          onClick={fetchRules}
          disabled={refreshing}
          className="self-start sm:self-center flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ── Rules Catalog Grid ── */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-5 rounded-xl border bg-slate-900/60 transition shadow-lg space-y-4 flex flex-col justify-between ${
                rule.enabled ? 'border-slate-800' : 'border-slate-800/40 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[11px] font-black text-emerald-400">{rule.id}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
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
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                  </label>
                </div>

                <h3 className="text-sm font-bold text-white mb-1.5">{rule.name}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{rule.description}</p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                    <span className="text-slate-500 text-[10px] block font-sans">Trigger Threshold</span>
                    <span className="text-slate-200 font-bold">{rule.threshold} occurrences</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                    <span className="text-slate-500 text-[10px] block font-sans">Sliding Window</span>
                    <span className="text-slate-200 font-bold">{rule.observationWindowSeconds} seconds</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                    <span className="text-slate-500 text-[10px] block font-sans">Risk Assessment</span>
                    <span className="text-amber-400 font-bold">{rule.riskLevel}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800/60">
                    <span className="text-slate-500 text-[10px] block font-sans">Defensive Policy</span>
                    <span className="text-purple-400 font-bold">{rule.responsePolicy}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    Last triggered: {rule.lastTriggeredAt ? new Date(rule.lastTriggeredAt).toLocaleString() : 'Never'}
                  </span>
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                  >
                    <Edit2 className="size-3" />
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Sliders className="size-5 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">Configure Rule: {editingRule.id}</h3>
              </div>
              <button
                onClick={() => setEditingRule(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Rule Description</label>
                <textarea
                  rows={2}
                  value={editingRule.description}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Trigger Threshold (count)</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={editingRule.threshold}
                    onChange={(e) => setEditingRule({ ...editingRule, threshold: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Window (seconds)</label>
                  <input
                    type="number"
                    min={5}
                    max={86400}
                    value={editingRule.observationWindowSeconds}
                    onChange={(e) => setEditingRule({ ...editingRule, observationWindowSeconds: parseInt(e.target.value, 10) || 10 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Risk Level Mapping</label>
                  <select
                    value={editingRule.riskLevel}
                    onChange={(e) => setEditingRule({ ...editingRule, riskLevel: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Defensive Response Policy</label>
                  <select
                    value={editingRule.responsePolicy}
                    onChange={(e) => setEditingRule({ ...editingRule, responsePolicy: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="MONITOR">MONITOR (Telemetry Only)</option>
                    <option value="RATE_LIMIT">RATE_LIMIT (Temporary IP Cooldown)</option>
                    <option value="BLOCK">BLOCK (Immediate Request Denial)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black transition cursor-pointer disabled:opacity-50 flex items-center space-x-1"
                >
                  <Save className="size-3.5" />
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

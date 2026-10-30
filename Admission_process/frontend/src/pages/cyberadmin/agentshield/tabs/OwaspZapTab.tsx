import React, { useState, useEffect, useRef } from 'react';
import agentshieldService, { SecurityAssessmentItem, SecurityFindingItem } from '../../../../services/agentshield.service';
import {
  FileCode2,
  Upload,
  AlertTriangle,
  Flame,
  ShieldCheck,
  CheckCircle2,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Eye,
  X,
  FileText,
  Clock,
  Layers,
  Check,
} from 'lucide-react';

export const OwaspZapTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assessments, setAssessments] = useState<SecurityAssessmentItem[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<SecurityAssessmentItem | null>(null);
  const [findings, setFindings] = useState<SecurityFindingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Finding Detail & Remediation Modal State
  const [selectedFinding, setSelectedFinding] = useState<SecurityFindingItem | null>(null);
  const [findingStatus, setFindingStatus] = useState<string>('OPEN');
  const [remediationNotes, setRemediationNotes] = useState<string>('');
  const [savingStatus, setSavingStatus] = useState<boolean>(false);

  // Filters
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchAssessments = async () => {
    try {
      setLoading(true);
      const res = await agentshieldService.getAssessments();
      if (res.success && res.data.length > 0) {
        setAssessments(res.data);
        if (!selectedAssessmentId) {
          loadAssessmentDetail(res.data[0].id);
        }
      } else {
        setAssessments([]);
      }
    } catch (err) {
      console.error('Failed to load ZAP assessments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAssessmentDetail = async (id: string) => {
    try {
      setSelectedAssessmentId(id);
      const res = await agentshieldService.getAssessmentById(id);
      if (res.success) {
        setCurrentAssessment(res.data.assessment);
        setFindings(res.data.findings || []);
      }
    } catch (err) {
      console.error('Failed to load assessment detail:', err);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const res = await agentshieldService.importZapReport(file);
      if (res.success) {
        setUploadSuccess(res.message || 'Report imported successfully.');
        await fetchAssessments();
        loadAssessmentDetail(res.data.id);
      }
    } catch (err: any) {
      setUploadError(err.response?.data?.error || err.message || 'Failed to upload ZAP report.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveFindingStatus = async () => {
    if (!selectedFinding) return;

    try {
      setSavingStatus(true);
      const res = await agentshieldService.updateFindingStatus(selectedFinding.id, findingStatus, remediationNotes);
      if (res.success) {
        setFindings((prev) => prev.map((f) => (f.id === selectedFinding.id ? res.data : f)));
        setSelectedFinding(null);
      }
    } catch (err) {
      console.error('Failed to update finding status:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  const openFindingModal = (finding: SecurityFindingItem) => {
    setSelectedFinding(finding);
    setFindingStatus(finding.status);
    setRemediationNotes(finding.remediationNotes || '');
  };

  const filteredFindings = findings.filter((f) => {
    const matchesRisk = riskFilter === 'ALL' || f.risk === riskFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      f.alert.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.cweId && f.cweId.includes(searchQuery));
    return matchesRisk && matchesSearch;
  });

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'HIGH':
        return 'bg-rose-950/80 text-rose-300 border-rose-500/50';
      case 'MEDIUM':
        return 'bg-amber-950/80 text-amber-300 border-amber-500/50';
      case 'LOW':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-500/50';
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-500/50';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'IN_REVIEW':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'ACCEPTED_RISK':
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
      case 'REMEDIATED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar & Import Action ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center space-x-2">
            <span>OWASP ZAP Dynamic Security Assessments</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Ingest, review, and track remediation for dynamic application security testing (DAST) vulnerability scans.
          </p>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json,.xml"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black transition shadow-lg cursor-pointer disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            <span>{uploading ? 'Parsing & Ingesting...' : 'Import ZAP Report'}</span>
          </button>
        </div>
      </div>

      {uploadSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
          <span>✓ {uploadSuccess}</span>
          <button onClick={() => setUploadSuccess(null)}><X className="size-3.5" /></button>
        </div>
      )}

      {uploadError && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {uploadError}</span>
          <button onClick={() => setUploadError(null)}><X className="size-3.5" /></button>
        </div>
      )}

      {/* ── Assessment Selector & Findings Explorer ── */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="size-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mx-auto" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-slate-900/40 rounded-xl border border-slate-800 p-8">
          <FileCode2 className="size-12 mx-auto text-slate-600" />
          <h3 className="text-sm font-bold text-slate-300">No Security Assessments Uploaded Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Upload an exported OWASP ZAP scan report (JSON format) to inspect findings, mapped CWE vulnerabilities, and track remediation.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
          >
            Upload JSON Report
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Assessment Summary Header Card */}
          {currentAssessment && (
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-base">{currentAssessment.title}</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      {currentAssessment.tool}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Target: {currentAssessment.targetScope} • Scanned on {new Date(currentAssessment.scanDate).toLocaleDateString()} by {currentAssessment.importedBy}
                  </p>
                </div>

                {/* Other Assessments Selector */}
                {assessments.length > 1 && (
                  <select
                    value={selectedAssessmentId || ''}
                    onChange={(e) => loadAssessmentDetail(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
                  >
                    {assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({new Date(a.scanDate).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Severity Breakdown Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <span className="text-slate-500 text-[10px] block font-sans">Total Findings</span>
                  <span className="text-lg font-black text-white">{currentAssessment.totalFindings}</span>
                </div>
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30">
                  <span className="text-rose-400 text-[10px] block font-sans">High Risk</span>
                  <span className="text-lg font-black text-rose-300">{currentAssessment.highCount}</span>
                </div>
                <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30">
                  <span className="text-amber-400 text-[10px] block font-sans">Medium Risk</span>
                  <span className="text-lg font-black text-amber-300">{currentAssessment.mediumCount}</span>
                </div>
                <div className="p-3 rounded-lg bg-yellow-950/30 border border-yellow-500/30">
                  <span className="text-yellow-400 text-[10px] block font-sans">Low Risk</span>
                  <span className="text-lg font-black text-yellow-300">{currentAssessment.lowCount}</span>
                </div>
                <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/30">
                  <span className="text-blue-400 text-[10px] block font-sans">Informational</span>
                  <span className="text-lg font-black text-blue-300">{currentAssessment.informationalCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Findings Table ── */}
          <div className="bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden shadow-xl space-y-3 p-5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase font-black text-slate-300 tracking-wider">
                  Vulnerability Findings Inventory ({filteredFindings.length})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                  <option value="INFORMATIONAL">Informational</option>
                </select>

                <div className="relative min-w-[200px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search alert, URL, CWE..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:border-emerald-500 placeholder:text-slate-500"
                  />
                  <Search className="size-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {filteredFindings.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500/40 mb-2" />
                <p className="text-xs font-bold text-slate-300">No Findings Matching Filter</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 text-[10px] uppercase font-black border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Risk</th>
                      <th className="py-2.5 px-3">Alert / Vulnerability</th>
                      <th className="py-2.5 px-3">Affected Endpoint</th>
                      <th className="py-2.5 px-3">CWE</th>
                      <th className="py-2.5 px-3">Remediation Status</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredFindings.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getRiskColor(f.risk)}`}>
                            {f.risk}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-200 max-w-xs truncate" title={f.alert}>
                          {f.alert}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-400 max-w-sm truncate" title={f.url}>
                          [{f.method}] {f.url}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                          {f.cweId ? `CWE-${f.cweId}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusBadge(f.status)}`}>
                            {f.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openFindingModal(f)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-bold transition flex items-center space-x-1 ml-auto cursor-pointer"
                          >
                            <Eye className="size-3" />
                            <span>Remediate</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Finding Remediation Details Modal ── */}
      {selectedFinding && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getRiskColor(selectedFinding.risk)}`}>
                    {selectedFinding.risk}
                  </span>
                  {selectedFinding.cweId && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      CWE-{selectedFinding.cweId}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-white text-base">{selectedFinding.alert}</h3>
              </div>
              <button
                onClick={() => setSelectedFinding(null)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1">
                <span className="text-slate-500 text-[10px] font-sans block">Affected URL & Parameter</span>
                <div className="text-emerald-400 break-all">[{selectedFinding.method}] {selectedFinding.url}</div>
                {selectedFinding.param && <div className="text-slate-300">Parameter: {selectedFinding.param}</div>}
              </div>

              {selectedFinding.description && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Vulnerability Description</span>
                  <p className="text-slate-300 leading-relaxed font-sans">{selectedFinding.description}</p>
                </div>
              )}

              {selectedFinding.solution && (
                <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                  <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider">Recommended Solution</span>
                  <p className="text-emerald-200 leading-relaxed font-sans">{selectedFinding.solution}</p>
                </div>
              )}

              {/* Remediation Lifecycle Status Updater */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">
                  Remediation Tracking
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['OPEN', 'IN_REVIEW', 'ACCEPTED_RISK', 'REMEDIATED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFindingStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        findingStatus === st
                          ? 'bg-emerald-500 text-slate-950 font-black'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Remediation / Audit Notes:</label>
                  <textarea
                    rows={2}
                    value={remediationNotes}
                    onChange={(e) => setRemediationNotes(e.target.value)}
                    placeholder="Document patch commit, PR, or security exception..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setSelectedFinding(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={savingStatus}
                onClick={handleSaveFindingStatus}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black transition cursor-pointer disabled:opacity-50"
              >
                {savingStatus ? 'Saving...' : 'Save Remediation Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OwaspZapTab;


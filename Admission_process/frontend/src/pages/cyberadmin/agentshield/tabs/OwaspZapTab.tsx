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
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'MEDIUM':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'LOW':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'IN_REVIEW':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'ACCEPTED_RISK':
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700';
      case 'REMEDIATED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Bar & Import Action ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-neutral-200/80 dark:border-neutral-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-neutral-900 dark:text-white tracking-tight flex items-center space-x-2">
            <span>OWASP ZAP Dynamic Security Assessments</span>
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
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
            className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            <span>{uploading ? 'Parsing & Ingesting...' : 'Import ZAP Report'}</span>
          </button>
        </div>
      </div>

      {uploadSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between">
          <span>✓ {uploadSuccess}</span>
          <button onClick={() => setUploadSuccess(null)} className="cursor-pointer"><X className="size-4" /></button>
        </div>
      )}

      {uploadError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="cursor-pointer"><X className="size-4" /></button>
        </div>
      )}

      {/* ── Assessment Selector & Findings Explorer ── */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="size-8 rounded-full border-2 border-violet-500/20 border-t-violet-600 animate-spin mx-auto" />
          <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mt-2">Loading assessments...</p>
        </div>
      ) : assessments.length === 0 ? (
        <div className="py-20 text-center space-y-3 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 p-8 shadow-sm">
          <FileCode2 className="size-12 mx-auto text-neutral-400" />
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">No Security Assessments Uploaded Yet</h3>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            Upload an exported OWASP ZAP scan report (JSON format) to inspect findings, mapped CWE vulnerabilities, and track remediation.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition shadow-sm cursor-pointer"
          >
            Upload JSON Report
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Assessment Summary Header Card */}
          {currentAssessment && (
            <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-neutral-900 dark:text-white text-base">{currentAssessment.title}</span>
                    <span className="text-[10px] font-mono font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 px-2.5 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                      {currentAssessment.tool}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Target: {currentAssessment.targetScope} • Scanned on {new Date(currentAssessment.scanDate).toLocaleDateString()} by {currentAssessment.importedBy}
                  </p>
                </div>

                {/* Other Assessments Selector */}
                {assessments.length > 1 && (
                  <select
                    value={selectedAssessmentId || ''}
                    onChange={(e) => loadAssessmentDetail(e.target.value)}
                    className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 cursor-pointer shadow-sm"
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
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 border-l-4 border-l-violet-500">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[10px] block font-semibold uppercase tracking-wider">Total Findings</span>
                  <span className="text-2xl font-black text-neutral-900 dark:text-white leading-none mt-1 block">{currentAssessment.totalFindings}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 border-l-4 border-l-rose-500">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[10px] block font-semibold uppercase tracking-wider">High Risk</span>
                  <span className="text-2xl font-black text-rose-600 dark:text-rose-400 leading-none mt-1 block">{currentAssessment.highCount}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 border-l-4 border-l-amber-500">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[10px] block font-semibold uppercase tracking-wider">Medium Risk</span>
                  <span className="text-2xl font-black text-amber-600 dark:text-amber-400 leading-none mt-1 block">{currentAssessment.mediumCount}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 border-l-4 border-l-yellow-500">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[10px] block font-semibold uppercase tracking-wider">Low Risk</span>
                  <span className="text-2xl font-black text-yellow-600 dark:text-yellow-400 leading-none mt-1 block">{currentAssessment.lowCount}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 border-l-4 border-l-blue-500">
                  <span className="text-neutral-500 dark:text-neutral-400 text-[10px] block font-semibold uppercase tracking-wider">Informational</span>
                  <span className="text-2xl font-black text-blue-600 dark:text-blue-400 leading-none mt-1 block">{currentAssessment.informationalCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Findings Table ── */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden shadow-sm space-y-4 p-5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase font-extrabold text-neutral-900 dark:text-white tracking-wider">
                  Vulnerability Findings Inventory ({filteredFindings.length})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value)}
                  className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 cursor-pointer shadow-sm"
                >
                  <option value="ALL">All Risk Levels</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                  <option value="INFORMATIONAL">Informational</option>
                </select>

                <div className="relative min-w-[220px]">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search alert, URL, CWE..."
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 placeholder:text-neutral-400 shadow-sm"
                  />
                  <Search className="size-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {filteredFindings.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 space-y-1">
                <CheckCircle2 className="size-8 mx-auto text-emerald-500/60 mb-1" />
                <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">No Findings Matching Filter</p>
                <p className="text-[11px] text-neutral-400">All scanned components clear with current filter selection.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50/80 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 text-[10px] uppercase font-bold border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-3">Risk</th>
                      <th className="py-2.5 px-3">Alert / Vulnerability</th>
                      <th className="py-2.5 px-3">Affected Endpoint</th>
                      <th className="py-2.5 px-3">CWE</th>
                      <th className="py-2.5 px-3">Remediation Status</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60 font-sans">
                    {filteredFindings.map((f) => (
                      <tr key={f.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getRiskColor(f.risk)}`}>
                            {f.risk}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-neutral-800 dark:text-neutral-200 max-w-xs truncate" title={f.alert}>
                          {f.alert}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-violet-600 dark:text-violet-400 max-w-sm truncate" title={f.url}>
                          [{f.method}] {f.url}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-neutral-500 dark:text-neutral-400 text-[11px] whitespace-nowrap">
                          {f.cweId ? `CWE-${f.cweId}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(f.status)}`}>
                            {f.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openFindingModal(f)}
                            className="px-2.5 py-1 rounded-xl bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 text-xs font-bold transition flex items-center space-x-1 ml-auto cursor-pointer shadow-sm"
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${getRiskColor(selectedFinding.risk)}`}>
                    {selectedFinding.risk}
                  </span>
                  {selectedFinding.cweId && (
                    <span className="text-[10px] font-mono font-bold text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700">
                      CWE-{selectedFinding.cweId}
                    </span>
                  )}
                </div>
                <h3 className="font-extrabold text-neutral-900 dark:text-white text-base leading-snug">{selectedFinding.alert}</h3>
              </div>

              <button
                onClick={() => setSelectedFinding(null)}
                className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 font-mono text-[11px] space-y-1">
                <span className="text-neutral-500 dark:text-neutral-400 text-[10px] font-sans font-semibold block">Affected URL & Parameter</span>
                <div className="text-violet-600 dark:text-violet-400 break-all font-semibold">[{selectedFinding.method}] {selectedFinding.url}</div>
                {selectedFinding.param && <div className="text-neutral-700 dark:text-neutral-300">Parameter: {selectedFinding.param}</div>}
              </div>

              {selectedFinding.description && (
                <div className="p-3.5 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-1">
                  <span className="text-[10px] uppercase font-black text-neutral-500 dark:text-neutral-400 tracking-wider">Vulnerability Description</span>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed font-sans">{selectedFinding.description}</p>
                </div>
              )}

              {selectedFinding.solution && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/80 space-y-1">
                  <span className="text-[10px] uppercase font-black text-emerald-700 dark:text-emerald-400 tracking-wider">Recommended Solution</span>
                  <p className="text-emerald-900 dark:text-emerald-200 leading-relaxed font-sans font-medium">{selectedFinding.solution}</p>
                </div>
              )}

              {/* Remediation Lifecycle Status Updater */}
              <div className="p-4 rounded-xl bg-neutral-50/70 dark:bg-neutral-800/40 border border-neutral-200/80 dark:border-neutral-700/80 space-y-3">
                <span className="text-[10px] uppercase font-black text-neutral-500 dark:text-neutral-400 tracking-wider block">
                  Remediation Tracking
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['OPEN', 'IN_REVIEW', 'ACCEPTED_RISK', 'REMEDIATED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFindingStatus(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm ${
                        findingStatus === st
                          ? 'bg-violet-600 text-white font-extrabold'
                          : 'bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300 block mb-1">Remediation / Audit Notes:</label>
                  <textarea
                    rows={2}
                    value={remediationNotes}
                    onChange={(e) => setRemediationNotes(e.target.value)}
                    placeholder="Document patch commit, PR, or security exception..."
                    className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl p-2.5 text-neutral-800 dark:text-neutral-200 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setSelectedFinding(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition cursor-pointer shadow-sm"
              >
                Close
              </button>
              <button
                type="button"
                disabled={savingStatus}
                onClick={handleSaveFindingStatus}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white transition cursor-pointer disabled:opacity-50 shadow-sm"
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

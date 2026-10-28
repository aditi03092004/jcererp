import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../../services/api';
import admissionService from '../../../services/admission.service';
import { 
  ArrowLeft, Download, RefreshCw, Loader2, HelpCircle, CheckCircle2, FileArchive, AlertTriangle, AlertCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getAcademicYear } from '../../../utils/date.util';

interface ExportJob {
  id: string;
  academicYear: string;
  branchId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  totalStudents: number;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  progress: number;
  zipSize?: number | null;
  error?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export const BulkDocumentExportPage: React.FC = () => {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<{ id: string; name: string; code: string }[]>([]);
  const [academicYear, setAcademicYear] = useState(getAcademicYear());
  const [branchId, setBranchId] = useState('ALL');
  
  // Preview State
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ studentCount: number; documentCount: number } | null>(null);
  
  // Active Export Job State
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [jobLoading, setJobLoading] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const pollTimerRef = useRef<any>(null);

  const fetchBranches = async () => {
    try {
      const list = await admissionService.getBranches();
      setBranches(list);
    } catch (err) {
      console.error('Failed to load branches:', err);
      toast.error('Failed to load branch list.');
    }
  };

  /**
   * Restores active job from localStorage if present, or checks for active/completed job for current filter.
   */
  const restoreOrCheckActiveJob = async () => {
    const savedJobId = localStorage.getItem('activeBulkExportJobId');
    if (savedJobId) {
      try {
        const res = await API.get(`/admin/documents/bulk-export/${savedJobId}`);
        if (res.data?.success && res.data.job) {
          const job: ExportJob = res.data.job;
          setActiveJob(job);
          if (job.academicYear) setAcademicYear(job.academicYear);
          if (job.branchId) setBranchId(job.branchId);

          if (['QUEUED', 'PROCESSING'].includes(job.status)) {
            startPollingJob(job.id);
          }
          return;
        } else {
          localStorage.removeItem('activeBulkExportJobId');
        }
      } catch (err) {
        console.warn('Saved job not found or failed to load:', err);
        localStorage.removeItem('activeBulkExportJobId');
      }
    }

    // If no saved job, check active job for current filter
    checkActiveJobForFilters(academicYear, branchId);
  };

  const checkActiveJobForFilters = async (year: string, branch: string) => {
    try {
      const res = await API.get('/admin/documents/bulk-export/active', {
        params: { academicYear: year, branchId: branch }
      });
      if (res.data?.success && res.data.job) {
        const job: ExportJob = res.data.job;
        setActiveJob(job);
        if (['QUEUED', 'PROCESSING'].includes(job.status)) {
          startPollingJob(job.id);
        }
      } else {
        // If not actively processing, clear job card if filters don't match
        setActiveJob(null);
      }
    } catch (err) {
      console.warn('Unable to check active export job:', err);
    }
  };

  useEffect(() => {
    fetchBranches();
    restoreOrCheckActiveJob();
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const startPollingJob = (jobId: string) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    localStorage.setItem('activeBulkExportJobId', jobId);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await API.get(`/admin/documents/bulk-export/${jobId}`);
        if (res.data?.success && res.data.job) {
          const updatedJob: ExportJob = res.data.job;

          setActiveJob((prev) => {
            const effectiveTotal = (updatedJob.totalDocuments && updatedJob.totalDocuments > 0)
              ? updatedJob.totalDocuments
              : (prev?.totalDocuments || previewData?.documentCount || 0);

            const effectiveProgress = (updatedJob.status === 'COMPLETED' || updatedJob.status === 'COMPLETED_WITH_ERRORS')
              ? 100
              : (updatedJob.progress > 0 
                  ? updatedJob.progress 
                  : (effectiveTotal > 0 ? Math.min(99, Math.round((updatedJob.processedDocuments / effectiveTotal) * 100)) : 0));

            return {
              ...updatedJob,
              totalDocuments: effectiveTotal,
              totalStudents: (updatedJob.totalStudents && updatedJob.totalStudents > 0)
                ? updatedJob.totalStudents
                : (prev?.totalStudents || previewData?.studentCount || 0),
              progress: effectiveProgress,
            };
          });

          if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(updatedJob.status)) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;

            if (updatedJob.status === 'COMPLETED') {
              toast.success('Bulk document package is ready for download!');
            } else if (updatedJob.status === 'COMPLETED_WITH_ERRORS') {
              toast.warn('Package ready with minor missing document notices.');
            } else if (updatedJob.status === 'FAILED') {
              toast.error(`Export failed: ${updatedJob.error || 'Unknown error'}`);
            }
          }
        }
      } catch (err) {
        console.error('Error polling bulk export job status:', err);
      }
    }, 2000);
  };

  const handlePreview = async () => {
    if (!academicYear) {
      toast.error('Please select an Academic Year.');
      return;
    }
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const res = await API.get('/admin/documents/export/preview', {
        params: { academicYear, branchId }
      });
      if (res.data?.success) {
        setPreviewData({
          studentCount: res.data.studentCount,
          documentCount: res.data.documentCount
        });
        toast.success('Preview loaded.');
      } else {
        toast.error(res.data?.error || 'Failed to load preview statistics.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to retrieve preview details.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStartExport = async () => {
    if (!academicYear) {
      toast.error('Please select an Academic Year.');
      return;
    }
    setJobLoading(true);
    try {
      const res = await API.post('/admin/documents/bulk-export', {
        academicYear,
        branchId
      });
      if (res.data?.success && res.data.jobId) {
        const newJobId = res.data.jobId;
        localStorage.setItem('activeBulkExportJobId', newJobId);

        // Immediately show the active export progress UI
        const initialJob: ExportJob = {
          id: newJobId,
          academicYear,
          branchId,
          status: 'QUEUED',
          totalStudents: previewData?.studentCount || 0,
          totalDocuments: previewData?.documentCount || 0,
          processedDocuments: 0,
          failedDocuments: 0,
          progress: 0,
        };
        setActiveJob(initialJob);

        toast.info('Bulk export job queued. Generating package in background...');
        startPollingJob(newJobId);
      } else {
        toast.error(res.data?.error || 'Failed to start bulk export job.');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to initialize bulk export job.');
    } finally {
      setJobLoading(false);
    }
  };

  const handleDownloadZip = async (jobId: string) => {
    setDownloadingFile(true);
    const toastId = toast.loading('Preparing secure ZIP package download...');
    try {
      // 1. Fetch metadata and signed download URL
      const metaRes = await API.get(`/admin/documents/bulk-export/${jobId}/download`);
      const targetFilename = metaRes.data?.filename || `VTU_Documents_${academicYear}_${branchId}.zip`;
      const downloadUrl = metaRes.data?.downloadUrl;

      // 2. If signed direct download URL (Cloudflare R2) is available, download directly from storage
      if (downloadUrl && (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))) {
        toast.dismiss(toastId);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', targetFilename);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success(`Download started!`);
        return;
      }

      // 3. Otherwise trigger authenticated direct stream download from backend
      const token = localStorage.getItem('token') || '';
      const streamUrl = `${API.defaults.baseURL || ''}/admin/documents/bulk-export/${jobId}/download-file${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      
      toast.dismiss(toastId);
      window.location.href = streamUrl;
      toast.success('Download started!');
    } catch (err: any) {
      console.error('Download failure:', err);
      toast.dismiss(toastId);

      let errorMessage = 'Failed to download ZIP archive.';
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }

      toast.error(errorMessage);
    } finally {
      setDownloadingFile(false);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  };

  const isJobActive = activeJob && ['QUEUED', 'PROCESSING'].includes(activeJob.status);

  return (
    <div className="p-6 max-w-4xl mx-auto min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate(-1)}
          className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/80 hover:bg-neutral-50 rounded-2xl transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} className="text-neutral-700 dark:text-neutral-300" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-neutral-900 dark:text-white uppercase tracking-wider">Bulk Document Export</h1>
          <p className="text-xs text-neutral-550 dark:text-neutral-450 font-medium">Export all finalized student documents into a single structured ZIP archive for university VTU submission.</p>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/80 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Academic Year Dropdown */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-450 dark:text-neutral-500">
              Academic Year <span className="text-rose-500">*</span>
            </label>
            <select
              value={academicYear}
              disabled={isJobActive || false}
              onChange={(e) => {
                const newYear = e.target.value;
                setAcademicYear(newYear);
                setPreviewData(null);
                if (!isJobActive) {
                  checkActiveJobForFilters(newYear, branchId);
                }
              }}
              className="w-full h-11 px-3.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all disabled:opacity-50"
            >
              <option value="2026-2027">2026-2027</option>
              <option value="2026-27">2026-27</option>
              <option value="2025-2026">2025-2026</option>
              <option value="2025-26">2025-26</option>
              <option value="2027-2028">2027-2028</option>
              <option value="2027-28">2027-28</option>
            </select>
          </div>

          {/* Department Dropdown */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-450 dark:text-neutral-500">
              Branch / Department
            </label>
            <select
              value={branchId}
              disabled={isJobActive || false}
              onChange={(e) => {
                const newBranch = e.target.value;
                setBranchId(newBranch);
                setPreviewData(null);
                if (!isJobActive) {
                  checkActiveJobForFilters(academicYear, newBranch);
                }
              }}
              className="w-full h-11 px-3.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all disabled:opacity-50"
            >
              <option value="ALL">All Branches / Departments</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons row */}
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-neutral-100 dark:border-neutral-800/60">
          <button
            onClick={handlePreview}
            disabled={previewLoading || isJobActive || false}
            className="px-5 py-3 border border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 text-neutral-800 dark:text-neutral-200 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Run Preview Count
          </button>

          <button
            onClick={handleStartExport}
            disabled={jobLoading || isJobActive || false}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-800 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-indigo-600/10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {jobLoading || isJobActive ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isJobActive ? 'Export Package In Progress...' : 'Download Package (ZIP)'}
          </button>
        </div>
      </div>

      {/* Active Export Job Progress Card */}
      {activeJob && (
        <div className={`mt-8 border rounded-3xl p-6 md:p-8 space-y-5 transition-all ${
          activeJob.status === 'COMPLETED'
            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
            : activeJob.status === 'COMPLETED_WITH_ERRORS'
            ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
            : activeJob.status === 'FAILED'
            ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
            : 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/50'
        }`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                ['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(activeJob.status)
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                  : activeJob.status === 'FAILED'
                  ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                  : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
              }`}>
                {isJobActive ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : ['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(activeJob.status) ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <AlertCircle size={20} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-neutral-900 dark:text-white uppercase tracking-wide">
                    {activeJob.status === 'QUEUED' && 'Export Queued'}
                    {activeJob.status === 'PROCESSING' && 'Generating Bulk ZIP Package'}
                    {activeJob.status === 'COMPLETED' && '✓ Package Ready'}
                    {activeJob.status === 'COMPLETED_WITH_ERRORS' && '✓ Package Ready (With Minor Notices)'}
                    {activeJob.status === 'FAILED' && 'Export Failed'}
                  </h3>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-700">
                    {activeJob.academicYear} • {activeJob.branchId}
                  </span>
                </div>
                <p className="text-xs text-neutral-550 dark:text-neutral-400 mt-0.5">
                  {isJobActive && 'Downloads documents from Cloudflare R2 into ONE ZIP archive in background.'}
                  {activeJob.status === 'COMPLETED' && `Single ZIP file ready (${formatFileSize(activeJob.zipSize)})`}
                  {activeJob.status === 'COMPLETED_WITH_ERRORS' && `Single ZIP file ready (${formatFileSize(activeJob.zipSize)}). See EXPORT_SUMMARY.txt for details.`}
                  {activeJob.status === 'FAILED' && (activeJob.error || 'Job failed to complete.')}
                </p>
              </div>
            </div>

            {/* Action Buttons on Completion or Failure */}
            <div className="flex items-center gap-3 shrink-0">
              {['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(activeJob.status) && (
                <button
                  onClick={() => handleDownloadZip(activeJob.id)}
                  disabled={downloadingFile}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-emerald-600/10 cursor-pointer disabled:opacity-50"
                >
                  {downloadingFile ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download ZIP Package
                </button>
              )}

              {activeJob.status === 'FAILED' && (
                <button
                  onClick={() => {
                    localStorage.removeItem('activeBulkExportJobId');
                    handleStartExport();
                  }}
                  disabled={jobLoading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-rose-600/10"
                >
                  <RefreshCw size={14} />
                  Retry Export
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar & Counter */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-700 dark:text-neutral-300">
              <span>Progress: {activeJob.progress}%</span>
              <span>
                Processed: {activeJob.processedDocuments} / {activeJob.totalDocuments || '?'} docs
                {activeJob.failedDocuments > 0 && ` (${activeJob.failedDocuments} missing)`}
              </span>
            </div>

            <div className="w-full h-3 bg-neutral-200/70 dark:bg-neutral-800 rounded-full overflow-hidden p-0.5">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  ['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(activeJob.status)
                    ? 'bg-emerald-500'
                    : activeJob.status === 'FAILED'
                    ? 'bg-rose-500'
                    : 'bg-indigo-600 progress-bar-animated'
                }`}
                style={{ width: `${Math.max(activeJob.progress, isJobActive ? 4 : 0)}%` }}
              />
            </div>
          </div>

          {/* Warning Banner if completed with partial errors */}
          {activeJob.status === 'COMPLETED_WITH_ERRORS' && (
            <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Notice: </strong>
                {activeJob.failedDocuments} document(s) could not be retrieved after 3 retries. An <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded">EXPORT_SUMMARY.txt</code> file has been bundled inside the ZIP listing the exact missing files.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Summary Card */}
      {previewData && (
        <div className="mt-8 bg-emerald-50/40 dark:bg-emerald-950/10 border border-emerald-250/30 dark:border-emerald-900/30 rounded-3xl p-6 md:p-8 animate-fade-in flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100/55 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-450 border border-emerald-200/50 dark:border-emerald-900/50 rounded-2xl flex items-center justify-center shrink-0">
              <FileArchive size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white uppercase tracking-wide">Ready for packaged download</h3>
              <p className="text-xs text-neutral-550 dark:text-neutral-450 mt-0.5">Found finalized, verified applicants matching your criteria.</p>
            </div>
          </div>

          <div className="flex items-center gap-6 self-stretch md:self-auto justify-around bg-white/50 dark:bg-neutral-900/60 border border-emerald-200/40 dark:border-neutral-800/40 p-4.5 rounded-2xl shrink-0">
            <div className="text-center px-4">
              <span className="block text-2xl font-black text-neutral-900 dark:text-white">{previewData.studentCount}</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-450 dark:text-neutral-550">Students</span>
            </div>
            <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800" />
            <div className="text-center px-4">
              <span className="block text-2xl font-black text-neutral-900 dark:text-white">{previewData.documentCount}</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-450 dark:text-neutral-550">Documents</span>
            </div>
          </div>
        </div>
      )}

      {/* Information guidelines box */}
      <div className="mt-8 bg-neutral-100 dark:bg-neutral-900/40 border border-neutral-250/20 dark:border-neutral-800/60 rounded-3xl p-6 md:p-8 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle size={16} className="text-neutral-450" />
          <h4 className="text-xs font-black uppercase tracking-wider text-neutral-800 dark:text-neutral-200">Export Information & Architecture</h4>
        </div>
        <p className="text-xs text-neutral-550 dark:text-neutral-450 leading-relaxed">
          The export system uses an asynchronous worker architecture. All documents are fetched from Cloudflare R2 with controlled concurrency and packaged into <strong>ONE ZIP archive</strong>.
        </p>
        <p className="text-xs text-neutral-550 dark:text-neutral-450 leading-relaxed">
          The archive will contain a structured layout: <code className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-800 rounded">[Academic Year]/[Branch]/[Student Name - Application Number]/[Documents...]</code>. An audit log <code className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-800 rounded">EXPORT_SUMMARY.txt</code> will be bundled inside specifying package metrics.
        </p>
      </div>
    </div>
  );
};

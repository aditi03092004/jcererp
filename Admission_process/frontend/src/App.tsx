import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Toaster as HotToaster } from 'react-hot-toast';
import { store, RootState } from './store';
import API from './services/api';
import { loginSuccess } from './store/authSlice';
import { forceLogout } from './utils/auth.utils';
import { activityHeartbeat } from './services/activityHeartbeat';

// ─── Shared Layouts ───────────────────────────────────────────────────────────
import ProtectedLayout from './components/layout/ProtectedLayout';
import AdminLayout from './components/layout/AdminLayout';
import PrincipalLayout from './components/layout/PrincipalLayout';
import DeanLayout from './components/layout/DeanLayout';
import HodLayout from './components/layout/HodLayout';
import FacultyLayout from './components/layout/FacultyLayout';
import StudentLayout from './components/layout/StudentLayout';
import CyberAdminLayout from './components/layout/CyberAdminLayout';
import AgentShieldDashboard from './pages/cyberadmin/agentshield/AgentShieldDashboard';
import TopLoadingBar from './components/common/TopLoadingBar';
import PwaManager from './components/PwaManager';

// ─── Student Pages ────────────────────────────────────────────────────────────
import StudentOverviewPage from './pages/student/StudentOverviewPage';
import StudentAttendancePage from './pages/student/StudentAttendancePage';
import StudentMarksPage from './pages/student/StudentMarksPage';
import StudentProfilePage from './pages/student/StudentProfilePage';

// ─── Faculty Pages ────────────────────────────────────────────────────────────
import FacultyOverviewPage from './pages/faculty/FacultyOverviewPage';
import FacultyAttendancePage from './pages/faculty/FacultyAttendancePage';
import FacultyAllSubjectAttendancePage from './pages/faculty/FacultyAllSubjectAttendancePage';
import FacultyStudentAttendancePage from './pages/faculty/FacultyStudentAttendancePage';
import FacultyAnalyticsPage from './pages/faculty/FacultyAnalyticsPage';
import FacultyProfilePage from './pages/faculty/FacultyProfilePage';

// ─── Faculty Bitwise Marks Pages ──────────────────────────────────────────────
import FacultyMarksDashboardPage from './pages/faculty/marks/FacultyMarksDashboardPage';
import FacultyMarksSubjectSelectPage from './pages/faculty/marks/FacultyMarksSubjectSelectPage';
import FacultyMarksConfigPage from './pages/faculty/marks/FacultyMarksConfigPage';
import FacultyMarksGridPage from './pages/faculty/marks/FacultyMarksGridPage';
import FacultyAssignmentConfigPage from './pages/faculty/marks/FacultyAssignmentConfigPage';
import FacultyAssignmentMarksPage from './pages/faculty/marks/FacultyAssignmentMarksPage';
import FacultyFinalInternalMarksPage from './pages/faculty/marks/FacultyFinalInternalMarksPage';
import FacultyExternalMarksPage from './pages/faculty/marks/FacultyExternalMarksPage';

// ─── Common Pages ─────────────────────────────────────────────────────────────
import LoginPage from './pages/common/LoginPage';
import LandingPage from './pages/common/LandingPage';
import { AdmissionTypeSelection } from './pages/common/AdmissionTypeSelection';
import { ProvisionalAcknowledgement } from './pages/common/ProvisionalAcknowledgement';
import ModuleUnavailablePage from './pages/common/ModuleUnavailablePage';
import PrivacyPolicyPage from './pages/common/PrivacyPolicyPage';
import TermsOfUsePage from './pages/common/TermsOfUsePage';

// ─── Dean Pages ───────────────────────────────────────────────────────────────
import DeanDashboardPage from './pages/dean/DeanDashboardPage';
import DepartmentsPage from './pages/dean/academic/DepartmentsPage';
import DepartmentAcademicInfoPage from './pages/dean/academic/DepartmentAcademicInfoPage';
import HodListPage from './pages/dean/hod/HodListPage';
import CreateHodPage from './pages/dean/hod/CreateHodPage';
import HodDetailPage from './pages/dean/hod/HodDetailPage';
import HodAssignmentPage from './pages/dean/hod/HodAssignmentPage';
import HodHistoryPage from './pages/dean/hod/HodHistoryPage';
import FacultyListPage from './pages/dean/faculty/FacultyListPage';
import DeanCreateFacultyPage from './pages/dean/faculty/DeanCreateFacultyPage';
import DeanBulkFacultyImportPage from './pages/dean/faculty/DeanBulkFacultyImportPage';
import DeanArchivedFacultyPage from './pages/dean/faculty/DeanArchivedFacultyPage';
import FacultyAuthorizationPage from './pages/dean/faculty/FacultyAuthorizationPage';
import FacultyReviewPage from './pages/dean/faculty/FacultyReviewPage';
import FacultyAssignmentsPage from './pages/dean/faculty/FacultyAssignmentsPage';
import DeanFacultyDetailPage from './pages/dean/faculty/DeanFacultyDetailPage';
import DeanFacultyRegeneratePasswordPage from './pages/dean/faculty/DeanFacultyRegeneratePasswordPage';
import DeanArchiveFacultyPage from './pages/dean/faculty/DeanArchiveFacultyPage';
import DeanProfilePage from './pages/dean/DeanProfilePage';
import DeanGoogleDriveBackupPage from './pages/dean/settings/DeanGoogleDriveBackupPage';

// ─── HOD Pages ────────────────────────────────────────────────────────────────
import HodDashboardPage from './pages/hod/HodDashboardPage';
import HodStudentsPage from './pages/hod/HodStudentsPage';
import HodStudentsSemesterPage from './pages/hod/HodStudentsSemesterPage';
import HodSemesterCohortPage from './pages/hod/HodSemesterCohortPage';
import HodStudentsSectionPage from './pages/hod/HodStudentsSectionPage';
import HodSectionDetailPage from './pages/hod/HodSectionDetailPage';
import HodSectionAllocatePage from './pages/hod/HodSectionAllocatePage';
import HodStudentDetailPage from './pages/hod/HodStudentDetailPage';
import HodFacultyListPage from './pages/hod/HodFacultyListPage';
import HodFacultyManagePage from './pages/hod/HodFacultyManagePage';
import HodFacultyAssignmentsPage from './pages/hod/HodFacultyAssignmentsPage';
import HodSubjectsPage from './pages/hod/HodSubjectsPage';
import HodAttendanceOverviewPage from './pages/hod/HodAttendanceOverviewPage';
import HodAttendanceDefaultersPage from './pages/hod/HodAttendanceDefaultersPage';
import HodAcademicsOverviewPage from './pages/hod/HodAcademicsOverviewPage';
import HodBitwiseAnalysisPage from './pages/hod/HodBitwiseAnalysisPage';
import HodStudentPerformancePage from './pages/hod/HodStudentPerformancePage';
import HodReportsPage from './pages/hod/HodReportsPage';
import HodSettingsPage from './pages/hod/HodSettingsPage';
import HodProfilePage from './pages/hod/HodProfilePage';
import HodPublishAttendanceMarksPage from './pages/hod/HodPublishAttendanceMarksPage';

// ─── Admission Portal ─────────────────────────────────────────────────────────
import { AuthProvider as AdmissionAuthProvider } from './pages/admission/src/context/AuthContext';
import AdmissionLogin from './pages/admission/src/pages/Login';
import AdmissionRegister from './pages/admission/src/pages/Register';
import AdmissionAuthLayout from './pages/admission/src/layouts/AuthLayout';
import AdmissionDashboardLayout from './pages/admission/src/layouts/DashboardLayout';
import AdmissionStudentDashboard from './pages/admission/src/pages/student/StudentDashboard';
import AdmissionForm from './pages/admission/src/pages/student/AdmissionForm';
import { ProvisionalAdmissionForm } from './pages/admission/src/pages/student/ProvisionalAdmissionForm';
import AdmissionSupportPage from './pages/admission/src/pages/student/SupportPage';
import AdmissionCancellationPage from './pages/admission/src/pages/student/AdmissionCancellationPage';
import './pages/admission/src/index.css';

// ─── Admin Pages ──────────────────────────────────────────────────────────────
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdmissionQueuePage from './pages/admin/admissions/AdmissionQueuePage';
import AdmissionReviewPage from './pages/admin/admissions/AdmissionReviewPage';
import DocumentVerificationWorkspace from './pages/admin/admissions/DocumentVerificationWorkspace';
import { AdminProvisionalAdmissionsPage } from './pages/admin/admissions/AdminProvisionalAdmissionsPage';
import PrincipalManagementPage from './pages/admin/users/PrincipalManagementPage';
import StudentsDashboardPage from './pages/admin/admissions/StudentsDashboardPage';
import CancellationRequestsPage from './pages/admin/admissions/CancellationRequestsPage';
import { StudentViewPage } from './pages/admin/admissions/StudentViewPage';
import AdminUsnAllocationPage from './pages/admin/admissions/AdminUsnAllocationPage';
import { AdminStudentDocumentsPage } from './pages/admin/admissions/AdminStudentDocumentsPage';
import { BulkDocumentExportPage } from './pages/admin/admissions/BulkDocumentExportPage';
import { AdminPromotionPage } from './pages/admin/admissions/AdminPromotionPage';
import { StudentExportPage } from './pages/admin/admissions/StudentExportPage';
import { ExistingStudentOnboardingPage } from './pages/admin/students/ExistingStudentOnboardingPage';

import AdminNotificationsPage from './pages/admin/communications/AdminNotificationsPage';
import AdminAnnouncementsPage from './pages/admin/communications/AdminAnnouncementsPage';
import AdminAnalyticsPage from './pages/admin/analytics/AdminAnalyticsPage';
import AdminProfilePage from './pages/admin/AdminProfilePage';
import CredentialManagementPage from './pages/admin/settings/CredentialManagementPage';
import AdminSystemSettingsPage from './pages/admin/settings/AdminSystemSettingsPage';
import AdminAuditLogsPage from './pages/admin/settings/AdminAuditLogsPage';

import PrincipalDashboardPage from './pages/principal/PrincipalDashboardPage';
import PrincipalFacultyListPage from './pages/principal/PrincipalFacultyListPage';
import CollegeAnalyticsPage from './pages/principal/CollegeAnalyticsPage';
import ReportGenerationPage from './pages/principal/ReportGenerationPage';
import PrincipalProfilePage from './pages/principal/PrincipalProfilePage';
import { PrincipalAdmissionQueuePage } from './pages/principal/PrincipalAdmissionQueuePage';
import { PrincipalAdmissionReviewPage } from './pages/principal/PrincipalAdmissionReviewPage';
import { PrincipalFacultyAuthorizationPage } from './pages/principal/PrincipalFacultyAuthorizationPage';
import { PrincipalFacultyReviewPage } from './pages/principal/PrincipalFacultyReviewPage';
import GlobalFooter from './components/common/GlobalFooter';

// ─── Fallback Pages ───────────────────────────────────────────────────────────
const UnauthorizedPage: React.FC = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col justify-between items-center p-6 text-center text-white">
    <div className="my-auto flex flex-col items-center justify-center">
      <h1 className="text-4xl font-extrabold text-rose-500">403 — Access Denied</h1>
      <p className="text-slate-400 mt-2 text-sm">You do not have permission to view this resource.</p>
      <a href="/login" className="mt-6 text-indigo-400 hover:underline text-sm font-semibold">Back to Login</a>
    </div>
    <GlobalFooter isDark className="mt-auto z-10 bg-transparent border-transparent" />
  </div>
);

const NotFoundPage: React.FC = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col justify-between items-center p-6 text-center text-white">
    <div className="my-auto flex flex-col items-center justify-center">
      <h1 className="text-4xl font-extrabold text-indigo-500">404 — Not Found</h1>
      <p className="text-slate-400 mt-2 text-sm">The page you are looking for does not exist.</p>
      <a href="/login" className="mt-6 text-indigo-400 hover:underline text-sm font-semibold">Back to Login</a>
    </div>
    <GlobalFooter isDark className="mt-auto z-10 bg-transparent border-transparent" />
  </div>
);

// ─── Role-based root redirect ─────────────────────────────────────────────────
const RoleBasedRedirect: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const role = user?.role;

  if (role === 'CYBERADMIN') {
    return <Navigate to="/cyberadmin/agentshield" replace />;
  }
  if (role === 'STUDENT') {
    return <Navigate to="/student/dashboard" replace />;
  }
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return <Navigate to="/admin/dashboard" replace />;
  if (role === 'PRINCIPAL') return <Navigate to="/principal/dashboard" replace />;
  if (role === 'DEAN') return <Navigate to="/dean/dashboard" replace />;
  if (role === 'HOD') return <Navigate to="/hod/dashboard" replace />;
  if (role === 'FACULTY' || role === 'TEACHER') return <Navigate to="/faculty/dashboard" replace />;

  return <Navigate to="/module-unavailable" replace />;
};

// ─── Session bootstrap ────────────────────────────────────────────────────────
const AuthBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useDispatch();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await API.get('/auth/status');
          if (res.data.success) {
            dispatch(loginSuccess({ user: res.data.data.user, token }));
            activityHeartbeat.start();
          } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            const isAdmissionRoute = window.location.pathname.startsWith('/admission');
            const targetLogin = isAdmissionRoute ? '/admission/login' : '/login';
            if (window.location.pathname !== targetLogin) forceLogout(true);
          }
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          const isAdmissionRoute = window.location.pathname.startsWith('/admission');
          const targetLogin = isAdmissionRoute ? '/admission/login' : '/login';
          if (window.location.pathname !== targetLogin) forceLogout(true);
        }
      }
      setBootstrapped(true);
    };
    bootstrap();
  }, [dispatch]);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-neutral-900">
        <div className="size-14 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
        <p className="text-slate-500 dark:text-neutral-400 font-bold tracking-tight text-xs uppercase">Verifying session…</p>
      </div>
    );
  }
  return <>{children}</>;
};

import { AcademicYearProvider } from './context/AcademicYearContext';

// ─── Root App ─────────────────────────────────────────────────────────────────
export const App: React.FC = () => (
  <Provider store={store}>
    <AcademicYearProvider>
      <TopLoadingBar />
      <PwaManager />
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
      <HotToaster position="top-right" />
      <BrowserRouter>
        <AuthBootstrap>
          <Routes>
          {/* ── Public ── */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-use" element={<TermsOfUsePage />} />
          <Route path="/support" element={<AdmissionSupportPage />} />
          <Route path="/admission/type" element={<AdmissionTypeSelection />} />
          <Route path="/admission/acknowledgement/:id" element={<ProvisionalAcknowledgement />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/module-unavailable" element={<ModuleUnavailablePage />} />

          {/* ── Admission Portal — Public auth pages ── */}
          <Route
            element={
              <AdmissionAuthProvider>
                <AdmissionAuthLayout />
              </AdmissionAuthProvider>
            }
          >
            <Route path="/admission/login" element={<AdmissionLogin />} />
            <Route path="/admission/register" element={<AdmissionRegister />} />
          </Route>

          {/* ── Protected (authenticated roles) ── */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard-redirect" element={<RoleBasedRedirect />} />

            {/* ── Admission Student Portal ── */}
            <Route
              path="admission"
              element={
                <AdmissionAuthProvider>
                  <AdmissionDashboardLayout />
                </AdmissionAuthProvider>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdmissionStudentDashboard />} />
              <Route path="application" element={<AdmissionForm />} />
              <Route path="provisional" element={<ProvisionalAdmissionForm />} />
              <Route path="support" element={<AdmissionSupportPage />} />
              <Route path="cancellation" element={<AdmissionCancellationPage />} />
            </Route>
            <Route path="support" element={<Navigate to="/admission/support" replace />} />

            {/* ── Admin Portal ── */}
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="profile" element={<AdminProfilePage />} />

              {/* Admission queue & review */}
              <Route path="admissions/queue"       element={<AdmissionQueuePage defaultStatus="QUEUE" />} />
              <Route path="admissions/resubmitted" element={<AdmissionQueuePage defaultStatus="RESUBMITTED" />} />
              <Route path="admissions/rejected"    element={<AdmissionQueuePage defaultStatus="REJECTED" />} />
              <Route path="admissions/verified"    element={<AdmissionQueuePage defaultStatus="APPROVED" />} />
              <Route path="admissions/corrections" element={<AdmissionQueuePage defaultStatus="CORRECTION_REQUIRED" />} />

              <Route path="admissions/enrolled"    element={<AdmissionQueuePage defaultStatus="ENROLLED" />} />
              <Route path="admissions/approved"    element={<AdmissionQueuePage defaultStatus="ENROLLED" />} />
              <Route path="admissions/cancellations" element={<CancellationRequestsPage />} />
              <Route path="admissions/usn"         element={<AdminUsnAllocationPage />} />
              <Route path="admissions/history"     element={<AdmissionQueuePage defaultStatus="ALL" />} />
              <Route path="admissions/review/:id"  element={<AdmissionReviewPage />} />
              <Route path="admissions/workspace/:id" element={<DocumentVerificationWorkspace />} />
              <Route path="admissions/provisional" element={<AdminProvisionalAdmissionsPage />} />
              <Route path="admissions/provisional/:id" element={<AdminProvisionalAdmissionsPage />} />
              <Route path="admissions/promotion" element={<AdminPromotionPage />} />
              <Route path="documents/:applicationId" element={<AdminStudentDocumentsPage />} />
              <Route path="documents/bulk" element={<BulkDocumentExportPage />} />

              <Route path="students"                     element={<StudentsDashboardPage />} />
              <Route path="students/existing-onboarding" element={<ExistingStudentOnboardingPage />} />
              <Route path="student-export"               element={<StudentExportPage />} />
              <Route path="students/view/:id" element={<StudentViewPage />} />
              <Route path="users/principals" element={<PrincipalManagementPage />} />
              <Route path="credentials"      element={<CredentialManagementPage />} />

              {/* Communications */}
              <Route path="notifications"  element={<AdminNotificationsPage />} />
              <Route path="announcements"  element={<AdminAnnouncementsPage />} />
              <Route path="reports"        element={<ReportGenerationPage />} />

              {/* Settings */}
              <Route path="settings/system" element={<AdminSystemSettingsPage />} />
              <Route path="settings/logs"   element={<AdminAuditLogsPage />} />
            </Route>

            {/* ── Principal Portal ── */}
            <Route path="principal" element={<PrincipalLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"              element={<PrincipalDashboardPage />} />
              <Route path="admissions"             element={<PrincipalAdmissionQueuePage defaultStatus="APPROVED" />} />
              <Route path="admissions/pending"     element={<PrincipalAdmissionQueuePage defaultStatus="APPROVED" />} />
              <Route path="admissions/approved"    element={<PrincipalAdmissionQueuePage defaultStatus="ENROLLED" />} />
              <Route path="admissions/rejected"    element={<PrincipalAdmissionQueuePage defaultStatus="REJECTED" />} />
              <Route path="admissions/history"     element={<PrincipalAdmissionQueuePage defaultStatus="ALL" />} />
              <Route path="admissions/review/:id"  element={<PrincipalAdmissionReviewPage />} />
              <Route path="students"               element={<StudentsDashboardPage readOnly={true} />} />
              <Route path="student-export"         element={<StudentExportPage readOnly={true} />} />
              <Route path="students/view/:id"      element={<StudentViewPage />} />
              <Route path="faculty"                element={<PrincipalFacultyListPage />} />
              <Route path="faculty/authorizations" element={<PrincipalFacultyAuthorizationPage />} />
              <Route path="faculty/authorizations/:id" element={<PrincipalFacultyReviewPage />} />
              <Route path="analytics"              element={<CollegeAnalyticsPage />} />
              <Route path="reports"                element={<ReportGenerationPage />} />
              <Route path="profile"                element={<PrincipalProfilePage />} />
            </Route>

            {/* ── Dean Academics Portal ── */}
            <Route path="dean" element={<DeanLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DeanDashboardPage />} />

              {/* Academic Structure */}
              <Route path="academic/departments" element={<DepartmentsPage />} />
              <Route path="academic/departments/:id" element={<DepartmentAcademicInfoPage />} />

              {/* HOD Management */}
              <Route path="hods" element={<HodListPage />} />
              <Route path="hods/create" element={<CreateHodPage />} />
              <Route path="hods/assignments" element={<HodAssignmentPage />} />
              <Route path="hods/history" element={<HodHistoryPage />} />
              <Route path="hods/:id" element={<HodDetailPage />} />

              {/* Faculty Management */}
              <Route path="faculty" element={<FacultyListPage />} />
              <Route path="faculty/create" element={<DeanCreateFacultyPage />} />
              <Route path="faculty/bulk-import" element={<DeanBulkFacultyImportPage />} />
              <Route path="faculty/archived" element={<DeanArchivedFacultyPage />} />
              <Route path="faculty/authorizations" element={<FacultyAuthorizationPage />} />
              <Route path="faculty/authorizations/:id" element={<FacultyReviewPage />} />
              <Route path="faculty/assignments" element={<FacultyAssignmentsPage />} />
              <Route path="faculty/:id" element={<DeanFacultyDetailPage />} />
              <Route path="faculty/:id/archive" element={<DeanArchiveFacultyPage />} />
              <Route path="faculty/:facultyId/archive" element={<DeanArchiveFacultyPage />} />
              <Route path="faculty/:id/regenerate-password" element={<DeanFacultyRegeneratePasswordPage />} />
              <Route path="faculty/:facultyId/regenerate-password" element={<DeanFacultyRegeneratePasswordPage />} />

              {/* Profile & Account Settings */}
              <Route path="profile" element={<DeanProfilePage />} />
              <Route path="settings/google-drive" element={<DeanGoogleDriveBackupPage />} />
            </Route>

            {/* ── HOD Portal ── */}
            <Route path="hod" element={<HodLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<HodDashboardPage />} />

              {/* Students & Section Allocations */}
              <Route path="students" element={<HodStudentsPage />} />
              <Route path="students/semesters" element={<HodStudentsSemesterPage />} />
              <Route path="students/semesters/:semester" element={<HodSemesterCohortPage />} />
              <Route path="students/sections" element={<HodStudentsSectionPage />} />
              <Route path="section-allocation" element={<Navigate to="/hod/students/sections" replace />} />
              <Route path="students/sections/:sectionId" element={<HodSectionDetailPage />} />
              <Route path="students/sections/:sectionId/allocate" element={<HodSectionAllocatePage />} />
              <Route path="students/:id" element={<HodStudentDetailPage />} />

              {/* Faculty */}
              <Route path="faculty" element={<HodFacultyListPage />} />
              <Route path="faculty/create" element={<Navigate to="/hod/faculty" replace />} />
              <Route path="faculty/assignments" element={<HodFacultyAssignmentsPage />} />
              <Route path="faculty/authorizations" element={<HodFacultyListPage />} />
              <Route path="faculty/:id" element={<HodFacultyManagePage />} />

              {/* Subjects */}
              <Route path="subjects" element={<HodSubjectsPage />} />
              <Route path="subjects/assign" element={<HodFacultyAssignmentsPage />} />
              <Route path="subjects/semesters" element={<HodSubjectsPage />} />

              {/* Attendance */}
              <Route path="attendance" element={<HodAttendanceOverviewPage />} />
              <Route path="attendance/semesters" element={<HodAttendanceOverviewPage />} />
              <Route path="attendance/subjects" element={<HodAttendanceOverviewPage />} />
              <Route path="attendance/sections" element={<HodAttendanceOverviewPage />} />
              <Route path="attendance/defaulters" element={<HodAttendanceDefaultersPage />} />

              {/* Academics */}
              <Route path="academics" element={<HodAcademicsOverviewPage />} />
              <Route path="academics/subjects" element={<HodAcademicsOverviewPage />} />
              <Route path="academics/bitwise" element={<HodBitwiseAnalysisPage />} />
              <Route path="academics/performance" element={<HodStudentPerformancePage />} />
              <Route path="publish" element={<HodPublishAttendanceMarksPage />} />
              <Route path="release" element={<Navigate to="/hod/publish" replace />} />

              {/* Reports & Settings */}
              <Route path="reports" element={<HodReportsPage />} />
              <Route path="settings" element={<HodSettingsPage />} />
              <Route path="profile" element={<HodProfilePage />} />
            </Route>

            {/* ── Faculty Portal ── */}
            <Route path="faculty" element={<FacultyLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<FacultyOverviewPage />} />
              <Route path="overview" element={<FacultyOverviewPage />} />
              <Route path="attendance" element={<FacultyAttendancePage />} />
              <Route path="all-subject-attendance" element={<FacultyAllSubjectAttendancePage />} />
              <Route path="student-attendance" element={<FacultyStudentAttendancePage />} />
              <Route path="analytics" element={<FacultyAnalyticsPage />} />
              <Route path="profile" element={<FacultyProfilePage />} />
              <Route path="settings" element={<FacultyProfilePage />} />

              {/* ── Bitwise Marks Entry Module ── */}
              <Route path="marks" element={<FacultyMarksDashboardPage />} />
              <Route path="bitwise-marks" element={<FacultyMarksDashboardPage />} />
              <Route path="marks/semesters/:semester" element={<FacultyMarksSubjectSelectPage />} />
              <Route path="marks/config" element={<FacultyMarksConfigPage />} />
              <Route path="marks/grid" element={<FacultyMarksGridPage />} />
              <Route path="marks/assignments" element={<FacultyAssignmentMarksPage />} />
              <Route path="marks/assignments/config" element={<FacultyAssignmentConfigPage />} />
              <Route path="marks/final-internal" element={<FacultyFinalInternalMarksPage />} />
              <Route path="marks/external" element={<FacultyExternalMarksPage />} />
            </Route>

            {/* ── CyberAdmin AgentShield Portal ── */}
            <Route path="cyberadmin" element={<CyberAdminLayout />}>
              <Route index element={<Navigate to="agentshield" replace />} />
              <Route path="agentshield" element={<AgentShieldDashboard />} />
            </Route>

            {/* ── Student Portal ── */}
            <Route path="student" element={<StudentLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentOverviewPage />} />
              <Route path="overview" element={<StudentOverviewPage />} />
              <Route path="attendance" element={<StudentAttendancePage />} />
              <Route path="marks" element={<StudentMarksPage />} />
              <Route path="profile" element={<StudentProfilePage />} />
            </Route>
          </Route>

          {/* ── 404 ── */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthBootstrap>
    </BrowserRouter>
    </AcademicYearProvider>
  </Provider>
);

export default App;

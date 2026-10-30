import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/authSlice';
import authService from '../../services/auth.service';
import API from '../../services/api';
import { RootState } from '../../store';
import { getAcademicYear } from '../../utils/date.util';
import { GlobalFooter } from '../common/GlobalFooter';
import {
  LayoutDashboard,
  ClipboardList,
  KeyRound,
  Users,
  FileCheck2,
  BarChart3,
  CalendarDays,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Sliders,
  Settings,
  User,
  Shield,
  AlertCircle,
  Mail,
  Send,
  MessageSquare,
  XCircle,
  RefreshCw,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  FileText,
  GraduationCap,
  Layers,
  Archive,
  ArrowUpCircle,
  Download,
  UserPlus,
} from 'lucide-react';
import admissionService from '../../services/admission.service';
import AcademicYearSelector from '../common/AcademicYearSelector';
import usePwa from '../../hooks/usePwa';
import PwaConfirmationModal from '../common/PwaConfirmationModal';

import { filterMenuItems } from '../../utils/feature.util';
import GlobalSearchModal from '../admin/GlobalSearchModal';

interface MenuItem {
  name: string;
  path: string;
  icon: React.ElementType;
  feature?: string;
  badge?: number;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const NotificationIcon = ({ name, className }: { name: string; className?: string }) => {
  const cn = className || "w-4 h-4";
  switch (name) {
    case 'FileText': return <FileText className={cn} />;
    case 'RefreshCw': return <RefreshCw className={cn} />;
    case 'AlertTriangle': return <AlertTriangle className={cn} />;
    case 'CheckCircle': return <CheckCircle2 className={cn} />;
    case 'Users': return <Users className={cn} />;
    case 'XCircle': return <XCircle className={cn} />;
    default: return <ClipboardList className={cn} />;
  }
};

const getNotificationDetails = (app: any) => {
  const name = app.studentpersonaldetails?.firstName 
    ? [app.studentpersonaldetails.firstName, app.studentpersonaldetails.lastName].filter(Boolean).join(' ')
    : [app.user?.firstName, app.user?.lastName].filter(Boolean).join(' ') || 'Candidate';
  
  const appNo = app.applicationNumber;

  switch (app.applicationStatus) {
    case 'SUBMITTED':
      return {
        title: 'New Application Submitted',
        message: `${name} has submitted application ${appNo}`,
        colorClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
        iconName: 'FileText'
      };
    case 'RESUBMITTED':
      return {
        title: 'Corrections Resubmitted',
        message: `${name} resubmitted application ${appNo}`,
        colorClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
        iconName: 'RefreshCw'
      };
    case 'CORRECTION_REQUIRED':
      return {
        title: 'Correction Requested',
        message: `Corrections requested for ${name} (${appNo})`,
        colorClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
        iconName: 'AlertTriangle'
      };
    case 'APPROVED':
      return {
        title: 'Application Verified',
        message: `Admission verified for ${name} (${appNo})`,
        colorClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
        iconName: 'CheckCircle'
      };
    case 'PRINCIPAL_APPROVED':
      return {
        title: 'Approved by Principal',
        message: `Admission approved by Principal for ${name} (${appNo})`,
        colorClass: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
        iconName: 'CheckCircle'
      };
    case 'CANCELLATION_REQUESTED':
      return {
        title: 'Cancellation Requested',
        message: `Cancellation requested for ${name} (${appNo})`,
        colorClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-450',
        iconName: 'AlertTriangle'
      };
    case 'ENROLLED':
      return {
        title: 'Student Enrolled',
        message: `${name} (${appNo}) is enrolled in ERP`,
        colorClass: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
        iconName: 'Users'
      };
    case 'REJECTED':
    case 'CANCELLED':
      return {
        title: 'Application Cancelled',
        message: `Application ${appNo} for ${name} cancelled`,
        colorClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400',
        iconName: 'XCircle'
      };
    default:
      return {
        title: 'Status Updated',
        message: `Application ${appNo} updated to ${app.applicationStatus}`,
        colorClass: 'bg-neutral-50 text-neutral-600 dark:bg-neutral-800/40 dark:text-neutral-300',
        iconName: 'Clock'
      };
  }
};

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);

  const [features, setFeatures] = useState<Record<string, boolean>>({
    admission: true,
    admin: true,
    principal: true,
    student: false,
    teacher: false,
    hod: false,
    parent: false,
    fees: false,
    library: false,
    placement: false,
    hostel: false,
    grievances: false,
  });

  const [academicYear, setAcademicYear] = useState<string>('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  useEffect(() => {
    API.get('/system/config')
      .then(res => {
        const json = res.data;
        if (json.success) {
          if (json.data?.features) {
            setFeatures(json.data.features);
          }
          if (json.data?.admissionCycle) {
            setAcademicYear(json.data.admissionCycle);
          }
        }
      })
      .catch(err => console.warn('Unable to load deployment features list in AdminLayout:', err));
  }, []);

  const [isDark, setIsDark] = useState(false);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  const [recentApplications, setRecentApplications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const fetchRecentNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await admissionService.listApplications({
        limit: 5,
        sortBy: 'updatedAt',
        sortOrder: 'DESC'
      });
      if (res && res.applications) {
        setRecentApplications(res.applications);
        const count = res.applications.filter((app: any) => 
          ['SUBMITTED', 'RESUBMITTED', 'PRINCIPAL_APPROVED', 'CANCELLATION_REQUESTED'].includes(app.applicationStatus)
        ).length;
        setUnreadCount(count);
      }
    } catch (e) {
      console.error('Failed to fetch recent notifications:', e);
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentNotifications();
    const handleUpdate = () => {
      fetchRecentNotifications();
    };
    window.addEventListener('admissions-updated', handleUpdate);
    return () => {
      window.removeEventListener('admissions-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return `${interval}y ago`;
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return `${interval}mo ago`;
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return `${interval}d ago`;
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return `${interval}h ago`;
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return `${interval}m ago`;
    return 'just now';
  };
  
  const [pendingCount, setPendingCount] = useState(0);
  const [resubmittedCount, setResubmittedCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [verifiedCount, setVerifiedCount] = useState(0);
  const [cancellationRequestsCount, setCancellationRequestsCount] = useState(0);
  const [provisionalCount, setProvisionalCount] = useState(0);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  useEffect(() => {
    const fetchCount = () => {
      admissionService.getStats().then(stats => {
        setPendingCount(stats.submitted + stats.underReview + (stats.resubmitted || 0));
        setResubmittedCount(stats.resubmitted || 0);
        setCorrectionCount((stats as any).correctionRequired || 0);
        setRejectedCount(stats.rejected || 0);
        setVerifiedCount(stats.approved || 0);
        setCancellationRequestsCount(stats.cancellationRequests || 0);
        setProvisionalCount(stats.provisionalCount || 0);
      }).catch(err => console.error('Error loading sidebar stats:', err));
    };

    fetchCount();

    // Listen to local actions
    window.addEventListener('admissions-updated', fetchCount);

    // Periodic polling fallback
    const interval = setInterval(fetchCount, 10000);

    return () => {
      window.removeEventListener('admissions-updated', fetchCount);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  const { canInstall, handleInstall, triggerRefresh, confirmRefresh, showRefreshModal, setShowRefreshModal } = usePwa();

  const handleLogout = () => {
    setProfileMenuOpen(false);
    authService.logout();
    dispatch(logout());
    navigate('/login');
  };

  const menuGroups: MenuGroup[] = [
    {
      title: 'DASHBOARD',
      items: [
        { name: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
      ],
    },
    {
      title: 'ADMISSIONS',
      items: [
        { name: 'Application Queue',    path: '/admin/admissions/queue',         icon: ClipboardList,   badge: pendingCount                > 0 ? pendingCount                : undefined },
        { name: 'Resubmitted',          path: '/admin/admissions/resubmitted',   icon: RefreshCw,       badge: resubmittedCount            > 0 ? resubmittedCount            : undefined },
        { name: 'Corrections',          path: '/admin/admissions/corrections',   icon: AlertTriangle,   badge: correctionCount             > 0 ? correctionCount             : undefined },
        { name: 'Verified',             path: '/admin/admissions/verified',      icon: FileCheck2,      badge: verifiedCount               > 0 ? verifiedCount               : undefined },
        { name: 'Approved',             path: '/admin/admissions/approved',      icon: CheckCircle2 },
        { name: 'Cancellation',         path: '/admin/admissions/cancellations', icon: XCircle,         badge: cancellationRequestsCount   > 0 ? cancellationRequestsCount   : undefined },
        { name: 'USN Allocation',       path: '/admin/admissions/usn',           icon: GraduationCap },
        { name: 'Promotion',            path: '/admin/admissions/promotion',     icon: ArrowUpCircle },
        { name: 'Provisional Admission', path: '/admin/admissions/provisional',   icon: Layers,          badge: provisionalCount            > 0 ? provisionalCount            : undefined },
        { name: 'History',              path: '/admin/admissions/history',       icon: CalendarDays },
      ],
    },
    {
      title: 'STUDENT MANAGEMENT',
      items: [
        { name: 'Students', path: '/admin/students', icon: Users },
        { name: 'Existing Student Onboarding', path: '/admin/students/existing-onboarding', icon: UserPlus },
      ],
    },
    {
      title: 'REPORTS & AUDIT',
      items: [
        { name: 'Reports', path: '/admin/reports', icon: FileText },
        { name: 'Bulk Document Export', path: '/admin/documents/bulk', icon: Archive },
        { name: 'Activity Logs', path: '/admin/settings/logs', icon: CalendarDays },
      ],
    },
    {
      title: 'SETTINGS',
      items: [
        { name: 'System Settings', path: '/admin/settings/system', icon: Settings },
        ...((user?.role === 'SUPER_ADMIN' || user?.role === 'CYBERADMIN') ? [
          { name: 'AgentShield Security', path: '/cyberadmin/agentshield', icon: Shield }
        ] : []),
      ],
    },
  ];

  const subNavTabs = [
    { name: 'Dashboard', path: '/admin/dashboard' },
    { name: 'Admissions Queue', path: '/admin/admissions/queue' },
    { name: 'Students', path: '/admin/students' },
  ];

  const getAvatarUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    const base = API.defaults.baseURL || '/api';
    const host = base.replace(/\/api\/?$/, '');
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${host}${cleanPath}`;
  };

  const pageTitles: Record<string, string> = {
    '/admin/dashboard': 'Admin Dashboard',
    '/admin/analytics': 'Analytics',
    '/admin/profile':   'Admin Profile',
    '/admin/admissions/queue':        'Application Queue',
    '/admin/admissions/resubmitted':  'Resubmitted Applications',
    '/admin/admissions/corrections':  'Correction Requests',
    '/admin/admissions/rejected':     'Rejected Applications',
    '/admin/admissions/verified':     'Verified Admissions',
    '/admin/admissions/enrolled':     'Enrolled Students',
    '/admin/admissions/approved':     'Enrolled Students',
    '/admin/admissions/cancellations':'Cancellation Requests',
    '/admin/admissions/usn':          'USN Allocation & Entry',
    '/admin/admissions/provisional':  'Provisional Admissions Workspace',
    '/admin/admissions/promotion':    'Academic Promotion Workspace',
    '/admin/admissions/history':      'Admission History',
    '/admin/students': 'Student Management',
    '/admin/students/existing-onboarding': 'Existing Student Onboarding',
    '/admin/reports': 'Report Generator',
    '/admin/documents/bulk': 'Bulk Document Export',
    '/admin/notifications': 'Notifications',
    '/admin/announcements': 'Announcements',
    '/admin/settings/system': 'System Settings',
    '/admin/settings/logs': 'Audit Logs',
  };

  const getPageTitle = () => {
    if (location.pathname.startsWith('/admin/admissions/review/')) {
      return 'Admission Review Workspace';
    }
    if (location.pathname.startsWith('/admin/documents/') && !location.pathname.endsWith('/bulk')) {
      return 'Student Document Center';
    }
    return pageTitles[location.pathname] || 'Admin Portal';
  };

  const isWorkspace = location.pathname.includes('/admissions/workspace/');

  if (isWorkspace) {
    return (
      <div className="min-h-screen w-full flex flex-col text-neutral-900 dark:text-neutral-100 transition-colors duration-300 font-sans">
        <main className="flex-1 flex flex-col relative h-screen w-screen overflow-hidden">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-full overflow-x-hidden flex text-neutral-900 dark:text-neutral-100 transition-colors duration-300 font-sans pb-6 pr-6">

      {/* ── FLOATING SIDEBAR ── */}
      <aside className="fixed left-6 top-6 bottom-6 w-[280px] min-w-[280px] max-w-[280px] flex-shrink-0 flex flex-col justify-between py-6 px-4 rounded-[32px] glass-bar z-40">

        {/* Top: Logo + Nav */}
        <div className="flex flex-col w-full">
          <Link to="/admin/dashboard" className="flex items-center space-x-2.5 px-1.5 mb-5 hover:opacity-95 transition-all">
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-850 shadow-sm">
              <img
                src="/logo.png"
                alt="JCER Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-[15px] tracking-wider uppercase text-neutral-900 dark:text-white leading-none">JCER ERP</span>
              <span className="text-[10px] font-bold text-neutral-450 dark:text-neutral-300 mt-0.5">Admin Portal</span>
            </div>
          </Link>

          {/* Grouped Navigation */}
          <nav className="flex flex-col space-y-3 overflow-y-auto max-h-[calc(100vh-270px)] pr-1 select-none">
            {filterMenuItems(menuGroups, features).map((group) => (
              <div key={group.title} className="flex flex-col space-y-0.5">
                <span className="px-3.5 text-[9px] font-black tracking-widest text-neutral-400 dark:text-neutral-500 uppercase mb-1">
                  {group.title}
                </span>
                <div className="flex flex-col space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        className={`w-full h-[40px] px-3.5 rounded-xl flex items-center justify-between transition-colors duration-150 relative group ${
                          isActive
                            ? 'bg-violet-50 text-violet-900 font-bold dark:bg-violet-950/20 dark:text-violet-250 shadow-none hover:bg-violet-600 hover:!text-white dark:hover:bg-violet-600 dark:hover:!text-white'
                            : 'text-neutral-500 dark:text-neutral-400 hover:bg-violet-600 hover:!text-white dark:hover:bg-violet-600 dark:hover:!text-white'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-violet-600 dark:bg-violet-400 rounded-r group-hover:!bg-white group-hover:bg-white transition-colors duration-150" />
                        )}
                        <div className="flex items-center space-x-3">
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 transition-colors duration-150 ${
                              isActive
                                ? 'text-violet-600 dark:text-violet-400 group-hover:!text-white group-hover:text-white'
                                : 'text-neutral-400 group-hover:!text-white group-hover:text-white'
                            }`}
                            strokeWidth={isActive ? 2.5 : 2}
                          />
                          <span
                            className={`text-[11px] font-semibold transition-colors duration-150 ${
                              isActive
                                ? 'text-violet-900 dark:text-violet-250 group-hover:!text-white group-hover:text-white'
                                : 'text-neutral-600 dark:text-neutral-300 group-hover:!text-white group-hover:text-white'
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white leading-none scale-90">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Footer */}
        <div className="pt-3 border-t border-neutral-105 dark:border-neutral-800/40 flex flex-col gap-2.5 w-full">
          <div className="rounded-xl p-2.5 border text-[10px] space-y-1 bg-neutral-50/50 dark:bg-neutral-800/25 border-neutral-200/50 dark:border-neutral-800/55">
            <div className="flex justify-between items-center">
              <span className="text-neutral-400 font-medium">Role</span>
              <span className="font-extrabold text-neutral-800 dark:text-neutral-200">ADMINISTRATOR</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400 font-medium">Academic Year</span>
              <span className="font-extrabold text-neutral-800 dark:text-neutral-200">{academicYear || getAcademicYear()}</span>
            </div>
          </div>

          <Link
            to="/admin/admissions/queue"
            className="flex items-center space-x-2 text-[10px] font-bold hover:underline px-1 py-0.5 shrink-0"
            style={{ color: '#7C3AED' }}
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{pendingCount > 0 ? `${pendingCount} Pending Admissions` : 'No Pending Admissions'}</span>
          </Link>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 pt-6 flex flex-col min-h-screen min-w-0" style={{ paddingLeft: '328px' }}>

        {/* ── TOP HEADER ── */}
        <header className="flex flex-row items-center justify-between py-4 mb-6 z-30 gap-4">

          {/* Page Title */}
          <div className="flex-shrink-0 min-w-0">
            <h1 className="text-xl md:text-2xl lg:text-[28px] font-bold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap leading-none">
              {getPageTitle()}
            </h1>
          </div>

          {/* Sub-Nav Pill Bar */}
          <div className="flex items-center glass-bar p-1 rounded-full flex-shrink-0">
            {subNavTabs.map((tab) => {
              const isActive = location.pathname === tab.path;
              return (
                <Link
                  key={tab.name}
                  to={tab.path}
                  className={`px-4 py-2 rounded-full text-xs md:text-sm font-semibold tracking-wide transition-all duration-300 ${
                    isActive
                      ? 'admin-nav-pill-active shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  {tab.name}
                </Link>
              );
            })}
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-2.5 flex-shrink-0">
            {/* Global Academic Year Selector */}
            <AcademicYearSelector />

            <button 
              onClick={() => setShowSearch(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center header-dark-btn shadow-sm hover:scale-[1.05] active:scale-[0.95] cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => setNotificationsOpen(prev => !prev)}
                className="w-9 h-9 rounded-full flex items-center justify-center header-dark-btn shadow-sm hover:scale-[1.05] active:scale-[0.95] relative cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[8px] leading-none shrink-0 min-w-4 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="notifications-dropdown absolute right-0 mt-2 w-80 sm:w-96 border border-neutral-200/50 dark:border-neutral-800/40 bg-white dark:bg-neutral-900 rounded-2xl py-2 shadow-xl z-50 animate-fade-in">
                  <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800/30 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-800 dark:text-neutral-200">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-extrabold">
                        {unreadCount} pending
                      </span>
                    )}
                  </div>

                  <div className="max-h-[360px] overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/20 scrollbar-thin">
                    {notificationsLoading && recentApplications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-neutral-400 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-neutral-300" />
                        <span>Fetching notifications...</span>
                      </div>
                    ) : recentApplications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-neutral-400 font-medium">
                        All caught up! No recent activity.
                      </div>
                    ) : (
                      recentApplications.map((app) => {
                        const details = getNotificationDetails(app);
                        return (
                          <div
                            key={app.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              if (app.applicationStatus === 'ENROLLED') {
                                navigate(`/admin/students/view/${app.id}`);
                              } else if (app.applicationStatus === 'CANCELLATION_REQUESTED') {
                                navigate('/admin/admissions/cancellations');
                              } else {
                                navigate(`/admin/admissions/review/${app.id}`);
                              }
                            }}
                            className="p-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-950/20 cursor-pointer flex gap-3 transition-colors select-none text-left"
                          >
                            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${details.colorClass}`}>
                              <NotificationIcon name={details.iconName} className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-xs font-extrabold text-neutral-850 dark:text-neutral-100">
                                {details.title}
                              </p>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed font-medium">
                                {details.message}
                              </p>
                            </div>
                            <span className="text-[9px] text-neutral-400 dark:text-neutral-500 font-bold shrink-0 self-start mt-0.5 font-mono">
                              {formatTimeAgo(app.updatedAt)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="px-4 py-2 border-t border-neutral-100 dark:border-neutral-800/30 text-center shrink-0">
                    <button
                      onClick={() => {
                        setNotificationsOpen(false);
                        navigate('/admin/admissions/queue');
                      }}
                      className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors uppercase tracking-wider"
                    >
                      View All Applications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="flex items-center space-x-2 header-dark-btn h-9 pl-1 pr-3 py-1 rounded-full shadow-sm cursor-pointer hover:scale-[1.02] transition-all select-none"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#7C3AED' }}>
                  {user?.profileImage ? (
                    <img src={getAvatarUrl(user.profileImage)} alt={user?.name || 'Admin'} className="w-full h-full object-cover" />
                  ) : (
                    <Shield className="w-3 h-3" style={{ color: '#ffffff' }} />
                  )}
                </div>
                <span className="text-xs font-semibold pr-0.5 hidden md:block">
                  {user?.name?.split(' ')[0] || 'Admin'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-80 hidden md:block transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileMenuOpen && (
                <div className="profile-dropdown absolute right-0 mt-2 w-52 border border-neutral-200/50 dark:border-neutral-800/40 rounded-2xl py-2 animate-fade-in z-50">
                  <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800/30">
                    <p className="profile-dropdown-label text-[10px] font-extrabold uppercase tracking-widest mb-0.5">Logged in as</p>
                    <p className="profile-dropdown-value text-sm font-extrabold">{user?.name || 'Administrator'}</p>
                    <p className="text-[10px] mt-0.5 font-extrabold" style={{ color: '#7C3AED' }}>ADMINISTRATOR</p>
                  </div>

                  <button
                    onClick={() => { setProfileMenuOpen(false); navigate('/admin/profile'); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold flex items-center space-x-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <User className="w-4 h-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>My Profile</span>
                  </button>

                  <button
                    onClick={() => { setProfileMenuOpen(false); handleInstall(); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold flex items-center space-x-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>Install App</span>
                  </button>

                  <button
                    onClick={() => { setProfileMenuOpen(false); triggerRefresh(); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold flex items-center space-x-2.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>Refresh App</span>
                  </button>

                  <div className="my-1 border-t border-neutral-100 dark:border-neutral-800/30" />

                  <button
                    onClick={handleLogout}
                    className="profile-dropdown-logout w-full text-left px-4 py-2.5 text-xs font-bold flex items-center space-x-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    <span>Logout Session</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <PwaConfirmationModal
          isOpen={showRefreshModal}
          onClose={() => setShowRefreshModal(false)}
          onConfirm={confirmRefresh}
        />

        {/* ── PAGE CONTENT (OUTLET) ── */}
        <main className="flex-1 flex flex-col relative">
          <div 
            className="fixed inset-y-0 right-0 left-0 lg:left-[328px] pointer-events-none flex items-center justify-center z-0 overflow-hidden"
            aria-hidden="true"
          >
            <img 
              src="/emaillogo.png" 
              alt="" 
              className="w-[620px] h-[620px] max-w-[70vw] max-h-[70vh] object-contain opacity-[0.045] dark:opacity-[0.025] select-none" 
            />
          </div>
          <div className="relative z-10 flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>
        <GlobalFooter className="mt-auto relative z-20" />
        <GlobalSearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} />
      </div>
    </div>
  );
};

export default AdminLayout;

import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/authSlice';
import { RootState } from '../../store';
import { io, Socket } from 'socket.io-client';
import {
  LayoutDashboard,
  BarChart3,
  Radio,
  AlertTriangle,
  ShieldAlert,
  Sliders,
  FileCode2,
  FileText,
  LogOut,
  User,
  Menu,
  X,
  ChevronDown,
  ExternalLink,
  Server,
  ArrowLeftRight,
} from 'lucide-react';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { GlobalFooter } from '../common/GlobalFooter';

export const CyberAdminLayout: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);

  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [activeSocket, setActiveSocket] = useState<Socket | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile drawer on route/tab change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    setWorkspaceMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.dataset.portal = 'cyberadmin';
    return () => {
      delete document.body.dataset.portal;
    };
  }, []);

  // Initialize Socket.IO connection for live SOC telemetry
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      setSocketConnected(false);
    });

    setActiveSocket(socket);

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleLogout = () => {
    setProfileMenuOpen(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  const navItems = [
    { id: 'overview', label: 'Security Overview', icon: LayoutDashboard, path: '/cyberadmin/agentshield?tab=overview' },
    { id: 'analytics', label: 'Security Analytics', icon: BarChart3, path: '/cyberadmin/agentshield?tab=analytics' },
    { id: 'live', label: 'Live Threat Monitor', icon: Radio, path: '/cyberadmin/agentshield?tab=live' },
    { id: 'incidents', label: 'Security Incidents', icon: AlertTriangle, path: '/cyberadmin/agentshield?tab=incidents' },
    { id: 'blocked', label: 'Blocked & Restricted', icon: ShieldAlert, path: '/cyberadmin/agentshield?tab=blocked' },
    { id: 'rules', label: 'Detection Rules', icon: Sliders, path: '/cyberadmin/agentshield?tab=rules' },
    { id: 'zap', label: 'OWASP ZAP Assessments', icon: FileCode2, path: '/cyberadmin/agentshield?tab=zap' },
    { id: 'audit', label: 'Security Audit Logs', icon: FileText, path: '/cyberadmin/agentshield?tab=audit' },
  ];

  const currentTab = new URLSearchParams(location.search).get('tab') || 'overview';

  const getPageTitle = () => {
    switch (currentTab) {
      case 'analytics':
        return 'Security Analytics';
      case 'live':
        return 'Live Threat Monitor';
      case 'incidents':
        return 'Security Incidents';
      case 'blocked':
        return 'Blocked & Restricted';
      case 'rules':
        return 'Detection Rules';
      case 'zap':
        return 'OWASP ZAP Assessments';
      case 'audit':
        return 'Security Audit Logs';
      case 'overview':
      default:
        return 'Security Overview';
    }
  };

  const getPageSubtitle = () => {
    switch (currentTab) {
      case 'analytics':
        return 'Institutional threat telemetry trends, attack vectors, and automated defense analytics';
      case 'live':
        return 'Monitor detected security threats, suspicious request patterns, and mitigation actions in real time';
      case 'incidents':
        return 'Correlated investigations, threat containment lifecycles, and audited administrative evidence notes';
      case 'blocked':
        return 'Inspect active client IP cooldowns, connection throttling, and autonomous firewall mitigations';
      case 'rules':
        return 'Active heuristic detection policies, rate anomaly thresholds, and automated response rules';
      case 'zap':
        return 'Dynamic application security test ingestion, vulnerability inventory, and remediation tracking';
      case 'audit':
        return 'Immutable cryptographic audit trail of security administrative decisions and configuration changes';
      case 'overview':
      default:
        return 'Monitor ERP security events, investigate incidents, and review protection activity';
    }
  };

  const userName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.name || 'CyberAdmin';

  return (
    <div
      data-portal="cyberadmin"
      className="portal-table-center min-h-screen max-w-full overflow-x-hidden flex text-neutral-900 dark:text-neutral-100 transition-colors duration-300 font-sans pb-6 pr-6 bg-[#F4F5FA] dark:bg-neutral-950"
    >
      {/* ── MOBILE BACKDROP ── */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-neutral-950/50 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ── FLOATING SIDEBAR (EXACT FACULTY / HOD DASHBOARD STYLE) ── */}
      <aside
        className={`fixed left-6 top-6 bottom-6 w-[280px] min-w-[280px] max-w-[280px] flex-shrink-0 flex flex-col justify-between py-6 px-4 rounded-[32px] glass-bar z-50 transition-transform duration-300 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-[320px] lg:translate-x-0'
        }`}
      >
        {/* Top: Logo + Nav */}
        <div className="flex flex-col w-full min-h-0">
          <div className="flex items-center justify-between px-1.5 mb-5">
            <Link to="/cyberadmin/agentshield?tab=overview" className="flex items-center space-x-2.5 hover:opacity-95 transition-all">
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border border-neutral-100 dark:border-neutral-800 shadow-sm">
                <img
                  src="/logo.png"
                  alt="JCER Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-[15px] tracking-wider uppercase text-neutral-900 dark:text-white leading-none">
                  JCER ERP
                </span>
                <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400 mt-0.5">
                  AgentShield Security Center
                </span>
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Items (Matching Faculty exact typography, padding, and active state) */}
          <nav className="flex flex-col space-y-3 overflow-y-auto max-h-[calc(100vh-270px)] pr-1 select-none custom-scrollbar">
            <div className="flex flex-col space-y-0.5">
              <span className="px-3.5 text-[9px] font-black tracking-widest text-neutral-400 dark:text-neutral-500 uppercase mb-1">
                AGENTSHIELD SECURITY
              </span>
              <div className="flex flex-col space-y-0.5">
                {navItems.map((item) => {
                  const isActive = currentTab === item.id;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`w-full h-[38px] px-3.5 rounded-xl flex items-center justify-between transition-all duration-150 relative group border ${
                        isActive
                          ? 'bg-purple-50 dark:bg-purple-950/40 text-[#6D35E8] dark:text-purple-300 font-bold border-purple-200/80 dark:border-purple-800/60 shadow-2xs'
                          : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-neutral-800/60 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#6D35E8] rounded-r shadow-xs shadow-[#6D35E8]/30" />
                      )}
                      <div className="flex items-center space-x-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 transition-colors duration-150 ${
                            isActive ? 'text-[#6D35E8] dark:text-purple-300' : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                          }`}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        <span
                          className={`text-[11px] font-semibold transition-colors duration-150 truncate ${
                            isActive ? 'text-[#6D35E8] dark:text-purple-300 font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        {/* Bottom Footer matching Faculty style */}
        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800/40 flex flex-col gap-2.5 w-full">
          <div className="rounded-xl p-2.5 border text-[10px] space-y-1 bg-neutral-50/50 dark:bg-neutral-800/25 border-neutral-200/50 dark:border-neutral-800/55">
            <div className="flex justify-between items-center">
              <span className="text-neutral-400 font-medium">Role</span>
              <span className="font-extrabold text-neutral-800 dark:text-neutral-200">
                Cyber Security Officer
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400 font-medium">Module</span>
              <span className="font-extrabold text-neutral-800 dark:text-neutral-200">
                AgentShield
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-400 font-medium">System Status</span>
              <span className={`font-extrabold ${socketConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {socketConnected ? 'Live SOC Active' : 'Polling Active'}
              </span>
            </div>
          </div>

          {/* Switch Workspace */}
          <div className="relative" ref={workspaceMenuRef}>
            <button
              onClick={() => setWorkspaceMenuOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-neutral-200/70 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 text-[10px] font-bold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shadow-2xs cursor-pointer"
            >
              <div className="flex items-center space-x-1.5 truncate">
                <ArrowLeftRight className="w-3 h-3 text-violet-500" />
                <span>Switch Workspace</span>
              </div>
              <ChevronDown className={`w-3 h-3 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {workspaceMenuOpen && (
              <div className="absolute bottom-full mb-1.5 left-0 right-0 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl p-1.5 z-50 text-[11px] animate-in fade-in duration-100">
                <button
                  onClick={() => {
                    setWorkspaceMenuOpen(false);
                    navigate('/admin/dashboard');
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold cursor-pointer text-left"
                >
                  <Server className="w-3.5 h-3.5 text-violet-600" />
                  <span>ERP Admin Portal</span>
                </button>
                <button
                  onClick={() => {
                    setWorkspaceMenuOpen(false);
                    navigate('/faculty/dashboard');
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold cursor-pointer text-left"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
                  <span>Faculty Workspace</span>
                </button>
              </div>
            )}
          </div>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 text-[10px] font-bold hover:underline px-1 py-0.5 shrink-0 text-rose-600 dark:text-rose-400 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA (MATCHING FACULTY EXACT PADDING & HEADER) ── */}
      <div className="flex-1 pt-6 flex flex-col min-h-screen min-w-0 pl-6 lg:pl-[320px]">
        {/* ── TOP HEADER (EXACT FACULTY / HOD STYLE) ── */}
        <header className="flex flex-row items-center justify-between py-2 sm:py-4 mb-6 z-30 gap-6">
          {/* Page Title & Mobile Trigger */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-shrink-0">
              <h1 className="text-xl md:text-2xl lg:text-[26px] font-bold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap leading-tight">
                {getPageTitle()}
              </h1>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 font-medium whitespace-nowrap">
                {getPageSubtitle()}
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center space-x-2.5 flex-shrink-0">
            {/* Live Socket Status Badge */}
            <div
              className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors shadow-2xs ${
                socketConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-700 dark:text-amber-400'
              }`}
              title={socketConnected ? 'Connected to live WebSocket events' : 'Polling fallback active (8s)'}
            >
              <span className={`size-2 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[11px] uppercase tracking-wider font-extrabold">
                {socketConnected ? 'LIVE SOC ACTIVE' : 'POLLING MODE'}
              </span>
            </div>

            {/* Link to ERP Admin Portal */}
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold shadow-2xs transition cursor-pointer"
              title="Switch to College ERP Administration Portal"
            >
              <Server className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>ERP Admin Portal</span>
              <ExternalLink className="w-3 h-3 text-neutral-400" />
            </button>

            {/* Profile Dropdown (Exact dark capsule pill matching Faculty Dashboard reference photo) */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="flex items-center space-x-2 header-dark-btn h-9 pl-1.5 pr-3 py-1 rounded-full shadow-sm cursor-pointer hover:scale-[1.02] transition-all select-none"
              >
                <ProfileAvatar
                  imageUrl={user?.profileImage}
                  name={userName}
                  size="xs"
                  className="w-6 h-6 rounded-full shadow-xs"
                />
                <span className="text-xs font-semibold pr-0.5 hidden md:block">
                  {userName.split(' ')[0]}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 opacity-80 hidden md:block transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-neutral-900 shadow-xl border border-neutral-200/80 dark:border-neutral-800 p-2 z-50 animate-in fade-in duration-150">
                  <div className="px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                    <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">{userName}</p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{user?.email || 'cyberadmin@jcer.edu'}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
                        CYBERADMIN
                      </span>
                      <span className="text-[9px] font-bold text-neutral-400">
                        AgentShield SOC
                      </span>
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/faculty/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <User className="w-3.5 h-3.5 text-neutral-500" />
                      <span>My Profile</span>
                    </Link>
                  </div>

                  <div className="pt-1 border-t border-neutral-100 dark:border-neutral-800">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── DYNAMIC PAGE CONTENT ── */}
        <main className="flex-1 pb-10 min-w-0 flex flex-col relative">
          <div 
            className="fixed inset-y-0 right-0 left-0 lg:left-[320px] pointer-events-none flex items-center justify-center z-0 overflow-hidden"
            aria-hidden="true"
          >
            <img 
              src="/emaillogo.png" 
              alt="" 
              className="w-[620px] h-[620px] max-w-[70vw] max-h-[70vh] object-contain opacity-[0.045] dark:opacity-[0.025] select-none" 
            />
          </div>
          <div className="relative z-10 flex-1 flex flex-col">
            <Outlet context={{ socket: activeSocket, socketConnected }} />
          </div>
        </main>

        <GlobalFooter className="mt-auto relative z-20" />
      </div>
    </div>
  );
};

export default CyberAdminLayout;

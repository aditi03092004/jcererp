import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../../store/authSlice';
import { RootState } from '../../store';
import { io, Socket } from 'socket.io-client';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Radio,
  Sliders,
  FileCode2,
  FileSpreadsheet,
  FileText,
  HeartPulse,
  LogOut,
  ExternalLink,
  ChevronRight,
  Server,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';

export const CyberAdminLayout: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);

  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [activeSocket, setActiveSocket] = useState<Socket | null>(null);

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
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  const navItems = [
    { id: 'overview', label: 'Security Overview', icon: Activity, path: '/cyberadmin/agentshield?tab=overview' },
    { id: 'live', label: 'Live Threat Monitor', icon: Radio, path: '/cyberadmin/agentshield?tab=live' },
    { id: 'incidents', label: 'Security Incidents', icon: AlertTriangle, path: '/cyberadmin/agentshield?tab=incidents' },
    { id: 'blocked', label: 'Blocked & Restricted', icon: ShieldAlert, path: '/cyberadmin/agentshield?tab=blocked' },
    { id: 'rules', label: 'Detection Rules', icon: Sliders, path: '/cyberadmin/agentshield?tab=rules' },
    { id: 'zap', label: 'OWASP ZAP Assessments', icon: FileCode2, path: '/cyberadmin/agentshield?tab=zap' },
    { id: 'audit', label: 'Security Audit Logs', icon: FileText, path: '/cyberadmin/agentshield?tab=audit' },
  ];

  const currentTab = new URLSearchParams(location.search).get('tab') || 'overview';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* ── Top SOC Navigation Bar ── */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand & Badge */}
          <div className="flex items-center space-x-3">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-cyan-500 p-0.5 shadow-lg shadow-emerald-950/50 flex items-center justify-center">
              <div className="size-full bg-slate-950 rounded-[10px] flex items-center justify-center text-emerald-400">
                <ShieldAlert className="size-5" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black text-lg tracking-wider text-white">AGENTSHIELD</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  ERP SOC
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Real-Time Threat Monitoring & Incident Response</p>
            </div>
          </div>

          {/* Telemetry Status Indicator & Quick Portal Actions */}
          <div className="flex items-center space-x-4">
            {/* Live Socket Status Badge */}
            <div
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                socketConnected
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-400'
              }`}
              title={socketConnected ? 'Connected to live WebSocket events' : 'Polling fallback active (8s)'}
            >
              <span className={`size-2 rounded-full ${socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[11px] uppercase tracking-wider">
                {socketConnected ? 'LIVE SOC ACTIVE' : 'POLLING MODE'}
              </span>
            </div>

            {/* Link back to Institutional ERP Admin Dashboard */}
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm cursor-pointer"
              title="Switch to College ERP Administration Portal"
            >
              <Server className="size-3.5 text-blue-400" />
              <span>ERP Admin Portal</span>
              <ExternalLink className="size-3 text-slate-400" />
            </button>

            {/* CyberAdmin User Capsule & Logout */}
            <div className="flex items-center space-x-3 border-l border-slate-800 pl-4">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight">
                  {user?.firstName || 'Cyber'} {user?.lastName || 'Admin'}
                </div>
                <div className="text-[10px] text-emerald-400 font-mono tracking-tight">{user?.email || 'cyberadmin@jcer.edu'}</div>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-400 border border-slate-700 hover:border-rose-800/60 text-slate-300 transition cursor-pointer"
                title="Log Out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab Navigation Strip ── */}
        <div className="border-t border-slate-800/80 bg-slate-900/60 px-4 sm:px-6 lg:px-8">
          <nav className="max-w-7xl mx-auto flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold tracking-tight whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-950/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`size-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ── Main Content Area with Socket Context ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet context={{ socket: activeSocket, socketConnected }} />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500 font-medium">
        AgentShield v2.0 • Real-Time Autonomous Threat Mitigation Engine • JCER ERP Cybersecurity Operations Center
      </footer>
    </div>
  );
};

export default CyberAdminLayout;

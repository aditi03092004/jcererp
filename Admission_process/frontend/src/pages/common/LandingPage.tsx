import React, { useEffect, useState } from 'react';
import { getAcademicYear } from '../../utils/date.util';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { HeroSection } from '../../components/common/HeroSection';
import GlobalFooter from '../../components/common/GlobalFooter';
import {
  GraduationCap,
  User,
  Users,
  MapPin,
  BookOpen,
  Upload,
  Send,
  ArrowRight,
  Sun,
  Moon,
  ShieldCheck,
  ShieldAlert,
  Globe,
  ChevronRight,
  BookOpenCheck,
  AlertTriangle,
  Mail,
  Phone
} from 'lucide-react';

interface PublicConfig {
  collegeName: string;
  admissionOpen: boolean;
  admissionCycle: string;
  maintenanceMode: boolean;
  supportEmail: string;
  supportPhone: string;
}

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);

  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark') ||
      localStorage.getItem('theme') === 'dark';
  });

  // Config state with production-grade offline fallbacks
  const [config, setConfig] = useState<PublicConfig>({
    collegeName: "Jain College of Engineering & Research",
    admissionOpen: true,
    admissionCycle: getAcademicYear(),
    maintenanceMode: false,
    supportEmail: "support.collegeerp@gmail.com",
    supportPhone: "+91 831 2400400"
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Load public system configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/system/config');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setConfig(json.data);
          }
        }
      } catch (err) {
        console.warn("Could not retrieve system config from backend, using default presets.", err);
      }
    };
    fetchConfig();
  }, []);

  // Session auto-redirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard-redirect', { replace: true });
    }
  }, [isAuthenticated, navigate]);



  const steps = [
    { label: 'Admission Details', icon: GraduationCap },
    { label: 'Personal Details', icon: User },
    { label: 'Parent Details', icon: Users },
    { label: 'Address Details', icon: MapPin },
    { label: 'Academic Details', icon: BookOpen },
    { label: 'Document Upload', icon: Upload },
    { label: 'Review & Submit', icon: Send }
  ];

  const badges = [
    { text: `Admissions Cycle: ${config.admissionCycle}`, icon: GraduationCap },
    { text: 'UG & PG Programs', icon: BookOpenCheck },
    { text: '100% Online Process', icon: Globe },
    { text: 'Secure Document Upload', icon: ShieldCheck }
  ];

  const handleErpNavigation = () => {
    navigate('/login');
  };

  const handleSignalSafeNavigation = () => {
    const signalSafeUrl = import.meta.env.VITE_SIGNALSAFE_URL || 'http://localhost:5174';
    window.location.href = signalSafeUrl;
  };

  // ── Maintenance Mode Layout ──
  if (config.maintenanceMode) {
    return (
      <div
        className="min-h-screen w-full flex flex-col justify-between relative bg-[#F8FAFC] dark:bg-[#0b0f19] text-[#1E293B] dark:text-slate-200 transition-colors duration-300 font-sans overflow-x-hidden"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(circle at 0% 0%, rgba(245, 158, 11, 0.08) 0%, transparent 50%)'
            : 'radial-gradient(circle at 0% 0%, rgba(245, 158, 11, 0.04) 0%, transparent 50%)',
          backgroundAttachment: 'fixed'
        }}
      >

        <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between border-b border-[#E2E8F0] dark:border-slate-800/80 z-10 bg-transparent">
          <div className="flex items-center gap-3.5">
            <div className="w-30 h-30 overflow-hidden rounded-full">
              <img
                src="/logo.png"
                alt="JCER Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col justify-center flex-1 space-y-0.5 text-left sm:text-left text-center">
  <h1
    className="text-[#0B4F8A] dark:text-white text-base sm:text-lg font-extrabold leading-tight tracking-tight uppercase"
    style={{ color: isDark ? '#ffffff' : '#0B4F8A' }}
  >
    {config.collegeName}
  </h1>

  <p className="text-[9px] sm:text-[10px] md:text-xs text-gray-800 dark:text-slate-300 font-medium leading-snug">
    (Approved by AICTE, New Delhi, Affiliated to VTU Belagavi & Recognized by Govt. of Karnataka)
  </p>

  <p className="text-[10px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400">
    NBA Accredited Programs – ECE & ME
  </p>
</div>
          </div>
        </header>

        <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 text-center z-10">
          <div className="max-w-md w-full bg-white dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800/80 rounded-[24px] p-8 shadow-xl backdrop-blur-md space-y-6">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-500 mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white">Portal Under Maintenance</h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                The Jain College of Engineering & Research Portal is currently undergoing scheduled maintenance. We will return shortly.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 text-left space-y-3">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black block">Support Desk</span>
              <div className="flex items-center gap-2.5 text-xs text-slate-650 dark:text-slate-350">
                <Mail className="w-4 h-4 text-[#0F4C81] dark:text-blue-450" />
                <span>{config.supportEmail}</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-650 dark:text-slate-350">
                <Phone className="w-4 h-4 text-[#0F4C81] dark:text-blue-450" />
                <span>{config.supportPhone}</span>
              </div>
            </div>
          </div>
        </main>

        <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-[#E2E8F0] dark:border-slate-800/80 text-center text-[11px] text-slate-550 dark:text-slate-450">
          <p>© {new Date().getFullYear()} Jain College of Engineering & Research, Belagavi. All rights reserved.</p>
        </footer>
      </div>
    );
  }

  // ── Standard Dashboard Gateway Layout ──
  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between relative bg-[#F8FAFC] dark:bg-[#0b0f19] text-[#1E293B] dark:text-slate-200 transition-colors duration-300 font-sans overflow-x-hidden"
    >
      <style>{`
        @keyframes flowLine {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
        .animate-flow-line-hero {
          background: linear-gradient(90deg, #E2E8F0 0%, #2563EB 25%, #F4B400 50%, #2563EB 75%, #E2E8F0 100%);
          background-size: 200% 100%;
          animation: flowLine 3s linear infinite;
        }
        .dark .animate-flow-line-hero {
          background: linear-gradient(90deg, #1E293B 0%, #3B82F6 25%, #F59E0B 50%, #3B82F6 75%, #1E293B 100%);
          background-size: 200% 100%;
          animation: flowLine 3s linear infinite;
        }
        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 14px 4px rgba(37, 99, 235, 0.25);
            transform: scale(1.05);
          }
        }
        .hover-glow:hover {
          animation: pulseGlow 1.8s infinite ease-in-out;
          border-color: #2563EB !important;
          color: #2563EB !important;
        }
        .dark .hover-glow:hover {
          border-color: #3b82f6 !important;
          color: #3b82f6 !important;
        }
        /* Feature card glassmorphism */
        .feature-glass {
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(16px) saturate(180%);
          -webkit-backdrop-filter: blur(16px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.6);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-glass:hover {
          background: rgba(255, 255, 255, 0.95);
          border-color: rgba(37, 99, 235, 0.3);
          transform: translateY(-6px) scale(1.03);
          box-shadow: 0 20px 40px -12px rgba(37, 99, 235, 0.15), 0 8px 16px -6px rgba(0, 0, 0, 0.08);
        }
        .dark .feature-glass {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .dark .feature-glass:hover {
          background: rgba(15, 23, 42, 0.85);
          border-color: rgba(59, 130, 246, 0.4);
          box-shadow: 0 20px 40px -12px rgba(59, 130, 246, 0.2), 0 8px 16px -6px rgba(0, 0, 0, 0.3);
        }
        /* Admission card premium glass */
        .admission-glass {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(24px) saturate(200%);
          -webkit-backdrop-filter: blur(24px) saturate(200%);
          border: 1px solid rgba(255, 255, 255, 0.5);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .admission-glass:hover {
          box-shadow: 0 32px 64px -16px rgba(15, 76, 129, 0.15), 0 16px 32px -8px rgba(0, 0, 0, 0.06);
          border-color: rgba(37, 99, 235, 0.2);
        }
        .dark .admission-glass {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .dark .admission-glass:hover {
          box-shadow: 0 32px 64px -16px rgba(37, 99, 235, 0.15), 0 16px 32px -8px rgba(0, 0, 0, 0.4);
          border-color: rgba(59, 130, 246, 0.25);
        }
        /* Apply Now button gradient */
        .btn-apply-gradient {
          background: linear-gradient(135deg, #0F4C81 0%, #2563EB 100%);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-apply-gradient:hover {
          background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);
          transform: translateY(-2px);
          box-shadow: 0 12px 24px -6px rgba(37, 99, 235, 0.4);
        }
        /* Hero decorative dot connector */
        .dotted-connector {
          stroke-dasharray: 4 6;
        }
      `}</style>

      {/* Header (Sticky Glassmorphism Header with Soft Shadow) */}
      <header className="sticky top-0 z-30 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-[#E2E8F0] dark:border-slate-800/70 shadow-sm transition-all duration-200">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 sm:w-18 sm:h-18 flex items-center justify-center overflow-hidden shrink-0">
              <img src="/logo.png" alt="JCER Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col justify-center flex-1 space-y-0.5 min-w-0">
              <h1 className="text-[#0B4F8A] dark:text-white text-sm sm:text-base md:text-lg font-extrabold leading-tight tracking-tight uppercase" style={{ color: isDark ? '#ffffff' : '#0B4F8A' }}>
                {config.collegeName}
              </h1>
              <p className="text-[8.5px] sm:text-[10px] md:text-xs text-slate-700 dark:text-slate-350 font-medium leading-snug">
                (Approved by AICTE, New Delhi, Affiliated to VTU Belagavi & Recognized by Govt. of Karnataka)
              </p>
              <p className="text-[9.5px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400">
                NBA Accredited Programs – ECE & ME
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            {/* 1. ERP Portal Button (First, on the left) */}
            <button
              onClick={handleErpNavigation}
              id="header-erp-btn"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold border border-[#0F4C81]/80 dark:border-slate-700 text-[#0F4C81] dark:text-slate-200 bg-white/90 dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 shadow-sm hover:shadow cursor-pointer shrink-0"
              title="Access College ERP Academic Portal"
            >
              <span>ERP Portal</span>
              <ArrowRight className="w-4 h-4 text-current transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            {/* 2. SignalSafe Campus Button (Second, immediately to its right) */}
            <button
              onClick={handleSignalSafeNavigation}
              id="header-signalsafe-btn"
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 md:px-6 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold border border-emerald-500/50 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all duration-200 shadow-sm hover:shadow cursor-pointer shrink-0"
              title="Campus Cybersecurity and Threat Detection"
            >
              <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>SignalSafe Campus</span>
            </button>
          </div>
        </div>
      </header>

      {/* Scroll container wrapper to enable proper CSS sticky behavior for the HeroSection */}
      <div className="w-full relative">
        <HeroSection isDark={isDark} admissionCycle={config.admissionCycle} />

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* ADMISSION PORTAL SECTION                                      */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <main 
          className="[--overlap-height:16px] sm:[--overlap-height:56px] md:[--overlap-height:64px] flex-grow flex flex-col items-center justify-center px-4 z-20 relative -mt-4 sm:-mt-14 md:-mt-16 pb-12 sm:pb-16"
          style={{
            background: `linear-gradient(to bottom, transparent var(--overlap-height), ${isDark ? '#0b0f19' : '#F8FAFC'} var(--overlap-height))`
          }}
        >

        {/* Main Admission Glass Card */}
        <div className="admission-glass w-full max-w-4xl rounded-[28px] p-6 sm:p-10 shadow-2xl relative overflow-hidden group animate-fadeInUp" style={{ animationDelay: '0.9s' }}>

          {/* Card Top Gradient Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#0F4C81] via-[#2563EB] to-[#F4B400] rounded-t-[28px]" />

          {/* Subtle corner glow */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-amber-500/5 dark:bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center space-y-6 relative z-10">

            {/* Title with emoji */}
            <div className="flex items-center gap-3">
              <span className="text-3xl sm:text-4xl" role="img" aria-label="graduation-cap">🎓</span>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: isDark ? '#F1F5F9' : '#0F4C81' }}>
                Admission Portal
              </h3>
            </div>

            <p className="text-xs sm:text-sm max-w-xl leading-relaxed font-semibold" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
              Apply for admission online, upload required documents, track your application status, and complete the admission process digitally.
            </p>

            {/* Horizontal steps timeline */}
            <div className="w-full py-6 overflow-x-auto scrollbar-thin">
              <div className="flex items-center justify-between min-w-[700px] px-4 relative">
                {/* Horizontal connection line with flowing gradient animation */}
                <div className="absolute top-5 left-10 right-10 h-[3px] rounded-full animate-flow-line-hero z-0" />

                {steps.map((step, index) => {
                  const StepIcon = step.icon;
                  return (
                    <div
                      key={index}
                      className="flex flex-col items-center space-y-3 z-10 flex-1 relative group/step animate-fadeInUp"
                      style={{ animationDelay: `${1.0 + index * 0.1}s` }}
                    >
                      <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center hover-glow animate-pulse-ring transition-all duration-300 shadow-md cursor-pointer"
                        style={{ color: isDark ? '#94A3B8' : '#64748B' }}
                      >
                        <StepIcon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-bold max-w-[85px] text-center leading-tight" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Application actions */}
            <div className="flex flex-col items-center space-y-4 pt-4 w-full">
              {config.admissionOpen ? (
                <>
                  <button
                    onClick={() => navigate('/admission/type')}
                    className="btn-apply-gradient px-10 py-4 text-white font-extrabold text-sm rounded-xl shadow-lg tracking-wide cursor-pointer w-full sm:w-auto min-w-[220px] active:translate-y-0"
                  >
                    Apply Now
                  </button>
                </>
              ) : (
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center max-w-md w-full">
                  <p className="text-xs sm:text-sm font-bold text-rose-500 dark:text-rose-450 uppercase tracking-wide">
                    Admissions Closed
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                    Applications for the {config.admissionCycle} cycle are currently closed. For details, contact <a href={`mailto:${config.supportEmail}`} className="text-[#2563EB] dark:text-blue-400 font-bold hover:underline">{config.supportEmail}</a>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* CAMPUS DIGITAL GATEWAYS SECTION                                */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl mt-10 z-10 animate-fadeInUp" style={{ animationDelay: '1.2s' }}>
          <div className="text-center mb-6">
            <h4 className="text-xs uppercase tracking-widest font-black text-slate-400 dark:text-slate-500">
              Campus Digital Gateways
            </h4>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-350 mt-1">
              Select a portal to access JCER institutional services and cybersecurity systems
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* Card 1: Existing ERP Portal */}
            <div className="feature-glass rounded-[24px] p-6 sm:p-7 flex flex-col justify-between border border-slate-200/80 dark:border-slate-800 shadow-md hover:shadow-xl transition-all duration-300 group">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center text-[#0F4C81] dark:text-blue-400">
                    <BookOpenCheck className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0F4C81] dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                    Institutional ERP
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mb-1">
                  ERP Portal
                </h3>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-2">
                  Academic & Administrative System
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed mb-6">
                  Access student records, class attendance rosters, grade cards, faculty workflows, and administrative management.
                </p>
              </div>

              <button
                onClick={handleErpNavigation}
                id="gateway-erp-portal-btn"
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-xs sm:text-sm text-white bg-[#0F4C81] hover:bg-[#155e9e] transition-all duration-200 shadow-md cursor-pointer group-hover:translate-x-0.5"
              >
                ERP Portal <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            {/* Card 2: New SignalSafe Campus */}
            <div className="feature-glass rounded-[24px] p-6 sm:p-7 flex flex-col justify-between border border-emerald-200/80 dark:border-emerald-800/60 shadow-md hover:shadow-xl transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                    KAVACH Threat Shield
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mb-1">
                  SignalSafe Campus
                </h3>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                  Campus Cybersecurity and Threat Detection
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-relaxed mb-6">
                  Analyze suspicious messages, websites and QR codes, and report potential cybersecurity incidents.
                </p>
              </div>

              <button
                onClick={handleSignalSafeNavigation}
                id="gateway-signalsafe-btn"
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all duration-200 shadow-md cursor-pointer group-hover:translate-x-0.5"
              >
                <ShieldAlert className="w-4 h-4" />
                SignalSafe Campus <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Link Footer Assistance */}
        <div className="mt-8 flex flex-col items-center space-y-2 z-10">
          <p className="text-xs font-medium" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
            Looking for institutional login?
          </p>
          <button
            onClick={handleErpNavigation}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold hover:text-[#2563EB] dark:hover:text-blue-300 transition-colors focus:outline-none uppercase tracking-wider cursor-pointer bg-transparent border-none"
            style={{ color: isDark ? '#60A5FA' : '#0F4C81' }}
          >
            ERP Portal Login <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </main>
    </div>

      {/* Footer */}
      <GlobalFooter className="z-20 relative bg-[#F8FAFC] dark:bg-[#0b0f19] border-t border-[#E2E8F0] dark:border-slate-800/80" />
    </div>
  );
};

export default LandingPage;

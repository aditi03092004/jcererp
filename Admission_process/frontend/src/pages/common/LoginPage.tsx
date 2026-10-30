import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginStart, loginSuccess, loginFailure } from '../../store/authSlice';
import authService from '../../services/auth.service';
import { RootState } from '../../store';
import Toast from '../../components/common/Toast';
import OtpInputBox from '../../components/common/OtpInputBox';
import { Lock, Mail, ArrowRight, Loader2, X, ArrowLeft, ShieldCheck, KeyRound, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import GlobalFooter from '../../components/common/GlobalFooter';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { loading } = useSelector((state: RootState) => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Daily OTP Modal State for Admin, Principal, Dean, HOD, and Faculty
  const [showDailyOtpModal, setShowDailyOtpModal] = useState(false);
  const [dailyOtp, setDailyOtp] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingRole, setPendingRole] = useState('');
  const [verifyingDailyOtp, setVerifyingDailyOtp] = useState(false);
  const [resendingDailyOtp, setResendingDailyOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const formatRoleTitle = (role: string) => {
    switch ((role || '').toUpperCase()) {
      case 'ADMIN':
      case 'SUPER_ADMIN':
        return 'Administrator';
      case 'PRINCIPAL':
        return 'Principal';
      case 'DEAN':
        return 'Dean Academic';
      case 'HOD':
        return 'Head of Department';
      case 'TEACHER':
      case 'FACULTY':
        return 'Faculty Member';
      default:
        return role || 'User';
    }
  };

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'OTP' | 'NEW_PASSWORD'>('EMAIL');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('expired') === 'true') {
      const isInactive = params.get('reason') === 'inactive';
      const msg = isInactive
        ? 'Your session expired due to 1 hour of inactivity. Please log in again.'
        : 'Session expired. Please log in again.';
      setToast({ type: 'error', message: msg });
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  const handleRedirect = (userRole: string) => {
    const dashboardRoutes: Record<string, string> = {
      STUDENT: '/student/dashboard',
      FACULTY: '/faculty/dashboard',
      TEACHER: '/faculty/dashboard',
      HOD: '/hod/dashboard',
      ADMIN: '/admin/dashboard',
      SUPER_ADMIN: '/admin/dashboard',
      PRINCIPAL: '/principal/dashboard',
      PARENT: '/parent/dashboard',
      DEAN: '/dean/dashboard',
      CYBERADMIN: '/cyberadmin/agentshield',
    };

    const normalizedRole = (userRole || '').trim().toUpperCase();

    const targetDashboard = dashboardRoutes[normalizedRole];

    if (targetDashboard) {
      let redirectPath = (location.state as any)?.from?.pathname;
      if (!redirectPath || redirectPath === '/login' || redirectPath === '/unauthorized' || redirectPath === '/module-unavailable') {
        redirectPath = targetDashboard;
      }
      if (redirectPath.startsWith('/student') && normalizedRole !== 'STUDENT') {
        redirectPath = targetDashboard;
      }
      if (redirectPath.startsWith('/cyberadmin') && normalizedRole !== 'CYBERADMIN' && normalizedRole !== 'SUPER_ADMIN') {
        redirectPath = targetDashboard;
      }
      if (redirectPath.startsWith('/admin') && normalizedRole !== 'ADMIN' && normalizedRole !== 'SUPER_ADMIN') {
        redirectPath = targetDashboard;
      }
      if (redirectPath.startsWith('/principal') && normalizedRole !== 'PRINCIPAL' && normalizedRole !== 'SUPER_ADMIN') {
        redirectPath = targetDashboard;
      }
      if (redirectPath.startsWith('/dean') && normalizedRole !== 'DEAN') {
        redirectPath = targetDashboard;
      }
      if (redirectPath.startsWith('/hod') && normalizedRole !== 'HOD') {
        redirectPath = targetDashboard;
      }
      navigate(redirectPath, { replace: true });
    } else {
      authService.logout();
      dispatch(loginFailure(`Invalid user role assigned: ${userRole}`));
      setToast({ type: 'error', message: `Account configuration error: Unrecognized role "${userRole}". Please contact administration.` });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setToast({ type: 'error', message: 'Please enter both User ID/Email and password.' });
      return;
    }

    try {
      dispatch(loginStart());
      const res = await authService.login(email, password);

      if (res.requiresDailyOtp) {
        dispatch(loginFailure(''));
        setPendingEmail(res.email || email);
        setPendingRole(res.role || '');
        setShowDailyOtpModal(true);
        setDailyOtp('');
        setResendCooldown(60);
        setToast({
          type: 'success',
          message: `🔐 Daily OTP required for ${formatRoleTitle(res.role || '')} login. Check your inbox for the 6-digit code.`,
        });
        return;
      }

      if (res.data?.user && res.data?.token) {
        dispatch(loginSuccess({ user: res.data.user, token: res.data.token }));
        handleRedirect(res.data.user.role);
      } else {
        throw new Error(res.message || 'Authentication failed.');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Authentication failed. Please check credentials.';
      dispatch(loginFailure(errMsg));
      setToast({ type: 'error', message: errMsg });
    }
  };

  const handleVerifyDailyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyOtp || dailyOtp.length !== 6) {
      setToast({ type: 'error', message: 'Please enter a valid 6-digit OTP code.' });
      return;
    }

    setVerifyingDailyOtp(true);
    try {
      const user = await authService.verifyDailyOtp(pendingEmail, dailyOtp);
      const token = authService.getToken() || '';
      dispatch(loginSuccess({ user, token }));
      setShowDailyOtpModal(false);
      setToast({ type: 'success', message: '✅ Daily security verification successful! Welcome back.' });
      handleRedirect(user.role);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Daily OTP verification failed.';
      setToast({ type: 'error', message: errMsg });
    } finally {
      setVerifyingDailyOtp(false);
    }
  };

  const handleResendDailyOtp = async () => {
    if (resendCooldown > 0) {
      setToast({ type: 'error', message: `Please wait ${resendCooldown} seconds before resending OTP.` });
      return;
    }
    setResendingDailyOtp(true);
    try {
      const res = await authService.resendDailyOtp(pendingEmail, password);
      setResendCooldown(60);
      setToast({ type: 'success', message: res.message || 'A new verification code has been sent to your email address.' });
    } catch (err: any) {
      // Fallback to login call if resend route is unavailable
      try {
        await authService.login(email, password);
        setResendCooldown(60);
        setToast({ type: 'success', message: 'A new verification code has been sent to your email address.' });
      } catch (fallbackErr: any) {
        const errMsg = err.response?.data?.error || fallbackErr.response?.data?.error || 'Failed to resend Daily OTP. Please try logging in again.';
        setToast({ type: 'error', message: errMsg });
      }
    } finally {
      setResendingDailyOtp(false);
    }
  };

  // ─── FORGOT PASSWORD HANDLERS ──────────────────────────────────────────────

  const handleSendForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    setForgotLoading(true);
    try {
      const res = await authService.sendForgotPasswordOtp(forgotEmail);
      setForgotStep('OTP');
      setToast({ type: 'success', message: res.data?.message || 'If an account exists, a 6-digit password reset OTP has been sent.' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to send password reset OTP.' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp || forgotOtp.length !== 6) {
      setToast({ type: 'error', message: 'Please enter a 6-digit numeric OTP code.' });
      return;
    }

    setForgotLoading(true);
    try {
      await authService.verifyForgotPasswordOtp(forgotEmail, forgotOtp);
      setForgotStep('NEW_PASSWORD');
      setToast({ type: 'success', message: 'OTP verified successfully! Please enter your new password.' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Invalid or expired OTP code.' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setToast({ type: 'error', message: 'Password must be at least 8 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setForgotLoading(true);
    try {
      const res = await authService.resetPassword(forgotEmail, newPassword, confirmPassword);
      setShowForgotModal(false);
      setForgotStep('EMAIL');
      setForgotEmail('');
      setForgotOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({ type: 'success', message: res.data?.message || 'Password reset successfully! Please log in with your new password.' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Password reset failed.' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col justify-between font-sans selection:bg-indigo-500/30 bg-slate-950">
      
      {/* ── HERO / LOGIN MAIN CONTENT SECTION ── */}
      <main className="flex-1 w-full flex flex-col justify-center items-center px-4 py-4 sm:py-6 lg:py-8 relative">
        {/* Background Image Container strictly scoped and clipped */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat blur-[3px] scale-105" 
            style={{ backgroundImage: 'url("/college.png")' }}
          />
          {/* Slightly blue/indigo dark overlay for readability and premium aesthetic */}
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/80 via-blue-950/60 to-indigo-900/40"></div>
        </div>

        {/* Back to Home Button at top left */}
        <button
          onClick={() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
          }}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-medium text-sm transition-all duration-200 shadow-lg cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>
        
        {toast && (
          <Toast
            type={toast.type}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        )}

        {/* Global Header Section */}
        <div className="w-full max-w-4xl text-center space-y-3 mb-4 sm:mb-5 lg:mb-6 z-10 hidden sm:block">
          <div className="flex justify-center">
            <div 
              className="w-[88px] h-[88px] sm:w-[94px] sm:h-[94px] rounded-full bg-white overflow-hidden flex items-center justify-center shadow-sm"
              style={{ backgroundColor: '#ffffff' }}
            >
              <img
                src="/logo.png"
                alt="JCER Logo"
                className="w-full h-full object-cover bg-white rounded-full"
                style={{ backgroundColor: '#ffffff' }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl md:text-[32px] font-extrabold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              JAIN COLLEGE OF ENGINEERING AND RESEARCH
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-neutral-200 drop-shadow-sm">
              (Approved by AICTE, New Delhi, Affiliated to VTU Belagavi & Recognized by Govt. of Karnataka)
            </p>
            <p className="text-xs sm:text-sm font-semibold text-neutral-200 drop-shadow-sm">
              NBA Accredited Programs - ECE & ME
            </p>
            <p className="text-sky-300 pt-0.5 text-xs sm:text-sm font-bold tracking-wider uppercase drop-shadow-sm">
              Secure ERP Portal
            </p>
          </div>
        </div>

        {/* Mobile-Only Header Layout */}
        <div className="w-full text-center space-y-2.5 mb-4 z-10 sm:hidden">
          <div className="flex justify-center">
            <div 
              className="w-[76px] h-[76px] rounded-full bg-white overflow-hidden flex items-center justify-center shadow-sm"
              style={{ backgroundColor: '#ffffff' }}
            >
              <img 
                src="/logo.png" 
                alt="JCER Logo" 
                className="w-full h-full object-cover bg-white rounded-full" 
                style={{ backgroundColor: '#ffffff' }}
              />
            </div>
          </div>
          <div className="px-2 space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-white drop-shadow-md">JAIN COLLEGE OF ENGINEERING AND RESEARCH</h2>
            <p className="text-[11px] font-semibold text-neutral-200 leading-tight">Approved by AICTE • Affiliated to VTU • Recognized by Govt. of Karnataka</p>
            <p className="text-[11px] font-semibold text-neutral-200">NBA Accredited Programs - ECE & ME</p>
            <p className="text-sky-300 text-xs font-bold uppercase tracking-wider pt-0.5">Secure ERP Portal</p>
          </div>
        </div>

        {/* Login Card Container */}
        <div className="w-full max-w-[450px] bg-white/40 backdrop-blur-md border border-white/20 rounded-3xl z-10 px-6 sm:px-8 py-7 sm:py-8 md:py-9 shadow-xl shadow-neutral-200/30">
          <form onSubmit={handleSubmit} className="space-y-4.5 sm:space-y-5">
            {/* User ID / Email */}
            <div className="space-y-1.5 sm:space-y-2">
              <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wider pl-1">
                User ID / Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 dark-input-icon !text-slate-800" style={{ color: '#0F172A', stroke: '#0F172A' }} />
                </div>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`e.g. email@example.com`}
                  className="w-full h-[48px] sm:h-[50px] bg-white/90 border border-neutral-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl pl-11 pr-4 text-sm font-medium focus:outline-none transition-all duration-200 placeholder:text-neutral-400 text-slate-900 light-input-mode shadow-sm"
                  style={{ color: '#0F172A', WebkitTextFillColor: '#0F172A' }}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex justify-between items-center pl-1 pr-1">
                <label className="block text-xs font-bold text-neutral-600 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotStep('EMAIL');
                    setForgotEmail(email);
                    setShowForgotModal(true);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors bg-transparent border-none cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 dark-input-icon !text-slate-800" style={{ color: '#0F172A', stroke: '#0F172A' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-[48px] sm:h-[50px] bg-white/90 border border-neutral-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl pl-11 pr-11 text-sm font-medium focus:outline-none transition-all duration-200 placeholder:text-neutral-400 text-slate-900 light-input-mode shadow-sm"
                  style={{ color: '#0F172A', WebkitTextFillColor: '#0F172A' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 !text-slate-900" style={{ color: '#0F172A', stroke: '#0F172A' }} />
                  ) : (
                    <Eye className="h-5 w-5 !text-slate-900" style={{ color: '#0F172A', stroke: '#0F172A' }} />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className="group w-full h-[48px] sm:h-[50px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 rounded-2xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/40 transition-all duration-300 text-sm cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In Securely</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* ── LIGHT TRANSLUCENT GLASS FOOTER (BELOW HERO SECTION) ── */}
      <GlobalFooter variant="light-glass" className="relative z-20 shrink-0" />

      {/* ─── ADMIN & PRINCIPAL DAILY OTP MODAL ───────────────────────────────── */}
      {showDailyOtpModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-in fade-in">
          <div 
            className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 sm:p-7 relative overflow-hidden"
            style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
          >
            
            {/* Top Close Button */}
            <button 
              type="button"
              onClick={() => setShowDailyOtpModal(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer border-none z-10 hover:scale-105"
              style={{ backgroundColor: '#f1f5f9', color: '#0f172a' }}
              title="Close modal"
            >
              <X className="w-5 h-5" style={{ color: '#0f172a', stroke: '#0f172a' }} />
            </button>

            <div className="space-y-5">
              
              {/* Header Icon & Title */}
              <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                  style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe' }}
                >
                  <ShieldCheck className="w-6 h-6" style={{ color: '#4f46e5', stroke: '#4f46e5' }} />
                </div>
                <div>
                  <h3 
                    className="text-base font-extrabold uppercase tracking-wide"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  >
                    Daily Login Authentication
                  </h3>
                  <p 
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: '#64748b', WebkitTextFillColor: '#64748b' }}
                  >
                    Daily security verification for <strong style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', fontWeight: '800' }}>{formatRoleTitle(pendingRole)}</strong> ({pendingEmail})
                  </p>
                </div>
              </div>

              {/* Amber Info Box */}
              <div 
                className="rounded-2xl p-4 text-xs font-semibold space-y-1 shadow-sm"
                style={{ backgroundColor: '#fffbe6', border: '1.5px solid #fef08a', color: '#78350f' }}
              >
                <p className="font-bold text-xs" style={{ color: '#78350f', WebkitTextFillColor: '#78350f' }}>
                  ⏱ A 6-digit OTP code has been sent to <strong style={{ color: '#451a03', WebkitTextFillColor: '#451a03', fontWeight: '800' }}>{pendingEmail}</strong>.
                </p>
                <p className="text-[11px] leading-relaxed pt-0.5" style={{ color: '#92400e', WebkitTextFillColor: '#92400e' }}>
                  Once verified, your authentication remains valid for 24 hours.
                </p>
              </div>

              <form onSubmit={handleVerifyDailyOtpSubmit} className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label 
                    className="text-xs font-bold uppercase tracking-wider block text-center"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  >
                    Enter 6-Digit Daily OTP <span style={{ color: '#f43f5e', WebkitTextFillColor: '#f43f5e' }}>*</span>
                  </label>
                  <OtpInputBox
                    value={dailyOtp}
                    onChange={setDailyOtp}
                    onEnterSubmit={() => {
                      if (dailyOtp.length === 6 && !verifyingDailyOtp) {
                        handleVerifyDailyOtpSubmit({ preventDefault: () => {} } as any);
                      }
                    }}
                    disabled={verifyingDailyOtp}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleResendDailyOtp}
                    disabled={resendingDailyOtp || verifyingDailyOtp || resendCooldown > 0}
                    className="text-xs font-bold hover:underline bg-transparent border-none cursor-pointer disabled:opacity-50"
                    style={{ color: '#4f46e5', WebkitTextFillColor: '#4f46e5' }}
                  >
                    {resendingDailyOtp
                      ? 'Resending...'
                      : resendCooldown > 0
                      ? `Resend OTP in ${resendCooldown}s`
                      : 'Resend Daily OTP'}
                  </button>

                  <button
                    type="submit"
                    disabled={verifyingDailyOtp || dailyOtp.length !== 6}
                    className="font-extrabold py-3.5 px-6 rounded-2xl shadow-lg transition-all text-xs cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none active:scale-[0.98]"
                    style={{ backgroundColor: '#4f46e5', color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                  >
                    {verifyingDailyOtp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                        <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Verifying...</span>
                      </>
                    ) : (
                      <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Verify & Sign In</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── REUSABLE FORGOT PASSWORD MODAL (ALL ROLES) ────────────────────── */}
      {showForgotModal && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-in fade-in">
          <div 
            className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6 sm:p-7 relative overflow-hidden"
            style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
          >
            
            {/* Top Close Button */}
            <button 
              type="button"
              onClick={() => { if (!forgotLoading) setShowForgotModal(false); }}
              className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer border-none z-10 hover:scale-105"
              style={{ backgroundColor: '#f1f5f9', color: '#0f172a' }}
              title="Close modal"
            >
              <X className="w-5 h-5" style={{ color: '#0f172a', stroke: '#0f172a' }} />
            </button>

            <div className="space-y-5">
              
              {/* Header Icon & Title */}
              <div className="flex items-center gap-3.5 border-b border-slate-100 pb-4">
                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                  style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe' }}
                >
                  <KeyRound className="w-6 h-6" style={{ color: '#4f46e5', stroke: '#4f46e5' }} />
                </div>
                <div>
                  <h3 
                    className="text-base font-extrabold uppercase tracking-wide"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  >
                    Password Recovery
                  </h3>
                  <p 
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: '#64748b' }}
                  >
                    Reset your password via 6-digit email verification code
                  </p>
                </div>
              </div>

              {/* Step 1: Request OTP */}
              {forgotStep === 'EMAIL' && (
                <form onSubmit={handleSendForgotOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <label 
                      className="text-xs font-bold uppercase tracking-wider block"
                      style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                    >
                      Registered Email Address <span style={{ color: '#f43f5e', WebkitTextFillColor: '#f43f5e' }}>*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5" style={{ color: '#64748b', stroke: '#64748b' }} />
                      </div>
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="e.g. name@example.com"
                        className="w-full border rounded-2xl py-3.5 pl-[52px] pr-4 font-bold outline-none transition-all placeholder:text-slate-400 shadow-sm"
                        style={{ backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a', WebkitTextFillColor: '#0f172a', fontSize: '15px' }}
                      />
                    </div>
                    <p className="text-[11px] font-medium pt-0.5" style={{ color: '#475569', WebkitTextFillColor: '#475569' }}>
                      We will send a 6-digit password reset code to your registered email address.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail}
                    className="w-full font-extrabold py-3.5 px-4 rounded-2xl shadow-lg transition-all duration-200 text-xs cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 border-none active:scale-[0.98]"
                    style={{ backgroundColor: '#4f46e5', color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                        <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Sending Verification Code...</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Send Verification Code</span>
                        <ArrowRight className="w-4 h-4" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Step 2: Verify OTP */}
              {forgotStep === 'OTP' && (
                <form onSubmit={handleVerifyForgotOtp} className="space-y-4">
                  <div 
                    className="rounded-2xl p-4 text-xs font-semibold space-y-1.5 shadow-sm"
                    style={{ backgroundColor: '#f1f5f9', border: '1.5px solid #cbd5e1', color: '#0f172a' }}
                  >
                    <p className="flex items-center gap-2 font-bold text-sm" style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}>
                      <CheckCircle2 size={16} style={{ color: '#16a34a', stroke: '#16a34a' }} className="shrink-0" />
                      <span style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', fontWeight: '800' }}>Verification Code Sent</span>
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: '#334155', WebkitTextFillColor: '#334155' }}>
                      Enter the 6-digit OTP sent to <strong style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', fontWeight: '800' }}>{forgotEmail}</strong>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label 
                      className="text-xs font-bold uppercase tracking-wider block text-center"
                      style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                    >
                      Enter 6-Digit OTP Code <span style={{ color: '#f43f5e', WebkitTextFillColor: '#f43f5e' }}>*</span>
                    </label>
                    <OtpInputBox
                      value={forgotOtp}
                      onChange={setForgotOtp}
                      onEnterSubmit={() => {
                        if (forgotOtp.length === 6 && !forgotLoading) {
                          handleVerifyForgotOtp({ preventDefault: () => {} } as any);
                        }
                      }}
                      disabled={forgotLoading}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setForgotStep('EMAIL')}
                      className="text-xs font-bold hover:underline bg-transparent border-none cursor-pointer"
                      style={{ color: '#4f46e5', WebkitTextFillColor: '#4f46e5' }}
                    >
                      ← Change Email
                    </button>

                    <button
                      type="submit"
                      disabled={forgotLoading || forgotOtp.length !== 6}
                      className="font-extrabold py-3.5 px-6 rounded-2xl shadow-lg transition-all text-xs cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 border-none active:scale-[0.98]"
                      style={{ backgroundColor: '#4f46e5', color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                    >
                      {forgotLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                          <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Verifying Code...</span>
                        </>
                      ) : (
                        <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Verify Code</span>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: Set New Password */}
              {forgotStep === 'NEW_PASSWORD' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label 
                      className="text-xs font-bold uppercase tracking-wider block"
                      style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                    >
                      New Password <span style={{ color: '#f43f5e', WebkitTextFillColor: '#f43f5e' }}>*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5" style={{ color: '#64748b', stroke: '#64748b' }} />
                      </div>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        className="w-full border rounded-2xl py-3.5 pl-[52px] pr-11 font-bold outline-none transition-all placeholder:text-slate-400 shadow-sm"
                        style={{ backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a', WebkitTextFillColor: '#0f172a', fontSize: '15px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewPassword ? <EyeOff className="h-5 w-5 !text-slate-900" style={{ color: '#0F172A', stroke: '#0F172A' }} /> : <Eye className="h-5 w-5 !text-slate-900" style={{ color: '#0F172A', stroke: '#0F172A' }} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label 
                      className="text-xs font-bold uppercase tracking-wider block"
                      style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                    >
                      Confirm New Password <span style={{ color: '#f43f5e', WebkitTextFillColor: '#f43f5e' }}>*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5" style={{ color: '#64748b', stroke: '#64748b' }} />
                      </div>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full border rounded-2xl py-3.5 pl-[52px] pr-11 font-bold outline-none transition-all placeholder:text-slate-400 shadow-sm"
                        style={{ backgroundColor: '#f8fafc', borderColor: '#cbd5e1', color: '#0f172a', WebkitTextFillColor: '#0f172a', fontSize: '15px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors bg-transparent border-none cursor-pointer"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5 !text-slate-900" style={{ color: '#0F172A', stroke: '#0F172A' }} /> : <Eye className="h-5 w-5 !text-slate-900" style={{ color: '#0F172A', stroke: '#0F172A' }} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || !newPassword || newPassword !== confirmPassword}
                    className="w-full font-extrabold py-3.5 px-4 rounded-2xl shadow-lg transition-all text-xs cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2 border-none active:scale-[0.98]"
                    style={{ backgroundColor: '#4f46e5', color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ffffff', stroke: '#ffffff' }} />
                        <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Updating Password...</span>
                      </>
                    ) : (
                      <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Set New Password & Back to Login</span>
                    )}
                  </button>
                </form>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default LoginPage;
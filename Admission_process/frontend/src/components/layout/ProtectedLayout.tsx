import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import ForcePasswordChange from '../auth/ForcePasswordChange';

export const ProtectedLayout: React.FC = () => {
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const location = useLocation();

  if (!isAuthenticated) {
    if (location.pathname.startsWith('/admission')) {
      return <Navigate to="/admission/login" state={{ from: location }} replace />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = user?.role || '';

  // Admission routes: only STUDENT
  if (location.pathname.startsWith('/admission') && role !== 'STUDENT') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Admin routes: ADMIN, SUPER_ADMIN, or PRINCIPAL
  if (location.pathname.startsWith('/admin') && role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'PRINCIPAL') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Student routes: only STUDENT
  if (location.pathname.startsWith('/student') && role !== 'STUDENT') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Teacher routes: only TEACHER
  if (location.pathname.startsWith('/teacher') && role !== 'TEACHER') {
    return <Navigate to="/unauthorized" replace />;
  }

  // HOD routes: HOD, SUPER_ADMIN, or ADMIN
  if (location.pathname.startsWith('/hod') && role !== 'HOD' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Principal routes: PRINCIPAL, SUPER_ADMIN, or ADMIN
  if (location.pathname.startsWith('/principal') && role !== 'PRINCIPAL' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Dean routes: DEAN, SUPER_ADMIN, or ADMIN
  if (location.pathname.startsWith('/dean') && role !== 'DEAN' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  // Faculty routes: FACULTY, TEACHER, HOD, DEAN, PRINCIPAL, SUPER_ADMIN, or ADMIN
  if (
    location.pathname.startsWith('/faculty') &&
    role !== 'FACULTY' &&
    role !== 'TEACHER' &&
    role !== 'HOD' &&
    role !== 'DEAN' &&
    role !== 'PRINCIPAL' &&
    role !== 'SUPER_ADMIN' &&
    role !== 'ADMIN'
  ) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Parent routes: only PARENT
  if (location.pathname.startsWith('/parent') && role !== 'PARENT') {
    return <Navigate to="/unauthorized" replace />;
  }

  // CyberAdmin routes: CYBERADMIN or SUPER_ADMIN
  if (location.pathname.startsWith('/cyberadmin') && role !== 'CYBERADMIN' && role !== 'SUPER_ADMIN') {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <>
      {user?.mustChangePassword && role !== 'HOD' && role !== 'FACULTY' && role !== 'TEACHER' && <ForcePasswordChange />}
      <Outlet />
    </>
  );
};

export default ProtectedLayout;

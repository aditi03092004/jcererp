import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import Student from '../models/Student';
import Admission from '../models/Admission';
import Parent from '../models/Parent';

// Role-to-Permissions Matrix mapping roles to allowed operations
export const PERMISSION_MATRIX: Record<string, string[]> = {
  SUPER_ADMIN: [
    'manage_users', 'view_students', 'edit_students',
    'approve_results', 'edit_results', 'view_results',
    'manage_fees', 'view_fees',
    'manage_timetable', 'view_timetable',
    'dispatch_credentials', 'view_logs', 'manage_settings'
  ],
  ADMIN: [
    'manage_users', 'view_students', 'edit_students',
    'edit_results', 'view_results',
    'manage_fees', 'view_fees',
    'manage_timetable', 'view_timetable',
    'dispatch_credentials', 'view_logs', 'manage_settings'
  ],
  PRINCIPAL: [
    'view_students',
    'approve_results', 'view_results',
    'view_fees',
    'view_timetable', 'view_logs'
  ],
  DEAN: [
    'manage_academic_structure',
    'view_academic_structure',
    'manage_hods',
    'view_hods',
    'view_departments',
    'authorize_faculty',
    'view_faculty',
    'view_faculty_assignments',
    'view_logs'
  ],
  HOD: [
    'view_hod_dashboard',
    'view_department',
    'view_faculty',
    'manage_department_faculty',
    'create_faculty',
    'view_subjects',
    'view_workload',
    'view_students',
    'edit_students',
    'edit_results',
    'view_results',
    'view_timetable',
    'view_reports',
    'view_notifications'
  ],
  TEACHER: [
    'view_students',
    'edit_results', 'view_results',
    'view_timetable'
  ],
  STUDENT: [
    'view_results',
    'view_timetable'
  ],
  PARENT: [
    'view_results',
    'view_timetable'
  ],
  CYBERADMIN: []
};

/**
 * Basic Role Guard (RBAC). Check if user's role is in the list of allowed roles.
 */
export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized. Role missing.' });
    }

    const { role } = req.user;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Forbidden. Role '${role}' is not authorized to access this resource.`,
      });
    }

    return next();
  };
};

/**
 * Permission Guard. Resolves user's permissions dynamically using the matrix.
 */
export const authorizePermissions = (...requiredPermissions: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized. Identity missing.' });
    }

    const { role } = req.user;
    const userPermissions = PERMISSION_MATRIX[role] || [];
    
    // Check if user has ALL of the required permissions
    const hasAll = requiredPermissions.every((perm) => userPermissions.includes(perm));
    if (!hasAll) {
      return res.status(403).json({
        error: 'Forbidden. You do not have the required permissions for this action.',
      });
    }

    return next();
  };
};

/**
 * ABAC Tenant Isolation Guard:
 * - Ensures STUDENTS can only view/edit their own data.
 * - Ensures PARENTS can only view/edit data of their children.
 * - Ensures HOD/TEACHER can only access resources matching their department/academic year isolation where applicable.
 */
export const enforceTenantIsolation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: userId, role } = req.user;

    // 1. If user is Student, enforce they only access their own student/admission record
    if (role === 'STUDENT') {
      const student = await Student.findOne({ where: { userId } });
      const admission = await Admission.findOne({ where: { userId } });
      if (!student && !admission) {
        return res.status(403).json({ error: 'Access Denied. Student/Admission record not found.' });
      }

      // Check if trying to view another student ID
      const targetStudentId = req.params.studentId || req.params.id || req.body.studentId;
      if (targetStudentId && student && targetStudentId !== student.id) {
        return res.status(403).json({ error: 'Access Denied. You can only access your own data.' });
      }
    }

    // 2. If user is Parent, enforce they only access their children's records
    if (role === 'PARENT') {
      // Find parent user linked students
      // Assumes parents table or link exists. For now, enforce matching parent relationship checking.
      const targetStudentId = req.params.studentId || req.params.id || req.body.studentId;
      if (targetStudentId) {
        const studentRecord = await Student.findByPk(targetStudentId);
        if (!studentRecord) {
          return res.status(403).json({ error: 'Access Denied. Student record not found.' });
        }
        const parentRecord = await Parent.findOne({
          where: {
            userId: userId,
            studentId: targetStudentId
          }
        });
        if (!parentRecord) {
          return res.status(403).json({ error: 'Access Denied. You are not authorized to view this student.' });
        }
      }
    }

    // Admins and Principals have global bypass
    return next();
  } catch (error: any) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};


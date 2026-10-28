import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import User from '../models/User';
import Department from '../models/Department';
import Admission from '../models/Admission';
import AdmissionPersonalDetail from '../models/AdmissionPersonalDetail';
import AdmissionParentDetail from '../models/AdmissionParentDetail';
import AdmissionAddress from '../models/AdmissionAddress';
import AdmissionAcademicDetail from '../models/AdmissionAcademicDetail';
import AdmissionDocument from '../models/AdmissionDocument';
import RejectionReason from '../models/RejectionReason';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import Subject from '../models/Subject';
import Teacher from '../models/Teacher';
import FacultyAuthorizationRequest from '../models/FacultyAuthorizationRequest';
import FacultyAssignment from '../models/FacultyAssignment';
import AcademicYear from '../models/AcademicYear';
import admissionService from '../services/admission.service';
import emailService from '../services/email.service';
import db from '../config/database';
import AnalyticsService from '../services/analytics.service';
import securityEvents from '../services/securityEvents.service';
import facultyAuthorizationService from '../services/facultyAuthorization.service';
import teachingProfileService from '../services/teachingProfile.service';
import logger from '../utils/logger.util';

interface AuthRequest extends Request {
  user?: { id: string; role: string; firstName?: string; lastName?: string; email?: string };
}

// Helper to record audit log for Principal actions
const logPrincipalAudit = async (req: AuthRequest, action: string, details: any) => {
  try {
    await AuditLog.create({
      userId: req.user?.id || null,
      action,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'System',
      details,
    });
  } catch (err: any) {
    console.error('Principal AuditLog Error:', err.message);
  }
};

// Helper to seed principal data inline if missing
const ensurePrincipalDataSeeded = async () => {
  try {
    let principalUser = await User.findOne({ where: { role: 'PRINCIPAL' } });
    if (!principalUser) {
      const email = process.env.INITIAL_PRINCIPAL_EMAIL || 'arihantdesai47@gmail.com';
      const rawPassword = process.env.INITIAL_PRINCIPAL_PASSWORD || 'Desai@2004';
      const passwordHash = await bcrypt.hash(rawPassword, 10);
      principalUser = await User.create({
        username: email,
        email: email,
        passwordHash: passwordHash,
        role: 'PRINCIPAL',
        status: 'ACTIVE',
        firstName: 'Dr. S.V.',
        lastName: 'Gorbal',
        phone: '9876543201',
        profileImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&fit=crop',
        mustChangePassword: false
      });
      console.log('✓ Default Principal User seeded successfully.');
    }
  } catch (err: any) {
    console.error('Error seeding principal user:', err.message);
  }
};

/** GET /api/principal/dashboard */
export const getDashboardData = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    await ensurePrincipalDataSeeded();

    const transaction = await db.transaction({ readOnly: true });
    try {
      const totalStudents = await User.count({ where: { role: 'STUDENT' }, transaction });
      const pendingAdmissionsCount = await Admission.count({
        where: { applicationStatus: 'APPROVED' },
        transaction
      });
      const enrolledCount = await Admission.count({
        where: { applicationStatus: 'ENROLLED' },
        transaction
      });
      const facultyCount = await User.count({
        where: { role: 'TEACHER' },
        transaction
      });
      const departments = await Department.findAll({ transaction });

      // Construct Critical Actions List
      const criticalActions = pendingAdmissionsCount > 0 ? [
        {
          id: 'admissions',
          priority: 'HIGH' as const,
          title: `${pendingAdmissionsCount} Admission${pendingAdmissionsCount > 1 ? 's' : ''} Awaiting Final Confirmation`,
          description: 'Applications verified by admin pending final principal confirmation.',
          actionText: 'Review Admissions',
          link: '/principal/admissions',
          count: pendingAdmissionsCount,
        }
      ] : [];

      const kpis = {
        students: enrolledCount || totalStudents || 0,
        faculty: facultyCount || 0,
        passRate: 0,
        avgCgpa: 0,
        placementRate: 0,
        feeCollectionRate: 0,
        revenue: '₹0'
      };

      // Build department performance from real student counts per department
      const departmentPerformance = await Promise.all(
        departments.map(async (d) => {
          const studentCount = await Admission.count({
            where: { applicationStatus: 'ENROLLED', branchId: d.id },
            transaction
          });
          return {
            id: d.id,
            name: d.name,
            code: d.code,
            students: studentCount,
            passRate: 0,
            cgpa: 0,
            trend: '—'
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          kpis,
          criticalActions,
          departmentPerformance,
          insights: [],
          performanceTrends: [],
          upcomingEvents: []
        }
      });
    } finally {
      await transaction.commit();
    }
  } catch (err) {
    return next(err);
  }
};


/** GET /api/principal/admissions/stats */
export const getAdmissionsStats = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const [pending, enrolled, rejected, total] = await Promise.all([
      Admission.count({ where: { applicationStatus: 'APPROVED' } }),
      Admission.count({ where: { applicationStatus: { [Op.in]: ['PRINCIPAL_APPROVED', 'ENROLLED'] } } }),
      Admission.count({ where: { applicationStatus: 'REJECTED' } }),
      Admission.count({ where: { applicationStatus: { [Op.ne]: 'DRAFT' } } }),
    ]);
    return res.json({
      success: true,
      data: { approved: pending, enrolled, rejected, total }
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/principal/admissions/list */
export const listAdmissions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { status, branchId, admissionType, search, sortBy, sortOrder = 'DESC', page = '1', limit = '10' } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};
    if (status && status !== 'ALL') {
      if (status === 'ENROLLED') {
        where.applicationStatus = { [Op.in]: ['PRINCIPAL_APPROVED', 'ENROLLED'] };
      } else if (status === 'PRINCIPAL_APPROVED') {
        where.applicationStatus = 'PRINCIPAL_APPROVED';
      } else if (status === 'REJECTED') {
        where.applicationStatus = 'REJECTED';
      } else if (status === 'APPROVED') {
        where.applicationStatus = 'APPROVED';
      }
    } else {
      // Exclude DRAFT and SUBMITTED/UNDER_REVIEW/CORRECTION_REQUIRED/RESUBMITTED applications by default for Principal
      where.applicationStatus = { [Op.in]: ['APPROVED', 'PRINCIPAL_APPROVED', 'ENROLLED', 'REJECTED', 'CANCELLED'] };
    }
    if (branchId && branchId !== 'ALL') where.branchId = branchId;
    if (admissionType && admissionType !== 'ALL') where.admissionType = admissionType;

    const include: any[] = [
      {
        model: User,
        as: 'user',
        required: !!search,
        attributes: ['id', 'email', 'firstName', 'lastName', 'phone', 'profileImage'],
        ...(search ? {
          where: {
            [Op.or]: [
              { firstName: { [Op.iLike]: `%${search}%` } },
              { lastName: { [Op.iLike]: `%${search}%` } },
              { email: { [Op.iLike]: `%${search}%` } },
            ]
          }
        } : {})
      },
      { model: Department, as: 'branch', required: false },
      { model: AdmissionPersonalDetail, as: 'studentpersonaldetails', required: false },
      { model: AdmissionParentDetail, as: 'studentparentdetails', required: false },
      { model: AdmissionAddress, as: 'studentaddress', required: false },
      { model: AdmissionAcademicDetail, as: 'studentacademicdetails', required: false },
      { model: AdmissionDocument, as: 'studentdocuments', required: false },
    ];

    let order: any[] = [['createdAt', sortOrder]];
    if (sortBy === 'rank') order = [['applicationNumber', sortOrder]];

    const { count, rows } = await Admission.findAndCountAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: {
        total: count,
        page: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        applications: rows,
      }
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/principal/admissions/:id */
export const getAdmissionById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const data = await admissionService.getApplicationById(id);
    if (!data) return res.status(404).json({ error: 'Application not found.' });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/principal/admissions/pending */
export const getPendingAdmissions = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    await ensurePrincipalDataSeeded();

    const list = await Admission.findAll({
      where: { 
        applicationStatus: 'APPROVED'
      },
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'firstName', 'lastName', 'phone', 'profileImage'] },
        { model: Department, as: 'branch' },
        { model: AdmissionPersonalDetail, as: 'studentpersonaldetails' },
        { model: AdmissionParentDetail, as: 'studentparentdetails' },
        { model: AdmissionAddress, as: 'studentaddress' },
        { model: AdmissionAcademicDetail, as: 'studentacademicdetails' },
        { model: AdmissionDocument, as: 'studentdocuments' }
      ],
      order: [['updatedAt', 'DESC']]
    });

    const rejectionReasons = await RejectionReason.findAll();

    return res.json({
      success: true,
      data: {
        applications: list,
        rejectionReasons
      }
    });
  } catch (err) {
    return next(err);
  }
};

/** PUT /api/principal/admissions/:id/decide */
export const decideAdmission = async (
  req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { remarks, rejectionReason, rejectReasonCode } = req.body;
    let decision = req.body.decision || req.body.status;

    if (!decision) {
      if (req.path.endsWith('/approve')) {
        decision = 'APPROVED';
      } else {
        decision = 'REJECTED';
      }
    }

    const validDecisions = ['APPROVED', 'REJECTED', 'CORRECTION_REQUIRED', 'REJECT'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision type.' });
    }

    let targetStatus: 'ENROLLED' | 'REJECTED' | 'CORRECTION_REQUIRED' = 'REJECTED';
    if (decision === 'APPROVED') {
      targetStatus = 'ENROLLED';
    } else if (decision === 'CORRECTION_REQUIRED') {
      targetStatus = 'CORRECTION_REQUIRED';
    } else {
      targetStatus = 'REJECTED';
    }

    const enrollmentNumber = await admissionService.updateStatus(
      id,
      targetStatus,
      req.user!.id,
      remarks || rejectionReason,
      rejectionReason || remarks,
      rejectReasonCode,
      req.body.sections
    );

    // Save principal audit accountability
    const admission = await Admission.findByPk(id);
    const principalUser = await User.findByPk(req.user!.id);
    const principalName = principalUser ? `${principalUser.firstName || ''} ${principalUser.lastName || ''}`.trim() : 'Principal';

    if (admission) {
      await admission.update({
        principalReviewedBy: req.user!.id,
        principalReviewedAt: new Date(),
        principalApprovedAt: targetStatus === 'ENROLLED' ? new Date() : null,
        principalRemarks: remarks || rejectionReason || null,
        adminRemarks: remarks || rejectionReason || admission.adminRemarks || null,
        rejectionReason: rejectionReason || remarks || admission.rejectionReason || null,
      });

      if (targetStatus === 'REJECTED' || targetStatus === 'CORRECTION_REQUIRED') {
        try {
          const user = await User.findByPk(admission.userId);
          if (user) {
            await emailService.sendCorrectionRequiredNotification(
              user.email,
              {
                studentName: `${user.firstName} ${user.lastName}`.trim(),
                applicationNumber: admission.applicationNumber || '',
                applicationType: 'FRESH_ADMISSION',
                reason: rejectionReason || remarks || (targetStatus === 'REJECTED' ? 'Application Rejected by Principal' : 'Correction Required'),
                remarks: remarks || rejectionReason || ''
              }
            );
          }
        } catch (err: any) {
          console.error('Failed to send notification email:', err.message);
        }
      }
    }

    // Audit Log recording Principal Name, Date & Time, Selected Reason, Optional Remarks
    await securityEvents.logAdmissionAudit({
      userId: req.user!.id,
      action: targetStatus === 'ENROLLED' ? 'PRINCIPAL_ENROLL' : 'PRINCIPAL_REJECT_ADMISSION',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      admissionOrId: admission || id,
      details: {
        principalName,
        academicYear: admission?.academicYear,
        timestamp: new Date(),
        mode: 'INDIVIDUAL',
        action: targetStatus === 'ENROLLED' ? 'ENROLLED' : 'REJECTED',
        previousStatus: 'AWAITING_PRINCIPAL_APPROVAL',
        newStatus: targetStatus,
        enrollmentNumber,
        correctionReason: rejectionReason || remarks || (targetStatus === 'REJECTED' ? 'Rejected' : null),
        remarks: remarks || null,
      },
    });

    return res.json({
      success: true,
      message: `Admission application has been ${targetStatus === 'ENROLLED' ? 'approved and enrolled' : 'returned for correction'} successfully.`,
      data: {
        admissionId: id,
        applicationNumber: admission?.applicationNumber,
        enrollmentNumber,
        status: targetStatus,
      }
    });
  } catch (err: any) {
    console.error('Error in principal decideAdmission:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

/** POST /api/principal/admissions/bulk-confirm */
export const bulkConfirmAdmissions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const rawIds = req.body.admissionIds || req.body.ids;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least one admission ID to confirm and enroll.'
      });
    }

    // Deduplicate IDs
    const uniqueIds = Array.from(new Set(rawIds.map((id: any) => String(id).trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide valid admission IDs.'
      });
    }

    const principalUser = await User.findByPk(req.user!.id);
    const principalName = principalUser ? `${principalUser.firstName || ''} ${principalUser.lastName || ''}`.trim() : 'Principal';

    const results: Array<{
      admissionId: string;
      applicationNumber?: string;
      studentName?: string;
      previousStatus?: string;
      finalStatus?: string;
      result: 'ENROLLED' | 'SKIPPED' | 'FAILED';
      reason?: string;
    }> = [];

    let enrolledCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const admissionId of uniqueIds) {
      try {
        const admission = await Admission.findByPk(admissionId, {
          include: [
            { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
            { model: AdmissionPersonalDetail, as: 'studentpersonaldetails' }
          ]
        });

        if (!admission) {
          results.push({
            admissionId,
            result: 'FAILED',
            reason: 'Admission record not found'
          });
          failedCount++;
          continue;
        }

        const appNo = admission.applicationNumber || admission.id;
        const pd = (admission as any).studentpersonaldetails;
        const u = (admission as any).user;
        const studentName = pd
          ? `${pd.firstName || ''} ${pd.lastName || ''}`.trim()
          : u
            ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
            : 'Applicant';

        const currentStatus = admission.applicationStatus;

        // Check if already enrolled (Idempotency)
        if (currentStatus === 'ENROLLED') {
          results.push({
            admissionId,
            applicationNumber: appNo,
            studentName,
            previousStatus: currentStatus,
            finalStatus: 'ENROLLED',
            result: 'SKIPPED',
            reason: 'Student is already ENROLLED'
          });
          skippedCount++;
          continue;
        }

        if (currentStatus === 'REJECTED') {
          results.push({
            admissionId,
            applicationNumber: appNo,
            studentName,
            previousStatus: currentStatus,
            finalStatus: 'REJECTED',
            result: 'SKIPPED',
            reason: 'Admission is REJECTED'
          });
          skippedCount++;
          continue;
        }

        if (currentStatus === 'CANCELLED' || currentStatus === 'CANCELLATION_REQUESTED') {
          results.push({
            admissionId,
            applicationNumber: appNo,
            studentName,
            previousStatus: currentStatus,
            finalStatus: currentStatus,
            result: 'SKIPPED',
            reason: 'Admission is CANCELLED'
          });
          skippedCount++;
          continue;
        }

        // Must be in awaiting principal approval state or principal approved
        if (currentStatus !== 'APPROVED' && currentStatus !== 'PRINCIPAL_APPROVED') {
          results.push({
            admissionId,
            applicationNumber: appNo,
            studentName,
            previousStatus: currentStatus,
            finalStatus: currentStatus,
            result: 'FAILED',
            reason: `Admission is not awaiting Principal approval (Current: ${currentStatus})`
          });
          failedCount++;
          continue;
        }

        // Perform direct atomic enrollment update using the trusted admissionService
        const enrollmentNumber = await admissionService.updateStatus(
          admissionId,
          'ENROLLED',
          req.user!.id,
          'Bulk approved & enrolled by Principal',
          undefined,
          undefined
        );

        // Update principal review and approval timestamps on the admission record
        await admission.update({
          principalReviewedBy: req.user!.id,
          principalReviewedAt: new Date(),
          principalApprovedAt: new Date(),
          principalRemarks: 'Bulk approved & enrolled by Principal',
        });

        // Audit Log
        try {
          await AuditLog.create({
            userId: req.user!.id,
            action: 'PRINCIPAL_ENROLL',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            details: {
              admissionId,
              applicationNumber: appNo,
              studentName,
              previousStatus: currentStatus,
              newStatus: 'ENROLLED',
              enrollmentNumber,
              academicYear: admission.academicYear,
              principalName,
              timestamp: new Date(),
              mode: 'BULK',
              remarks: 'Bulk approved & enrolled directly into ERP by Principal'
            }
          });
        } catch (auditErr: any) {
          console.warn(`Audit log creation warning for ${admissionId}:`, auditErr.message);
        }

        results.push({
          admissionId,
          applicationNumber: appNo,
          studentName,
          previousStatus: currentStatus,
          finalStatus: 'ENROLLED',
          result: 'ENROLLED'
        });
        enrolledCount++;

      } catch (err: any) {
        console.error(`Error enrolling admission ${admissionId}:`, err.message);
        results.push({
          admissionId,
          result: 'FAILED',
          reason: err.message || 'Enrollment failed'
        });
        failedCount++;
      }
    }

    return res.json({
      success: true,
      message: enrolledCount > 0
        ? `${enrolledCount} student${enrolledCount > 1 ? 's' : ''} successfully approved and enrolled in ERP.`
        : 'No admissions were enrolled.',
      summary: {
        total: uniqueIds.length,
        enrolled: enrolledCount,
        confirmed: enrolledCount, // alias for frontend compatibility
        skipped: skippedCount,
        failed: failedCount
      },
      results
    });

  } catch (err) {
    return next(err);
  }
};

/** PUT /api/principal/admissions/bulk/approve (Alias for backward compatibility) */
export const bulkApproveAdmissions = bulkConfirmAdmissions;

/** GET /api/principal/staff */
export const getStaffList = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const staff = await User.findAll({
      where: { role: { [Op.in]: ['TEACHER', 'HOD', 'ADMIN'] } },
      attributes: ['id', 'username', 'email', 'role', 'status', 'firstName', 'lastName', 'phone', 'profileImage'],
      order: [['firstName', 'ASC']]
    });
    return res.json({ success: true, data: staff });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/principal/announcements */
export const getAnnouncements = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const list = await Notification.findAll({
      where: { type: 'ANNOUNCEMENT' },
      order: [['createdAt', 'DESC']],
    });
    return res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/principal/announcements */
export const postAnnouncement = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { title, content, audience } = req.body;
    const newNotif = await Notification.create({
      title,
      content,
      type: 'ANNOUNCEMENT',
      audience: audience || 'ALL',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      createdByAdminId: req.user!.id
    });
    return res.status(201).json({
      success: true,
      data: newNotif
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/principal/strategic-goals */
export const getStrategicGoals = async (
  _req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<any> => {
  return res.json({ success: true, data: [] });
};

/** POST /api/principal/strategic-goals/:id/review */
export const reviewStrategicGoal = async (
  _req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<any> => {
  return res.json({ success: true, message: 'Strategic goal reviewed.' });
};

/** GET /api/principal/compliance/status */
export const getComplianceStatus = async (
  _req: AuthRequest,
  res: Response,
  _next: NextFunction
): Promise<any> => {
  return res.json({
    success: true,
    data: { status: 'COMPLIANT', score: 100, pendingChecks: 0 }
  });
};

/** GET /api/principal/reports/generate */
export const generateReport = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const totalApplicants = await User.count({ where: { role: 'STUDENT' } });
    const pendingCount = await Admission.count({ where: { applicationStatus: 'SUBMITTED' } });
    const enrolledCount = await Admission.count({ where: { applicationStatus: 'ENROLLED' } });

    return res.json({
      success: true,
      reportName: 'Admissions Progress Report',
      generatedAt: new Date(),
      summary: {
        totalApplicants,
        pendingAdmissions: pendingCount,
        enrolledStudents: enrolledCount
      }
    });
  } catch (err) {
    return next(err);
  }
};

// --- STUBBED ACADEMIC/HOD ENDPOINTS FOR ROUTE STABILITY ---
export const getPendingBudgets = async (_req: AuthRequest, res: Response) => res.json({ success: true, data: [] });
export const decideBudget = async (_req: AuthRequest, res: Response) => res.json({ success: true, message: 'Budget approved (sandbox mode)' });
export const getPendingLeaves = async (_req: AuthRequest, res: Response) => res.json({ success: true, data: [] });
export const decideLeave = async (_req: AuthRequest, res: Response) => res.json({ success: true, message: 'Leave decided (sandbox mode)' });
export const getPendingCurriculumChanges = async (_req: AuthRequest, res: Response) => res.json({ success: true, data: [] });
export const decideCurriculumChange = async (_req: AuthRequest, res: Response) => res.json({ success: true, message: 'Curriculum change decided (sandbox mode)' });

/** GET /api/principal/analytics */
export const getAnalyticsData = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const filters = {
      academicYear: req.query.academicYear as string || '2026-2027',
      period: req.query.period as any || 'cycle',
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    };

    const [
      kpis,
      funnel,
      trend,
      branchPerformance,
      admissionTypes,
      categories,
      genders,
      districts,
      overview,
      rates,
      recentActivity,
      pendingActions
    ] = await Promise.all([
      AnalyticsService.getOverviewKPIs('PRINCIPAL', filters),
      AnalyticsService.getApplicationFunnel(filters),
      AnalyticsService.getApplicationTrend(filters, 'daily'),
      AnalyticsService.getBranchAnalytics(filters),
      AnalyticsService.getAdmissionTypeAnalytics(filters),
      AnalyticsService.getCategoryAnalytics(filters),
      AnalyticsService.getGenderAnalytics(filters),
      AnalyticsService.getDistrictAnalytics(filters),
      AnalyticsService.getPrincipalOverview(filters),
      AnalyticsService.getPerformanceRates(filters),
      AnalyticsService.getRecentActivity(filters),
      AnalyticsService.getPendingActions(filters, 'PRINCIPAL'),
    ]);

    return res.json({
      success: true,
      data: {
        kpis,
        funnel,
        trend,
        branchPerformance,
        admissionTypes,
        categories,
        genders,
        districts,
        overview,
        rates,
        recentActivity,
        pendingActions
      }
    });
  } catch (err) {
    return next(err);
  }
};

// ─── FACULTY AUTHORIZATIONS ───────────────────────────────────────────────────

/**
 * GET /api/principal/faculty/authorizations
 * List faculty authorization requests for Principal review with filtering and search
 */
export const getFacultyAuthorizations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { search, departmentId, status, academicYear, authority } = req.query;
    const where: any = {};

    if (authority && authority !== 'ALL') {
      where.authority = authority;
    } else {
      where.authority = { [Op.in]: ['PRINCIPAL', 'DEAN'] };
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (departmentId && departmentId !== 'ALL') {
      where.departmentId = departmentId;
    }

    if (academicYear && academicYear !== 'ALL') {
      const startYear = String(academicYear).split(/[-–]/)[0].trim();
      where.academicYear = {
        [Op.or]: [
          { [Op.iLike]: `${startYear}-%` },
          { [Op.iLike]: `${startYear}–%` },
          { [Op.eq]: academicYear },
          { [Op.eq]: startYear },
        ],
      };
    }

    const searchTerm = typeof search === 'string' ? search.trim() : '';

    const requests = await FacultyAuthorizationRequest.findAll({
      where,
      include: [
        {
          model: User,
          as: 'faculty',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'profileImage', 'status'],
          required: Boolean(searchTerm),
          ...(searchTerm
            ? {
                where: {
                  [Op.or]: [
                    { firstName: { [Op.iLike]: `%${searchTerm}%` } },
                    { lastName: { [Op.iLike]: `%${searchTerm}%` } },
                    { email: { [Op.iLike]: `%${searchTerm}%` } },
                  ],
                },
              }
            : {}),
        },
        { model: Department, as: 'department', attributes: ['id', 'name', 'code'], required: false },
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code'], required: false },
        { model: User, as: 'createdByHOD', attributes: ['id', 'firstName', 'lastName', 'email'], required: false },
        { model: User, as: 'decidedBy', attributes: ['id', 'firstName', 'lastName', 'email'], required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    const formatted = await Promise.all(
      requests.map((item: any) => facultyAuthorizationService.formatRequestForQueue(item, 'PRINCIPAL'))
    );

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    logger.error('Failed to get faculty authorizations for principal:', error);
    return res.json({ success: true, data: [] });
  }
};

/**
 * GET /api/principal/faculty/authorizations/count
 * Return pending authorization counts for Principal badge & metrics
 */
export const getFacultyAuthorizationCount = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const principalPendingCount = await FacultyAuthorizationRequest.count({
      where: {
        status: 'PENDING',
        authority: 'PRINCIPAL',
      },
    });

    const totalPendingCount = await FacultyAuthorizationRequest.count({
      where: {
        status: 'PENDING',
      },
    });

    return res.json({
      success: true,
      count: principalPendingCount,
      principalPendingCount,
      totalPendingCount,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/principal/faculty/authorizations/:id
 * Get single faculty authorization request details with all assignments
 */
export const getFacultyAuthorizationById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;

    const request = await FacultyAuthorizationRequest.findByPk(id, {
      include: [
        { model: User, as: 'faculty', attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'profileImage', 'status'] },
        { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'code', 'credits', 'type'] },
        { model: User, as: 'createdByHOD', attributes: ['id', 'firstName', 'lastName', 'email', 'profileImage'] },
        { model: User, as: 'decidedBy', attributes: ['id', 'firstName', 'lastName', 'email'] },
      ],
    });

    if (!request) {
      return res.status(404).json({ error: 'Faculty authorization request not found.' });
    }

    const formatted = await facultyAuthorizationService.formatRequestForQueue(request, 'PRINCIPAL');

    // Fetch all assignments associated with this faculty user
    const assignments = await FacultyAssignment.findAll({
      where: { userId: request.facultyUserId },
      include: [{ model: Subject, as: 'subject', attributes: ['id', 'name', 'code', 'credits', 'type'] }],
      order: [['semester', 'ASC'], ['createdAt', 'ASC']],
    });

    const responseData = {
      ...formatted,
      assignments: assignments.map((a: any) => ({
        id: a.id,
        subjectId: a.subjectId,
        subjectName: a.subject?.name || 'General Assignment',
        subjectCode: a.subject?.code || 'N/A',
        subjectType: a.subject?.type || 'Theory',
        credits: a.subject?.credits || 4,
        semester: a.semester,
        section: a.section,
        academicYear: a.academicYear,
        attendanceAccess: a.attendanceAccess,
        marksAccess: a.marksAccess,
        status: a.status,
      })),
    };

    return res.json({ success: true, data: responseData });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/principal/faculty/authorizations/:id/approve
 * Principal approves faculty authorization request, activating user and assignments
 */
export const approveFacultyAuthorization = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;

    const result = await facultyAuthorizationService.approveRequest({
      requestId: id,
      expectedAuthority: 'PRINCIPAL',
      approver: {
        id: req.user!.id,
        role: req.user!.role,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        email: req.user?.email,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'System',
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Principal approve error:', error);
    return res.status(400).json({ error: error.message || 'Failed to approve faculty authorization.' });
  }
};

/**
 * POST /api/principal/faculty/authorizations/:id/reject
 * Principal rejects faculty authorization request with required reason
 */
export const rejectFacultyAuthorization = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const result = await facultyAuthorizationService.rejectRequest({
      requestId: id,
      expectedAuthority: 'PRINCIPAL',
      reason,
      approver: {
        id: req.user!.id,
        role: req.user!.role,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        email: req.user?.email,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for']?.toString() || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'System',
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Principal reject error:', error);
    return res.status(400).json({ error: error.message || 'Failed to reject faculty authorization.' });
  }
};

/**
 * GET /api/principal/departments
 * Fetch departments list for filters
 */
export const getDepartments = async (
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const departments = await Department.findAll({
      order: [['name', 'ASC']],
    });
    return res.json({ success: true, data: departments });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/principal/academic-years
 * Fetch academic years list for filters
 */
export const getAcademicYears = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const includeHistorical = req.query?.includeHistorical === 'true';
    const where: any = {};
    if (!includeHistorical) {
      where.isOperational = { [Op.ne]: false };
      where.year = { [Op.ne]: '2025-26' };
    }

    const years = await AcademicYear.findAll({
      where,
      order: [['year', 'DESC']],
    });
    return res.json({ success: true, data: years });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/principal/faculty
 * Global Faculty Directory for Principal view
 */
export const getPrincipalFacultyList = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { search, departmentId, status } = req.query as any;

    const whereUser: any = {};
    if (search) {
      whereUser[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status && status !== 'ALL') {
      whereUser.status = status;
    }

    const teachers = await Teacher.findAll({
      where: departmentId && departmentId !== 'ALL' ? { departmentId } : {},
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'profileImage', 'status', 'createdAt'],
          where: whereUser,
        },
        {
          model: Department,
          as: 'department',
          attributes: ['id', 'name', 'code'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    const currentYearRecord = await AcademicYear.findOne({ where: { isCurrent: true } });
    const currentYear = currentYearRecord?.year || '2026-27';

    const formatted = await Promise.all(
      teachers.map(async (t: any) => {
        const assignments = await FacultyAssignment.findAll({
          where: { userId: t.userId, status: 'ACTIVE' },
          include: [{ model: Subject, as: 'subject', attributes: ['name', 'code'] }],
        });

        const subjectNames = assignments.map((a: any) => a.subject?.name).filter(Boolean);

        return {
          id: t.id,
          userId: t.userId,
          name: `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim(),
          email: t.user?.email,
          phone: t.user?.phone,
          profileImage: t.user?.profileImage,
          departmentId: t.departmentId,
          departmentName: t.department?.name,
          departmentCode: t.department?.code,
          designation: t.designation,
          status: t.user?.status || 'ACTIVE',
          subjects: subjectNames.length > 0 ? subjectNames.join(', ') : 'General Faculty',
          academicYear: currentYear,
          joiningDate: t.joiningDate,
          createdAt: t.createdAt,
        };
      })
    );

    return res.json({ success: true, data: formatted });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/principal/teaching-profile
 * Retrieves Principal's teaching profile, eligibility, and active assignments
 */
export const getPrincipalTeachingProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Session missing.' });
    }

    const profile = await teachingProfileService.getTeachingProfile(userId);
    return res.json({ success: true, data: profile });
  } catch (error: any) {
    logger.error('PRINCIPAL_GET_TEACHING_PROFILE_ERROR:', error);
    return next(error);
  }
};

/**
 * PUT /api/principal/teaching-profile
 * Updates Principal's teaching profile (core department) to enable teaching capability
 */
export const updatePrincipalTeachingProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Session missing.' });
    }

    const { coreDepartmentId } = req.body;
    if (!coreDepartmentId) {
      return res.status(400).json({ error: 'Core department selection is required.' });
    }

    const updated = await teachingProfileService.updateTeachingProfile(userId, 'PRINCIPAL', coreDepartmentId);

    try {
      await AuditLog.create({
        userId,
        action: 'UPDATE_PRINCIPAL_TEACHING_PROFILE',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
          userId,
          coreDepartmentId,
          coreDepartmentCode: updated.coreDepartmentCode,
        },
      });
    } catch (auditErr) {
      logger.warn('Failed to log audit for updatePrincipalTeachingProfile:', auditErr);
    }

    return res.json({
      success: true,
      message: 'Teaching profile updated successfully. You are now eligible for teaching assignments.',
      data: updated,
    });
  } catch (error: any) {
    logger.error('PRINCIPAL_UPDATE_TEACHING_PROFILE_ERROR:', error);
    return res.status(400).json({ error: error.message || 'Failed to update teaching profile.' });
  }
};



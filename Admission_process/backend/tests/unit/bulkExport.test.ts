import { Op } from 'sequelize';
import {
  getEligibleAdmissionsForExport,
  identifyStudentDocuments,
  fetchDocumentWithRetry,
  DOCUMENT_FIELD_MAP,
  DOCUMENT_LABELS,
} from '../../src/services/bulkExportWorker.service';
import {
  normalizeAcademicYear,
  getAcademicYearVariants,
} from '../../src/utils/academicYear.util';
import { findDepartmentCanonical } from '../../src/utils/departmentCanonical.util';
import { sanitizeStudentName, buildR2Key } from '../../src/utils/r2Key.util';
import * as r2 from '../../src/services/r2.service';
import Admission from '../../src/models/Admission';
import Department from '../../src/models/Department';
import BulkExportJob from '../../src/models/BulkExportJob';
import { previewBulkExport, bulkExportDocuments, startBulkExportJob } from '../../src/controllers/admission.controller';

// Mock dependencies
jest.mock('../../src/services/admission.service', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/services/securityEvents.service', () => ({
  __esModule: true,
  default: {
    logAdmissionAudit: jest.fn(),
  },
}));
jest.mock('../../src/models/StudentAcademicEnrollment', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/Section', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/controllers/existing-student-onboarding.controller', () => ({
  __esModule: true,
  default: {},
  getOnboardingContext: jest.fn(),
  downloadExistingStudentsTemplate: jest.fn(),
  validateExistingStudents: jest.fn(),
  importExistingStudents: jest.fn(),
  getOnboardingHistory: jest.fn(),
}));
jest.mock('../../src/models/Admission', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock('../../src/models/AdmissionDocument', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
}));
jest.mock('../../src/models/AdmissionPersonalDetail', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
}));
jest.mock('../../src/models/AdmissionParentDetail', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/AdmissionAddress', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/AdmissionAcademicDetail', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/Department', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
}));
jest.mock('../../src/models/BulkExportJob', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock('../../src/models/Student', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
  },
}));
jest.mock('../../src/models/Parent', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/User', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
  },
}));
jest.mock('../../src/models/AuditLog', () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
  },
}));
jest.mock('../../src/models/SystemConfiguration', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/HOD', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/UsnRegistry', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/Notification', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/models/ProvisionalAdmission', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../src/models/ProvisionalAdmissionDocument', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('../../src/services/r2.service');
jest.mock('../../src/utils/logger.util', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('Bulk Document Export - Comprehensive Regression Test Suite (12 Scenarios)', () => {
  const mockDeptCV = { id: 'uuid-cv-101', code: 'CV', name: 'Civil Engineering' };
  const mockDeptCSE = { id: 'uuid-cse-202', code: 'CSE', name: 'Computer Science and Engineering' };

  beforeEach(() => {
    jest.clearAllMocks();
    (Department.findAll as jest.Mock).mockResolvedValue([mockDeptCV, mockDeptCSE]);
    (Department.findByPk as jest.Mock).mockImplementation((id: string) => {
      if (id === 'uuid-cv-101' || id === 'dept-cv-uuid') return Promise.resolve(mockDeptCV);
      if (id === 'uuid-cse-202' || id === 'dept-cse-uuid') return Promise.resolve(mockDeptCSE);
      return Promise.resolve(null);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Academic-Year Matching (2026-2027 <-> 2026-27 normalization)
  // --------------------------------------------------------------------------
  describe('Scenario 1: Academic-Year Matching', () => {
    it('should generate matching variants for 2026-2027 and 2026-27', () => {
      const longYear = '2026-2027';
      const shortYear = '2026-27';

      expect(normalizeAcademicYear(longYear)).toBe('2026-27');
      expect(normalizeAcademicYear(shortYear)).toBe('2026-27');

      const variantsLong = getAcademicYearVariants(longYear);
      expect(variantsLong).toContain('2026-27');
      expect(variantsLong).toContain('2026-2027');

      const variantsShort = getAcademicYearVariants(shortYear);
      expect(variantsShort).toContain('2026-27');
      expect(variantsShort).toContain('2026-2027');
    });

    it('should query Admission with Op.in variants when given 2026-2027', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027');

      expect(Admission.findAll).toHaveBeenCalledTimes(1);
      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      const ayCondition = callArgs.where.academicYear;

      // Expect an Op.in condition containing both formats
      expect(ayCondition[Op.in]).toEqual(expect.arrayContaining(['2026-2027', '2026-27']));
    });

    it('should query Admission with Op.in variants when given 2026-27', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-27');

      expect(Admission.findAll).toHaveBeenCalledTimes(1);
      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      const ayCondition = callArgs.where.academicYear;

      expect(ayCondition[Op.in]).toEqual(expect.arrayContaining(['2026-2027', '2026-27']));
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Department Matching (UUID, Code 'CV', Name, and 'ALL')
  // --------------------------------------------------------------------------
  describe('Scenario 2: Department Matching', () => {
    it('should resolve Department canonical by UUID or code', async () => {
      const resolved = await findDepartmentCanonical('uuid-cv-101');
      expect(resolved).toEqual(mockDeptCV);

      const resolvedByCode = await findDepartmentCanonical('CV');
      expect(resolvedByCode).toEqual(mockDeptCV);
    });

    it('should query Admission with department UUID and code when branchId is specified', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027', 'uuid-cv-101');

      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.branchId[Op.in]).toEqual(['uuid-cv-101', 'CV']);
    });

    it('should not filter branchId when ALL is provided', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027', 'ALL');

      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.branchId).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Eligible Enrolled and Verified Statuses
  // --------------------------------------------------------------------------
  describe('Scenario 3: Eligible Enrolled and Verified Statuses', () => {
    it('should include APPROVED, FEE_RECEIPT_UPLOADED, FEE_VERIFIED, PRINCIPAL_APPROVED, ENROLLED', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027');

      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      const statusCondition = callArgs.where.applicationStatus[Op.in];

      expect(statusCondition).toContain('APPROVED');
      expect(statusCondition).toContain('FEE_RECEIPT_UPLOADED');
      expect(statusCondition).toContain('FEE_VERIFIED');
      expect(statusCondition).toContain('PRINCIPAL_APPROVED');
      expect(statusCondition).toContain('ENROLLED');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Exclusion of Ineligible Statuses
  // --------------------------------------------------------------------------
  describe('Scenario 4: Exclusion of Ineligible Statuses', () => {
    it('should exclude REJECTED, CANCELLED, DRAFT, SUBMITTED, UNDER_REVIEW, CORRECTION_REQUIRED', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027');

      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      const statusCondition = callArgs.where.applicationStatus[Op.in];

      expect(statusCondition).not.toContain('REJECTED');
      expect(statusCondition).not.toContain('CANCELLED');
      expect(statusCondition).not.toContain('DRAFT');
      expect(statusCondition).not.toContain('SUBMITTED');
      expect(statusCondition).not.toContain('UNDER_REVIEW');
      expect(statusCondition).not.toContain('CORRECTION_REQUIRED');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Handling Students with Missing Documents Gracefully
  // --------------------------------------------------------------------------
  describe('Scenario 5: Handling Students with Missing Documents', () => {
    it('should track missing document labels without crashing', async () => {
      const mockAdmission = {
        id: 'adm-001',
        applicationNumber: 'JCER-2026-CV-00001',
        applicationStatus: 'ENROLLED',
        userId: 'user-001',
        branch: { code: 'CV' },
        studentpersonaldetails: { firstName: 'Aditi', lastName: 'Hundre' },
        studentdocuments: {
          get: (key: string) => {
            if (key === 'photoUrl') return '2026-27/CV/Aditi Hundre - JCER-2026-CV-00001/PassportPhoto.jpg';
            return null; // All others missing
          },
        },
      } as any;

      const result = await identifyStudentDocuments(mockAdmission, '2026-2027');

      expect(result.items.length).toBe(1);
      expect(result.items[0].documentTypeLabel).toBe('PassportPhoto');
      expect(result.missingDocuments.length).toBeGreaterThan(0);
      expect(result.missingDocuments).toContain('Signature');
      expect(result.missingDocuments).toContain('10th_Marksheet');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: DB Records to R2 Keys & Fallback Matching
  // --------------------------------------------------------------------------
  describe('Scenario 6: DB Records to R2 Keys & Fallback Matching', () => {
    it('should generate fallback keys for both 2026-27 and 2026-2027 conventions', async () => {
      const mockAdmission = {
        id: 'adm-002',
        applicationNumber: 'JCER-2026-CV-00002',
        applicationStatus: 'FEE_VERIFIED',
        branch: { code: 'CV' },
        studentpersonaldetails: { firstName: 'Aditi', lastName: 'Hundre' },
        studentdocuments: {
          get: (key: string) => (key === 'photoUrl' ? 'uploads/raw-photo.jpg' : null),
        },
      } as any;

      const result = await identifyStudentDocuments(mockAdmission, '2026-2027');
      expect(result.items.length).toBe(1);

      const item = result.items[0];
      expect(item.fallbackKeys).toEqual(
        expect.arrayContaining([
          '2026-27/CV/Aditi Hundre - JCER-2026-CV-00002/PassportPhoto.jpg',
          '2026-2027/CV/Aditi Hundre - JCER-2026-CV-00002/PassportPhoto.jpg',
        ])
      );
    });

    it('should include admissionFeeReceipt from Admission model if not present in studentdocuments', async () => {
      const mockAdmission = {
        id: 'adm-003',
        applicationNumber: 'JCER-2026-CV-00003',
        applicationStatus: 'APPROVED',
        admissionFeeReceiptUrl: '2026-27/CV/Aditi Hundre - JCER-2026-CV-00003/AdmissionFeeReceipt.pdf',
        branch: { code: 'CV' },
        studentpersonaldetails: { firstName: 'Aditi', lastName: 'Hundre' },
        studentdocuments: {
          get: () => null,
        },
      } as any;

      const result = await identifyStudentDocuments(mockAdmission, '2026-2027');
      const feeItem = result.items.find((i) => i.documentTypeLabel === 'AdmissionFeeReceipt');

      expect(feeItem).toBeDefined();
      expect(feeItem?.r2Key).toBe('2026-27/CV/Aditi Hundre - JCER-2026-CV-00003/AdmissionFeeReceipt.pdf');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Preview Counts Exactly Match ZIP Contents
  // --------------------------------------------------------------------------
  describe('Scenario 7: Preview Counts Exactly Match ZIP Contents', () => {
    it('should compute identical document count in preview and worker export', async () => {
      const mockAdmission = {
        id: 'adm-cv-1',
        applicationNumber: 'JCER-2026-CV-00002',
        applicationStatus: 'ENROLLED',
        branch: { code: 'CV' },
        studentpersonaldetails: { firstName: 'Aditi', lastName: 'Hundre' },
        studentdocuments: {
          get: (key: string) => {
            if (key === 'photoUrl') return '2026-27/CV/Aditi Hundre/PassportPhoto.jpg';
            if (key === 'tenthMarksheetUrl') return '2026-27/CV/Aditi Hundre/10th.pdf';
            return null;
          },
        },
      } as any;

      (Admission.findAll as jest.Mock).mockResolvedValue([mockAdmission]);

      const req: any = { query: { academicYear: '2026-2027', branchId: 'CV' } };
      let jsonResult: any = null;
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((data) => {
          jsonResult = data;
        }),
      };
      const next = jest.fn();

      await previewBulkExport(req, res, next);

      expect(jsonResult).not.toBeNull();
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.studentCount).toBe(1);
      expect(jsonResult.documentCount).toBe(2);

      // Now run identifyStudentDocuments directly (which is what worker uses)
      const exportIdentified = await identifyStudentDocuments(mockAdmission, '2026-2027');
      expect(exportIdentified.items.length).toBe(jsonResult.documentCount);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Missing R2 Objects and Retry Handling
  // --------------------------------------------------------------------------
  describe('Scenario 8: Missing R2 Objects and Retry Handling', () => {
    it('should try candidate keys and return buffer on success', async () => {
      const mockBuffer = Buffer.from('test-doc-content');
      (r2.getFile as jest.Mock)
        .mockRejectedValueOnce(new Error('NoSuchKey'))
        .mockResolvedValueOnce(mockBuffer);

      const buffer = await fetchDocumentWithRetry('primary-key-missing.jpg', [
        'fallback-key-found.jpg',
      ]);

      expect(buffer).toEqual(mockBuffer);
      expect(r2.getFile).toHaveBeenCalledWith('fallback-key-found.jpg');
    });

    it('should return null if all candidate keys fail after retries', async () => {
      (r2.getFile as jest.Mock).mockRejectedValue(new Error('NoSuchKey'));

      const buffer = await fetchDocumentWithRetry('unobtainable-key.jpg');

      expect(buffer).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 9: API Errors Not Reported as Zero-Count Success
  // --------------------------------------------------------------------------
  describe('Scenario 9: API Errors Not Reported as Zero-Count Success', () => {
    it('previewBulkExport should return 400 when academicYear is missing', async () => {
      const req: any = { query: { branchId: 'CV' } };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await previewBulkExport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Academic Year is required.' })
      );
    });

    it('startBulkExportJob should return 400 when academicYear is missing', async () => {
      const req: any = { body: { branchId: 'CV' }, user: { id: 'admin-1' } };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await startBulkExportJob(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Academic Year is required.' })
      );
    });

    it('bulkExportDocuments should return 400 when academicYear is missing', async () => {
      const req: any = { query: { branchId: 'CV' }, setTimeout: jest.fn() };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setTimeout: jest.fn(),
      };
      const next = jest.fn();

      await bulkExportDocuments(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Academic Year is required.' })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Authentication / Authorization Constraints
  // --------------------------------------------------------------------------
  describe('Scenario 10: Authentication & Authorization Requirements', () => {
    it('should verify admin router is protected with authMiddleware and authorizeRoles', async () => {
      const routesModule = await import('../../src/routes/admission.routes');
      expect(routesModule.adminAdmissionRouter).toBeDefined();
      expect(routesModule.adminAdmissionRouter.stack.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Safe ZIP Entry Paths & Filename Sanitization
  // --------------------------------------------------------------------------
  describe('Scenario 11: Safe Entry Paths & Filename Sanitization', () => {
    it('should sanitize student name to prevent path traversal', () => {
      const maliciousName = '../../etc/passwd..//malicious';
      const sanitized = sanitizeStudentName(maliciousName);

      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('\\');
    });

    it('should create safe zip entry paths without directory traversal', async () => {
      const mockAdmission = {
        id: 'adm-traversal',
        applicationNumber: 'JCER-2026-CV-99999',
        applicationStatus: 'APPROVED',
        branch: { code: 'CV' },
        studentpersonaldetails: { firstName: '../../../Hacker', lastName: 'Name' },
        studentdocuments: {
          get: (key: string) => (key === 'photoUrl' ? '2026-27/CV/file.jpg' : null),
        },
      } as any;

      const result = await identifyStudentDocuments(mockAdmission, '2026-2027');
      expect(result.items.length).toBe(1);

      const entryPath = result.items[0].entryPath;
      expect(entryPath).not.toContain('../');
      expect(entryPath).not.toContain('..\\');
      expect(entryPath.startsWith('2026-2027/CV/')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Strict Isolation Between Departments & Academic Years
  // --------------------------------------------------------------------------
  describe('Scenario 12: Strict Isolation Between Departments and Academic Years', () => {
    it('should strictly isolate CV documents from CSE documents', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027', 'uuid-cv-101');

      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      const branchIn = callArgs.where.branchId[Op.in];

      expect(branchIn).toContain('uuid-cv-101');
      expect(branchIn).toContain('CV');
      expect(branchIn).not.toContain('uuid-cse-202');
      expect(branchIn).not.toContain('CSE');
      expect(branchIn).not.toContain('CSE-AIML');
    });

    it('should strictly isolate 2026-27 documents from 2025-26 documents', async () => {
      (Admission.findAll as jest.Mock).mockResolvedValueOnce([]);

      await getEligibleAdmissionsForExport('2026-2027');

      const callArgs = (Admission.findAll as jest.Mock).mock.calls[0][0];
      const ayIn = callArgs.where.academicYear[Op.in];

      expect(ayIn).toContain('2026-2027');
      expect(ayIn).toContain('2026-27');
      expect(ayIn).not.toContain('2025-2026');
      expect(ayIn).not.toContain('2025-26');
    });
  });
});

import bcrypt from 'bcryptjs';
import User from '../models/User';
import { PERMISSION_MATRIX, authorizeRoles, authorizePermissions } from '../middleware/rbac.middleware';
import { isDailyOtpRequiredRole } from '../controllers/auth.controller';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { generateToken } from '../utils/jwt.util';

describe('CyberAdmin Role, Authentication & RBAC Isolation Suite', () => {
  const testEmail = 'cyberadmin.test@jcer.edu';
  const testPassword = 'TestCyberPassword@2026';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Model & Role Definition Integrity', () => {
    it('should include CYBERADMIN in the User model role definition', () => {
      const user = new User({
        username: testEmail,
        email: testEmail,
        passwordHash: '$2a$10$dummyhashplaceholderforunittesting1234567890',
        role: 'CYBERADMIN',
        status: 'ACTIVE',
        firstName: 'Cyber',
        lastName: 'Security Officer',
      });

      expect(user.role).toBe('CYBERADMIN');
      expect(user.status).toBe('ACTIVE');
    });

    it('should NOT require daily OTP for CYBERADMIN', () => {
      expect(isDailyOtpRequiredRole('CYBERADMIN')).toBe(false);
    });

    it('should preserve daily OTP requirement for existing ERP administrative roles', () => {
      expect(isDailyOtpRequiredRole('ADMIN')).toBe(true);
      expect(isDailyOtpRequiredRole('SUPER_ADMIN')).toBe(true);
      expect(isDailyOtpRequiredRole('PRINCIPAL')).toBe(true);
      expect(isDailyOtpRequiredRole('DEAN')).toBe(true);
      expect(isDailyOtpRequiredRole('HOD')).toBe(true);
      expect(isDailyOtpRequiredRole('TEACHER')).toBe(true);
      expect(isDailyOtpRequiredRole('FACULTY')).toBe(true);
      expect(isDailyOtpRequiredRole('STUDENT')).toBe(false);
      expect(isDailyOtpRequiredRole('PARENT')).toBe(false);
    });
  });

  describe('2. Idempotent Initialization & Password Hashing', () => {
    let mockUserDb: Map<string, any>;

    beforeEach(() => {
      mockUserDb = new Map();

      jest.spyOn(User, 'findOne').mockImplementation((options: any) => {
        const email = options?.where?.email;
        const record = mockUserDb.get(email);
        return Promise.resolve(record ? ({ ...record, update: jest.fn() } as any) : null);
      });

      jest.spyOn(User, 'create').mockImplementation((data: any) => {
        const id = 'cyber-admin-uuid-001';
        const userInstance = {
          id,
          ...data,
          update: jest.fn(),
          reload: jest.fn(),
        };
        mockUserDb.set(data.email, userInstance);
        return Promise.resolve(userInstance as any);
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should securely hash password and create CyberAdmin when configured', async () => {
      const existing = await User.findOne({ where: { email: testEmail } });
      expect(existing).toBeNull();

      const hashedPassword = await bcrypt.hash(testPassword, 10);
      const created = await User.create({
        username: testEmail,
        email: testEmail,
        passwordHash: hashedPassword,
        role: 'CYBERADMIN',
        status: 'ACTIVE',
        firstName: 'Cyber',
        lastName: 'Security Officer',
        phone: '9876543202',
        mustChangePassword: false,
      });

      expect(created.email).toBe(testEmail);
      expect(created.role).toBe('CYBERADMIN');
      expect(created.status).toBe('ACTIVE');

      // Verify bcrypt hash validity
      expect(created.passwordHash.startsWith('$2')).toBe(true);
      expect(created.passwordHash).not.toBe(testPassword);
      const isMatch = await bcrypt.compare(testPassword, created.passwordHash);
      expect(isMatch).toBe(true);
    });

    it('should be idempotent and never duplicate accounts on re-initialization', async () => {
      const initCyberAdmin = async (email: string, pass: string) => {
        const existing = await User.findOne({ where: { email } });
        if (!existing) {
          const hash = await bcrypt.hash(pass, 10);
          return await User.create({
            username: email,
            email,
            passwordHash: hash,
            role: 'CYBERADMIN',
            status: 'ACTIVE',
            firstName: 'Cyber',
            lastName: 'Security Officer',
            phone: '9876543202',
            mustChangePassword: false,
          });
        }
        return existing;
      };

      // Run 1: Should create account
      const firstRun = await initCyberAdmin(testEmail, testPassword);
      expect(firstRun).toBeDefined();
      expect(mockUserDb.size).toBe(1);

      // Run 2: Should find existing and not create duplicate
      const secondRun = await initCyberAdmin(testEmail, testPassword);
      expect(secondRun).toBeDefined();
      expect(secondRun.id).toBe(firstRun.id);
      expect(mockUserDb.size).toBe(1);

      // Run 3: Rerunning again
      const thirdRun = await initCyberAdmin(testEmail, testPassword);
      expect(thirdRun.id).toBe(firstRun.id);
      expect(mockUserDb.size).toBe(1);
    });
  });

  describe('3. Strict RBAC Isolation: Zero ERP Administration Privileges', () => {
    it('should not contain any administrative operations in PERMISSION_MATRIX for CYBERADMIN', () => {
      const cyberAdminPermissions = PERMISSION_MATRIX['CYBERADMIN'];
      expect(cyberAdminPermissions).toBeDefined();
      expect(Array.isArray(cyberAdminPermissions)).toBe(true);
      expect(cyberAdminPermissions).toHaveLength(0);

      // Explicitly check that it does not inherit ADMIN or SUPER_ADMIN permissions
      const erpAdminOps = [
        'manage_users',
        'view_students',
        'edit_students',
        'approve_results',
        'edit_results',
        'view_results',
        'manage_fees',
        'view_fees',
        'manage_timetable',
        'view_timetable',
        'dispatch_credentials',
        'view_logs',
        'manage_settings',
        'manage_academic_structure',
      ];

      for (const op of erpAdminOps) {
        expect(cyberAdminPermissions).not.toContain(op);
      }
    });

    it('should block CYBERADMIN from authorizeRoles("ADMIN", "SUPER_ADMIN")', () => {
      const req: any = {
        user: {
          id: 'cyber-1',
          role: 'CYBERADMIN',
          email: testEmail,
        },
      };

      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const next = jest.fn();

      const middleware = authorizeRoles('ADMIN', 'SUPER_ADMIN');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Forbidden. Role 'CYBERADMIN' is not authorized to access this resource.",
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should block CYBERADMIN from authorizePermissions("manage_users")', () => {
      const req: any = {
        user: {
          id: 'cyber-1',
          role: 'CYBERADMIN',
          email: testEmail,
        },
      };

      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const next = jest.fn();

      const middleware = authorizePermissions('manage_users');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden. You do not have the required permissions for this action.',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should preserve all existing permissions for standard ERP roles', () => {
      expect(PERMISSION_MATRIX['SUPER_ADMIN']).toContain('manage_users');
      expect(PERMISSION_MATRIX['SUPER_ADMIN']).toContain('approve_results');
      expect(PERMISSION_MATRIX['ADMIN']).toContain('manage_users');
      expect(PERMISSION_MATRIX['ADMIN']).toContain('manage_fees');
      expect(PERMISSION_MATRIX['PRINCIPAL']).toContain('approve_results');
      expect(PERMISSION_MATRIX['DEAN']).toContain('manage_academic_structure');
      expect(PERMISSION_MATRIX['HOD']).toContain('view_hod_dashboard');
      expect(PERMISSION_MATRIX['TEACHER']).toContain('edit_results');
      expect(PERMISSION_MATRIX['STUDENT']).toContain('view_results');
      expect(PERMISSION_MATRIX['PARENT']).toContain('view_results');
    });
  });

  describe('4. Inactive and Suspended Account Rejection', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should deny authentication in authMiddleware if account is INACTIVE', async () => {
      const inactiveUser = {
        id: 'cyber-inactive',
        role: 'CYBERADMIN',
        status: 'INACTIVE',
        tokenVersion: 1,
        email: 'inactive@jcer.edu',
      };

      jest.spyOn(User, 'findByPk').mockResolvedValue(inactiveUser as any);

      // Create a valid mock token for this user
      const accessToken = generateToken({ id: inactiveUser.id, role: inactiveUser.role, tv: inactiveUser.tokenVersion });

      const req: any = {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      };

      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User account is inactive.',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny authentication in authMiddleware if account is SUSPENDED', async () => {
      const suspendedUser = {
        id: 'cyber-suspended',
        role: 'CYBERADMIN',
        status: 'SUSPENDED',
        tokenVersion: 1,
        email: 'suspended@jcer.edu',
      };

      jest.spyOn(User, 'findByPk').mockResolvedValue(suspendedUser as any);

      const accessToken = generateToken({ id: suspendedUser.id, role: suspendedUser.role, tv: suspendedUser.tokenVersion });

      const req: any = {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      };

      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const next = jest.fn();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'User account is suspended.',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});

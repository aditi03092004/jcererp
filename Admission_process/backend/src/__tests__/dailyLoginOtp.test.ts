import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import otpService from '../services/otp.service';
import Otp from '../models/Otp';
import User from '../models/User';
import emailService from '../services/email.service';
import authService from '../services/auth.service';
import * as authController from '../controllers/auth.controller';

// In-memory mock store for OTPs and Users
let mockOtpStore: any[] = [];
let mockUserStore: any[] = [];

jest.mock('../models/Otp', () => {
  const mockOtpModel = {
    destroy: jest.fn().mockImplementation(async (options: any) => {
      const initialLen = mockOtpStore.length;
      if (options?.where) {
        mockOtpStore = mockOtpStore.filter((item) => {
          if (options.where.purpose && item.purpose !== options.where.purpose) return true;
          if (options.where.email && item.email !== options.where.email) return true;
          if (options.where.userId && item.userId !== options.where.userId) return true;
          return false;
        });
      } else {
        mockOtpStore = [];
      }
      return initialLen - mockOtpStore.length;
    }),
    count: jest.fn().mockImplementation(async (options: any) => {
      let items = [...mockOtpStore];
      if (options?.where?.userId) {
        items = items.filter((i) => i.userId === options.where.userId);
      }
      if (options?.where?.email) {
        items = items.filter((i) => i.email === options.where.email);
      }
      if (options?.where?.purpose) {
        items = items.filter((i) => i.purpose === options.where.purpose);
      }
      if (options?.where?.verified !== undefined) {
        items = items.filter((i) => i.verified === options.where.verified);
      }
      return items.length;
    }),
    findOne: jest.fn().mockImplementation(async (options: any) => {
      let items = [...mockOtpStore];
      if (options?.where) {
        const w = options.where;
        if (w[Op.and]) {
          for (const cond of w[Op.and]) {
            if (cond.purpose) items = items.filter((i) => i.purpose === cond.purpose);
            if (cond.verified !== undefined) items = items.filter((i) => i.verified === cond.verified);
            if (cond[Op.or]) {
              items = items.filter((i) =>
                cond[Op.or].some((sub: any) => {
                  if (sub.email) return i.email === sub.email;
                  if (sub.userId) return i.userId === sub.userId;
                  if (sub.updatedAt) return new Date(i.updatedAt).getTime() >= new Date(sub.updatedAt[Op.gte]).getTime();
                  if (sub.createdAt) return new Date(i.createdAt).getTime() >= new Date(sub.createdAt[Op.gte]).getTime();
                  return false;
                })
              );
            }
          }
        } else {
          if (w.email) items = items.filter((i) => i.email === w.email);
          if (w.purpose) items = items.filter((i) => i.purpose === w.purpose);
          if (w.verified !== undefined) items = items.filter((i) => i.verified === w.verified);
          if (w.expiresAt && w.expiresAt[Op.gt]) {
            items = items.filter((i) => new Date(i.expiresAt).getTime() > new Date(w.expiresAt[Op.gt]).getTime());
          }
        }
      }
      if (options?.order && Array.isArray(options.order)) {
        items.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
      }
      if (items.length === 0) return null;
      return items[0];
    }),
    findAll: jest.fn().mockImplementation(async (options: any) => {
      let items = [...mockOtpStore];
      if (options?.where) {
        const w = options.where;
        if (w.email) items = items.filter((i) => i.email === w.email);
        if (w.purpose) items = items.filter((i) => i.purpose === w.purpose);
        if (w.verified !== undefined) items = items.filter((i) => i.verified === w.verified);
        if (w.expiresAt && w.expiresAt[Op.gt]) {
          items = items.filter((i) => new Date(i.expiresAt).getTime() > new Date(w.expiresAt[Op.gt]).getTime());
        }
      }
      if (options?.order && Array.isArray(options.order)) {
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      return items;
    }),
    update: jest.fn().mockImplementation(async (values: any, options: any) => {
      let count = 0;
      mockOtpStore.forEach((item) => {
        let match = true;
        if (options?.where?.email && item.email !== options.where.email) match = false;
        if (options?.where?.purpose && item.purpose !== options.where.purpose) match = false;
        if (options?.where?.verified !== undefined && item.verified !== options.where.verified) match = false;
        if (options?.where?.userId === null && item.userId !== null) match = false;
        if (match) {
          Object.assign(item, values);
          count++;
        }
      });
      return [count];
    }),
    create: jest.fn().mockImplementation(async (values: any) => {
      const record = {
        id: 'mock-otp-' + Math.random(),
        createdAt: new Date(),
        updatedAt: new Date(),
        attempts: 0,
        verified: false,
        ...values,
        update: async function (newValues: any) {
          Object.assign(this, newValues);
          return this;
        },
      };
      mockOtpStore.push(record);
      return record;
    }),
  };

  return {
    __esModule: true,
    default: mockOtpModel,
    Otp: mockOtpModel,
  };
});

jest.mock('../models/User', () => {
  const mockUserModel = {
    findOne: jest.fn().mockImplementation(async (options: any) => {
      const email = options?.where?.email;
      if (!email) return null;
      return mockUserStore.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
    }),
    findByPk: jest.fn().mockImplementation(async (id: string) => {
      return mockUserStore.find((u) => u.id === id) || null;
    }),
    update: jest.fn().mockImplementation(async (values: any, options: any) => {
      const user = mockUserStore.find((u) => u.id === options?.where?.id);
      if (user) {
        Object.assign(user, values);
      }
      return [1];
    }),
  };

  return {
    __esModule: true,
    default: mockUserModel,
  };
});

jest.mock('../models/Student', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../models/Admission', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../models/HOD', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../models/Teacher', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../models/Department', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../models/FacultyAssignment', () => ({
  __esModule: true,
  default: {
    count: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../services/email.service', () => ({
  __esModule: true,
  default: {
    sendDailyLoginOTP: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../services/auth.service', () => ({
  __esModule: true,
  default: {
    generateTokens: jest.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    }),
  },
}));

jest.mock('../services/securityEvents.service', () => ({
  __esModule: true,
  default: {
    loginSuccess: jest.fn(),
    loginFailure: jest.fn(),
  },
}));

describe('JCER ERP Daily OTP Authentication Suite', () => {
  beforeEach(() => {
    mockOtpStore = [];
    mockUserStore = [];
    jest.clearAllMocks();
  });

  describe('1. Role Policy Checks: isDailyOtpRequiredRole', () => {
    it('should require daily OTP for all 5 mandatory roles (Admin, Principal, Dean, HOD, Faculty)', () => {
      expect(authController.isDailyOtpRequiredRole('ADMIN')).toBe(true);
      expect(authController.isDailyOtpRequiredRole('SUPER_ADMIN')).toBe(true);
      expect(authController.isDailyOtpRequiredRole('PRINCIPAL')).toBe(true);
      expect(authController.isDailyOtpRequiredRole('DEAN')).toBe(true);
      expect(authController.isDailyOtpRequiredRole('HOD')).toBe(true);
      expect(authController.isDailyOtpRequiredRole('TEACHER')).toBe(true);
      expect(authController.isDailyOtpRequiredRole('FACULTY')).toBe(true);
    });

    it('should NOT require daily OTP for STUDENT, PARENT, or CYBERADMIN', () => {
      expect(authController.isDailyOtpRequiredRole('STUDENT')).toBe(false);
      expect(authController.isDailyOtpRequiredRole('PARENT')).toBe(false);
      expect(authController.isDailyOtpRequiredRole('CYBERADMIN')).toBe(false);
    });
  });

  describe('2. OTP Service: Generation, Cooldown & Attempt Limits', () => {
    const testEmail = 'dean@jcer.in';
    const testUserId = '00000000-0000-0000-0000-000000000001';

    it('should generate a 6-digit OTP and store with purpose DAILY_LOGIN and linked userId', async () => {
      const res = await otpService.generateAndSaveOtp(testEmail, 'DAILY_LOGIN', testUserId);
      expect(res.success).toBe(true);
      expect(res.otp).toBeDefined();
      expect(res.otp).toHaveLength(6);

      const record = mockOtpStore[0];
      expect(record.email).toBe(testEmail);
      expect(record.userId).toBe(testUserId);
      expect(record.purpose).toBe('DAILY_LOGIN');
      expect(record.verified).toBe(false);
      expect(record.attempts).toBe(0);

      // Verify bcrypt hash matches
      const isMatch = await bcrypt.compare(res.otp!, record.otpHash);
      expect(isMatch).toBe(true);
    });

    it('should enforce cooldown when generating again immediately', async () => {
      await otpService.generateAndSaveOtp(testEmail, 'DAILY_LOGIN', testUserId);
      const secondRes = await otpService.generateAndSaveOtp(testEmail, 'DAILY_LOGIN', testUserId);

      expect(secondRes.success).toBe(false);
      expect(secondRes.cooldownSeconds).toBeGreaterThan(0);
      expect(secondRes.error).toContain('Please wait');
    });

    it('should reject incorrect OTP and decrement remaining attempts', async () => {
      const genRes = await otpService.generateAndSaveOtp(testEmail, 'DAILY_LOGIN', testUserId);
      const verifyRes = await otpService.verifyOtp(testEmail, '000000', 'DAILY_LOGIN');

      expect(verifyRes.success).toBe(false);
      expect(verifyRes.attemptsRemaining).toBe(4);
      expect(verifyRes.error).toContain('Incorrect OTP');
    });

    it('should lock out after 5 consecutive incorrect verification attempts', async () => {
      await otpService.generateAndSaveOtp(testEmail, 'DAILY_LOGIN', testUserId);

      for (let i = 0; i < 4; i++) {
        await otpService.verifyOtp(testEmail, '111111', 'DAILY_LOGIN');
      }

      const fifthAttempt = await otpService.verifyOtp(testEmail, '111111', 'DAILY_LOGIN');
      expect(fifthAttempt.success).toBe(false);
      expect(fifthAttempt.attemptsRemaining).toBe(0);
      expect(fifthAttempt.error).toContain('Maximum attempts exceeded');
    });

    it('should verify successfully with correct code and record 24-hour expiry', async () => {
      const genRes = await otpService.generateAndSaveOtp(testEmail, 'DAILY_LOGIN', testUserId);
      const verifyRes = await otpService.verifyOtp(testEmail, genRes.otp!, 'DAILY_LOGIN');

      expect(verifyRes.success).toBe(true);
      const verifiedRecord = mockOtpStore.find((r) => r.verified === true);
      expect(verifiedRecord).toBeDefined();

      // Check 24-hour expiry calculation: expiresAt should be approximately 24h from now
      const expiryHours = (new Date(verifiedRecord.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60);
      expect(expiryHours).toBeGreaterThan(23.9);
      expect(expiryHours).toBeLessThanOrEqual(24.0);
    });
  });

  describe('3. Login Flow: All Roles (Admin, Principal, Dean, HOD, Faculty)', () => {
    const roles: Array<{ role: 'ADMIN' | 'PRINCIPAL' | 'DEAN' | 'HOD' | 'TEACHER'; email: string }> = [
      { role: 'ADMIN', email: 'admin@college.com' },
      { role: 'PRINCIPAL', email: 'principal@college.com' },
      { role: 'DEAN', email: 'dean@college.com' },
      { role: 'HOD', email: 'hod@college.com' },
      { role: 'TEACHER', email: 'faculty@college.com' },
    ];

    roles.forEach(({ role, email }) => {
      describe(`Role: ${role}`, () => {
        let mockUser: any;
        let passwordHash: string;

        beforeEach(async () => {
          passwordHash = await bcrypt.hash('secret123', 10);
          mockUser = {
            id: `uuid-${role.toLowerCase()}`,
            email,
            passwordHash,
            role,
            status: 'ACTIVE',
            firstName: 'Test',
            lastName: role,
            tokenVersion: 1,
            comparePassword: async (pwd: string) => pwd === 'secret123',
            update: async function (vals: any) {
              Object.assign(this, vals);
              return this;
            },
          };
          mockUserStore.push(mockUser);
        });

        it('should require Daily OTP on initial login when no verified period exists', async () => {
          const req: any = {
            body: { email, password: 'secret123' },
          };
          const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
          };

          await authController.login(req, res, () => {});

          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              requiresDailyOtp: true,
              email,
              role,
            })
          );
          // Token must NOT be issued when OTP is required
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.data).toBeUndefined();
        });

        it('should reject invalid password with 401 without requiring OTP', async () => {
          const req: any = {
            body: { email, password: 'wrongpassword' },
          };
          const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
          };

          await authController.login(req, res, () => {});

          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: 'Invalid email or password',
            })
          );
        });

        it('should allow successful OTP verification and issue JWT session', async () => {
          // Generate OTP
          const genRes = await otpService.generateAndSaveOtp(email, 'DAILY_LOGIN', mockUser.id);
          const req: any = {
            body: { email, otp: genRes.otp },
          };
          const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            cookie: jest.fn(),
          };

          await authController.verifyDailyOtp(req, res, () => {});

          expect(res.status).toHaveBeenCalledWith(200);
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.success).toBe(true);
          expect(responseBody.data.token).toBe('mock-access-token');
          expect(responseBody.data.user.role).toBe(role);
        });

        it('should bypass OTP on subsequent login within the 24-hour verified window', async () => {
          // Record a verified OTP from 2 hours ago
          mockOtpStore.push({
            id: 'mock-verified-otp',
            email,
            userId: mockUser.id,
            purpose: 'DAILY_LOGIN',
            verified: true,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() + 22 * 60 * 60 * 1000),
          });

          const req: any = {
            body: { email, password: 'secret123' },
          };
          const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
          };

          await authController.login(req, res, () => {});

          expect(res.status).toHaveBeenCalledWith(200);
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.success).toBe(true);
          expect(responseBody.requiresDailyOtp).toBeUndefined();
          expect(responseBody.data.token).toBe('mock-access-token');
        });

        it('should require a fresh OTP after the 24-hour verified period expires', async () => {
          // Record an expired verification from 25 hours ago
          mockOtpStore.push({
            id: 'mock-expired-otp',
            email,
            userId: mockUser.id,
            purpose: 'DAILY_LOGIN',
            verified: true,
            createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
          });

          const req: any = {
            body: { email, password: 'secret123' },
          };
          const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
          };

          await authController.login(req, res, () => {});

          expect(res.status).toHaveBeenCalledWith(200);
          const responseBody = res.json.mock.calls[0][0];
          expect(responseBody.requiresDailyOtp).toBe(true);
        });

        it('should reject inactive/suspended users from OTP verification', async () => {
          mockUser.status = 'SUSPENDED';

          const req: any = {
            body: { email, otp: '123456' },
          };
          const res: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
          };

          await authController.verifyDailyOtp(req, res, () => {});

          expect(res.status).toHaveBeenCalledWith(403);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: expect.stringContaining('inactive or suspended'),
            })
          );
        });
      });
    });
  });

  describe('4. Resend Endpoint & Cooldown Guard', () => {
    it('should allow resending OTP subject to cooldown and credentials', async () => {
      const email = 'dean@college.com';
      mockUserStore.push({
        id: 'uuid-dean',
        email,
        role: 'DEAN',
        status: 'ACTIVE',
        comparePassword: async (p: string) => p === 'correctpass',
      });

      const req: any = {
        body: { email, password: 'correctpass' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await authController.resendDailyOtp(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('new verification OTP code has been sent'),
        })
      );
    });

    it('should reject resend with 429 when cooldown period has not elapsed', async () => {
      const email = 'dean@college.com';
      mockUserStore.push({
        id: 'uuid-dean',
        email,
        role: 'DEAN',
        status: 'ACTIVE',
        comparePassword: async (p: string) => p === 'correctpass',
      });

      // Seed a recent OTP created 10 seconds ago
      mockOtpStore.push({
        email,
        purpose: 'DAILY_LOGIN',
        createdAt: new Date(Date.now() - 10 * 1000),
        updatedAt: new Date(Date.now() - 10 * 1000),
      });

      const req: any = {
        body: { email, password: 'correctpass' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await authController.resendDailyOtp(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Please wait'),
          cooldownSeconds: expect.any(Number),
        })
      );
    });
  });

  describe('5. Password Change & Reset Invalidation', () => {
    it('should invalidate active 24h verification records when password is changed', async () => {
      const email = 'hod@college.com';
      const userId = 'uuid-hod';
      const mockUser = {
        id: userId,
        email,
        role: 'HOD',
        status: 'ACTIVE',
        comparePassword: async (p: string) => p === 'oldpass',
        update: jest.fn().mockResolvedValue(true),
      };
      mockUserStore.push(mockUser);

      // Seed active verification
      mockOtpStore.push({
        email,
        userId,
        purpose: 'DAILY_LOGIN',
        verified: true,
      });

      const req: any = {
        user: { id: userId },
        body: { currentPassword: 'oldpass', newPassword: 'newsecurepassword123' },
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await authController.changePassword(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(200);
      // Ensure DAILY_LOGIN records were wiped
      const remainingVerification = mockOtpStore.find(
        (o) => o.email === email && o.purpose === 'DAILY_LOGIN'
      );
      expect(remainingVerification).toBeUndefined();
    });
  });
});

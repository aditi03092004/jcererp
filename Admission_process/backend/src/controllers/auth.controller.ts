import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import User from '../models/User';
import Student from '../models/Student';
import Admission from '../models/Admission';
import HOD from '../models/HOD';
import Teacher from '../models/Teacher';
import Department from '../models/Department';
import authService from '../services/auth.service';
import securityEvents from '../services/securityEvents.service';
import otpService from '../services/otp.service';
import emailService from '../services/email.service';
import Otp from '../models/Otp';
import SystemConfiguration from '../models/SystemConfiguration';
import FacultyAssignment from '../models/FacultyAssignment';
import path from 'path';
import fs from 'fs';
import * as r2Service from '../services/r2.service';
import logger from '../utils/logger.util';

const IS_PROD = process.env.NODE_ENV === 'production';

// Cookie options for the refresh token
const cookieOptions = {
  httpOnly: true,
  secure: IS_PROD, // Secure in production (HTTPS)
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

const getUserPayload = async (user: User) => {
  const student = user.role === 'STUDENT' ? await Student.findOne({ where: { userId: user.id } }) : null;
  const admission = user.role === 'STUDENT' ? await Admission.findOne({ where: { userId: user.id } }) : null;
  const system = (user.role === 'STUDENT' && (!admission || admission.applicationStatus !== 'ENROLLED') && !student)
    ? 'ADMISSION'
    : 'ERP';

  let department: { id: string; name: string; code: string } | undefined = undefined;
  let isHod = false;
  let isTeacher = false;
  let isDean = false;
  let isPrincipal = false;
  let isFaculty = false;
  const workspaces: string[] = [];

  // Non-student roles: resolve faculty, departmental, and administrative capabilities
  if (user.role !== 'STUDENT') {
    if (user.role === 'HOD') {
      const hod = await HOD.findOne({
        where: { userId: user.id, isActive: true },
        include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
      });
      if (hod && (hod as any).department) {
        department = {
          id: (hod as any).department.id,
          name: (hod as any).department.name,
          code: (hod as any).department.code,
        };
      }
    } else if (user.role === 'TEACHER' || (user.role as string) === 'FACULTY') {
      const teacher = await Teacher.findOne({
        where: { [Op.or]: [{ userId: user.id }, { id: user.id }] },
        include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
      });
      if (teacher && (teacher as any).department) {
        department = {
          id: (teacher as any).department.id,
          name: (teacher as any).department.name,
          code: (teacher as any).department.code,
        };
      }
    }

    isHod = user.role === 'HOD' || (await HOD.findOne({ where: { userId: user.id, isActive: true } })) !== null;
    isTeacher = user.role === 'TEACHER' || (user.role as string) === 'FACULTY';
    isDean = user.role === 'DEAN';
    isPrincipal = user.role === 'PRINCIPAL';
    const teacherProfile = await Teacher.findOne({
      where: {
        [Op.or]: [{ userId: user.id }, { id: user.id }],
        status: 'ACTIVE',
      },
    });
    const teacherCandidateIds = Array.from(new Set([user.id, teacherProfile?.id, teacherProfile?.userId].filter(Boolean) as string[]));
    const hasFacultyAssignment = (await FacultyAssignment.count({
      where: {
        [Op.or]: [
          { userId: { [Op.in]: teacherCandidateIds } },
          { teacherId: { [Op.in]: teacherCandidateIds } },
        ],
        status: {
          [Op.or]: [
            { [Op.in]: ['ACTIVE'] },
            { [Op.is]: null },
          ],
        },
      },
    })) > 0;
    const isTeachingConfigured = teacherProfile !== null && !!teacherProfile.departmentId;
    isFaculty = isTeacher || isHod || isDean || isPrincipal || hasFacultyAssignment || isTeachingConfigured;

    if (isHod) workspaces.push('hod');
    if (isDean) workspaces.push('dean');
    if (isPrincipal) workspaces.push('principal');
    if (isFaculty) workspaces.push('faculty');
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    profileImage: user.profileImage,
    mustChangePassword: (user.role === 'TEACHER' || (user.role as string) === 'HOD' || (user.role as string) === 'FACULTY') ? false : user.mustChangePassword,
    department,
    system,
    isHod,
    isFaculty,
    workspaces,
  };
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      logger.warn(`LOGIN_FAILED: Missing email or password in request body`);
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    logger.info(`LOGIN_ATTEMPT: Email received: ${normalizedEmail}`);

    // Query user by email, username, or student USN
    let user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      user = await User.findOne({ where: { email } });
    }
    if (!user) {
      user = await User.findOne({ where: { username: normalizedEmail } });
    }
    if (!user) {
      user = await User.findOne({ where: { username: email.trim() } });
    }
    if (!user) {
      const trimmedId = email.trim();
      const studentMatch = await Student.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('usn')),
          trimmedId.toLowerCase()
        ),
      });
      if (studentMatch && studentMatch.userId) {
        user = await User.findByPk(studentMatch.userId);
      }
    }

    if (!user) {
      logger.warn(`LOGIN_FAILED: User not found for identifier: ${normalizedEmail}`);
      securityEvents.loginFailure(req, email, 'User not found');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    logger.info(`LOGIN_DEBUG: User found - ID: ${user.id}, Role: ${user.role}, Status: ${user.status}, Email: ${user.email}`);

    // Check status
    if (user.status !== 'ACTIVE') {
      logger.warn(`LOGIN_FAILED: User account is ${user.status} for email: ${user.email}`);
      securityEvents.loginFailure(req, email, `Account ${user.status.toLowerCase()}`, user.id);
      if (user.status === 'PENDING_AUTHORIZATION') {
        return res.status(403).json({ error: 'Your account is pending administrator/dean authorization. Please wait for authorization.' });
      }
      return res.status(403).json({ error: 'Your account is inactive or suspended' });
    }

    // Compare entered password with stored hash using bcrypt.compare
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      logger.warn(`LOGIN_FAILED: Invalid password for user: ${user.email}`);
      securityEvents.loginFailure(req, email, 'Invalid password', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // ─── DAILY LOGIN OTP CHECK (ADMIN, PRINCIPAL, DEAN, HOD, FACULTY) ───────────
    if (isDailyOtpRequiredRole(user.role)) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const validVerification = await Otp.findOne({
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                { email: normalizedEmail },
                { userId: user.id },
              ],
            },
            {
              purpose: 'DAILY_LOGIN',
              verified: true,
            },
            {
              [Op.or]: [
                { updatedAt: { [Op.gte]: twentyFourHoursAgo } },
                { createdAt: { [Op.gte]: twentyFourHoursAgo } },
              ],
            },
          ],
        },
        order: [['updatedAt', 'DESC']],
      });

      if (!validVerification) {
        logger.info(`DAILY_OTP_REQUIRED: Daily verification required for ${user.email} (${user.role})`);
        
        // Generate and dispatch daily login OTP
        const genResult = await otpService.generateAndSaveOtp(normalizedEmail, 'DAILY_LOGIN', user.id);
        if (genResult.success && genResult.otp) {
          const sent = await emailService.sendDailyLoginOTP(
            normalizedEmail,
            `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'User',
            genResult.otp,
            user.role
          );
          if (!sent) {
            logger.error(`DAILY_OTP_EMAIL_FAILED: Failed to deliver daily OTP to ${normalizedEmail}`);
            return res.status(500).json({ error: 'Failed to send verification OTP to registered email. Please contact administrator.' });
          }
        } else if (!genResult.success) {
          // If in cooldown, check if an active unexpired OTP already exists
          const activePendingOtp = await Otp.findOne({
            where: {
              email: normalizedEmail,
              purpose: 'DAILY_LOGIN',
              verified: false,
              expiresAt: { [Op.gt]: new Date() },
            },
            order: [['createdAt', 'DESC']],
          });

          if (!activePendingOtp) {
            return res.status(429).json({ error: genResult.error || 'Too many OTP requests. Please try again later.' });
          }
        }

        return res.status(200).json({
          success: true,
          requiresDailyOtp: true,
          email: normalizedEmail,
          role: user.role,
          message: `Daily OTP verification required for ${user.role.toLowerCase()} login.`,
        });
      }
    }

    // Generate tokens and store session via AuthService
    const { accessToken, refreshToken } = await authService.generateTokens(user);

    // Update lastActivityAt immediately on successful login
    const now = new Date();
    await User.update({ lastActivityAt: now }, { where: { id: user.id }, silent: true });
    user.lastActivityAt = now;

    // Audit Success
    securityEvents.loginSuccess(req, { id: user.id, role: user.role, email: user.email });
    logger.info(`LOGIN_SUCCESS: Successfully authenticated user: ${user.email} (Role: ${user.role})`);

    return res.status(200).json({
      success: true,
      data: {
        token: accessToken,
        user: await getUserPayload(user),
      },
    });
  } catch (error) {
    logger.error('LOGIN_ERROR: Server exception during login execution:', error);
    return next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const currentRefreshToken = req.cookies?.refreshToken;

    if (!currentRefreshToken) {
      return res.status(401).json({ error: 'Refresh token not found. Please log in again.' });
    }

    const sessionData = await authService.refreshSession(currentRefreshToken);

    if (!sessionData) {
      // Clear cookie if session is invalid or expired
      res.clearCookie('refreshToken');
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }

    // Set the new rotated refresh token
    res.cookie('refreshToken', sessionData.refreshToken, cookieOptions);

    return res.status(200).json({
      success: true,
      data: {
        token: sessionData.accessToken,
        user: await getUserPayload(sessionData.user),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const logout = async (req: Request, res: Response): Promise<any> => {
  try {
    const authReq = req as any;
    if (authReq.user?.id) {
      // Revoke the session in Redis
      await authService.revokeSession(authReq.user.id);
      securityEvents.logout(req, authReq.user.id);
    }
    
    // Clear the httpOnly cookie
    res.clearCookie('refreshToken');

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error during logout' });
  }
};

export const status = async (req: Request, res: Response): Promise<any> => {
  const authReq = req as any;
  if (!authReq.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const user = await User.findByPk(authReq.user.id, {
      attributes: ['id', 'email', 'role', 'firstName', 'lastName', 'profileImage', 'status', 'mustChangePassword']
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'User account is inactive or suspended' });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: await getUserPayload(user),
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error check' });
  }
};

export const checkPhone = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const existing = await User.findOne({ where: { phone } });
    return res.status(200).json({ exists: !!existing });
  } catch (error) {
    return next(error);
  }
};

export const isDailyOtpRequiredRole = (role: string): boolean => {
  const normalized = (role || '').trim().toUpperCase();
  return ['ADMIN', 'SUPER_ADMIN', 'PRINCIPAL', 'DEAN', 'HOD', 'TEACHER', 'FACULTY', 'CYBERADMIN'].includes(normalized);
};

export const verifyDailyOtp = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email address and OTP code are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user || !isDailyOtpRequiredRole(user.role)) {
      return res.status(403).json({ error: 'Unauthorized role for daily OTP verification.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is inactive or suspended.' });
    }

    const verifyResult = await otpService.verifyOtp(normalizedEmail, otp, 'DAILY_LOGIN');
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || 'Invalid or expired OTP code.' });
    }

    // Associate userId on verified record if not yet set
    await Otp.update(
      { userId: user.id },
      {
        where: {
          email: normalizedEmail,
          purpose: 'DAILY_LOGIN',
          verified: true,
          userId: null,
        },
      }
    );

    // Generate tokens and store session via AuthService
    const { accessToken, refreshToken } = await authService.generateTokens(user);
    res.cookie('refreshToken', refreshToken, cookieOptions);

    // Update lastActivityAt immediately on successful daily OTP verification
    const now = new Date();
    await User.update({ lastActivityAt: now }, { where: { id: user.id }, silent: true });
    user.lastActivityAt = now;

    securityEvents.loginSuccess(req, { id: user.id, role: user.role, email: user.email });
    logger.info(`DAILY_OTP_SUCCESS: Daily login verified for ${user.email} (${user.role})`);

    return res.status(200).json({
      success: true,
      data: {
        token: accessToken,
        user: await getUserPayload(user),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const resendDailyOtp = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user || !isDailyOtpRequiredRole(user.role)) {
      return res.status(403).json({ error: 'Unauthorized role for daily OTP verification.' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Your account is inactive or suspended.' });
    }

    // If password provided, verify credentials
    if (password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
    }

    const genResult = await otpService.generateAndSaveOtp(normalizedEmail, 'DAILY_LOGIN', user.id);
    if (!genResult.success || !genResult.otp) {
      const statusCode = genResult.cooldownSeconds ? 429 : 400;
      return res.status(statusCode).json({
        error: genResult.error || 'Failed to generate OTP.',
        cooldownSeconds: genResult.cooldownSeconds,
      });
    }

    const sent = await emailService.sendDailyLoginOTP(
      normalizedEmail,
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'User',
      genResult.otp,
      user.role
    );

    if (!sent) {
      return res.status(500).json({ error: 'Failed to send verification OTP email. Please try again.' });
    }

    return res.status(200).json({
      success: true,
      message: 'A new verification OTP code has been sent to your registered email address.',
    });
  } catch (error) {
    return next(error);
  }
};

// ─── EMAIL OTP: REGISTRATION ENDPOINTS ───────────────────────────────────────

export const sendRegistrationOtp = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { firstName, lastName, email, phone } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'First name, last name, and email are required.' });
    }

    // Check if admissions are open
    const config = await SystemConfiguration.findOne();
    if (config && config.admissionOpen === false) {
      return res.status(403).json({ error: 'Admissions are currently closed. Please contact the college office for further information.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check email uniqueness
    const existingEmail = await User.findOne({ where: { email: normalizedEmail } });
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    // Check phone uniqueness if provided
    if (phone) {
      const existingPhone = await User.findOne({ where: { phone: phone.trim() } });
      if (existingPhone) {
        return res.status(409).json({ error: 'An account with this mobile number already exists.' });
      }
    }

    // Generate and save OTP
    const genResult = await otpService.generateAndSaveOtp(normalizedEmail, 'REGISTER');
    if (!genResult.success || !genResult.otp) {
      return res.status(429).json({ error: genResult.error || 'Failed to generate OTP.' });
    }

    // Send OTP email
    const studentName = `${firstName} ${lastName}`.trim();
    const emailSent = await emailService.sendRegistrationOTP(normalizedEmail, studentName, genResult.otp);

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send OTP email. Please verify your email address.' });
    }

    return res.status(200).json({
      success: true,
      message: 'A 6-digit OTP has been sent to your email address. Please check your inbox.',
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyRegistrationOtp = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    const verifyResult = await otpService.verifyOtp(email, otp, 'REGISTER');
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || 'OTP verification failed.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Email address verified successfully.',
    });
  } catch (error) {
    return next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { firstName, lastName, email, password, phone, registrationType } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: 'First name, last name, email, and password are required.',
        message: 'First name, last name, email, and password are required.',
      });
    }

    const trimmedFirst = String(firstName).trim();
    const trimmedLast = String(lastName).trim();
    const normalizedEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);
    const cleanPhone = phone ? String(phone).trim() : null;

    if (cleanPassword.length < 8) {
      return res.status(400).json({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: 'Password must be at least 8 characters long.',
        message: 'Password must be at least 8 characters long.',
      });
    }

    if (cleanPhone && (cleanPhone.length !== 10 || isNaN(Number(cleanPhone)))) {
      return res.status(400).json({
        success: false,
        errorCode: 'VALIDATION_ERROR',
        error: 'Mobile number must be a valid 10-digit number.',
        message: 'Mobile number must be a valid 10-digit number.',
      });
    }

    let finalRegType: 'FRESH' | 'LATERAL_ENTRY' = 'FRESH';
    if (registrationType === 'LATERAL_ENTRY') {
      finalRegType = 'LATERAL_ENTRY';
    }

    // Check if admissions are open
    const config = await SystemConfiguration.findOne();
    if (config) {
      if (finalRegType === 'FRESH' && config.freshAdmissionOpen === false) {
        return res.status(403).json({
          success: false,
          errorCode: 'ADMISSIONS_CLOSED',
          error: 'Fresh admissions are currently closed.',
          message: 'Fresh admissions are currently closed.',
        });
      }
      if (finalRegType === 'LATERAL_ENTRY' && config.lateralEntryOpen === false) {
        return res.status(403).json({
          success: false,
          errorCode: 'ADMISSIONS_CLOSED',
          error: 'Lateral entry admissions are currently closed.',
          message: 'Lateral entry admissions are currently closed.',
        });
      }
      if (config.admissionOpen === false) {
        return res.status(403).json({
          success: false,
          errorCode: 'ADMISSIONS_CLOSED',
          error: 'Admissions are currently closed. Please contact the college office for further information.',
          message: 'Admissions are currently closed. Please contact the college office for further information.',
        });
      }
    }

    // Enforce Backend OTP verification check before allowing registration
    let verifiedOtp: Otp | null = null;
    if (process.env.EMAIL_OTP_ENABLED !== 'false') {
      verifiedOtp = await Otp.findOne({
        where: {
          email: normalizedEmail,
          purpose: 'REGISTER',
          verified: true,
        },
        order: [['updatedAt', 'DESC']],
      });

      if (!verifiedOtp) {
        return res.status(403).json({
          success: false,
          errorCode: 'EMAIL_VERIFICATION_REQUIRED',
          error: 'Email verification required before registration. Please verify your email via OTP code.',
          message: 'Email verification required before registration. Please verify your email via OTP code.',
        });
      }
    }

    // Check email uniqueness and existing accounts
    const existing = await User.findOne({ where: { email: normalizedEmail } });
    if (existing) {
      const existingStudent = await Student.findOne({ where: { userId: existing.id } });
      const existingAdmission = await Admission.findOne({ where: { userId: existing.id } });

      const isEnrolledOrStaff = existing.role !== 'STUDENT' || !!existingStudent;
      const isRegistrationCompleted = !!existingAdmission;
      const hasPriorActivity = existing.lastActivityAt !== null;

      // Scenario B: Established or completed registration account exists -> do not overwrite
      if (isEnrolledOrStaff || isRegistrationCompleted || hasPriorActivity) {
        return res.status(409).json({
          success: false,
          errorCode: 'ACCOUNT_EXISTS',
          error: 'An account with this email already exists. Please log in to your portal.',
          message: 'An account with this email already exists. Please log in to your portal.',
        });
      }

      // Scenario C: Safe recovery for partial/incomplete registration (User created, but Admission missing)
      const isPasswordMatch = await existing.comparePassword(cleanPassword);
      if (!isPasswordMatch) {
        return res.status(409).json({
          success: false,
          errorCode: 'ACCOUNT_EXISTS',
          error: 'An account with this email already exists. Please log in with your credentials or reset your password.',
          message: 'An account with this email already exists. Please log in with your credentials or reset your password.',
        });
      }

      logger.info(`RECOVERY: Resuming incomplete registration for user ${existing.id} (${normalizedEmail})`);

      // Atomically update user profile & ensure draft admission exists
      const currentAcademicYear = config?.admissionCycle || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
      await sequelize.transaction(async (t) => {
        await existing.update(
          {
            firstName: trimmedFirst,
            lastName: trimmedLast,
            phone: cleanPhone || existing.phone,
            registrationType: finalRegType,
          },
          { transaction: t }
        );

        if (!existingAdmission) {
          await Admission.create(
            {
              userId: existing.id,
              applicationNumber: null,
              academicYear: currentAcademicYear,
              applicationStatus: 'DRAFT',
              applicationType: finalRegType,
              entrySemester: finalRegType === 'LATERAL_ENTRY' ? 3 : 1,
            },
            { transaction: t }
          );
        }
      });

      // Invalidate OTP after successful registration recovery
      if (verifiedOtp) {
        await verifiedOtp.update({ verified: false, expiresAt: new Date(0) }).catch((err) => {
          logger.warn('Failed to invalidate registration OTP:', err);
        });
      }

      // Non-blocking welcome email
      emailService
        .sendRegistrationSuccessEmail(normalizedEmail, `${trimmedFirst} ${trimmedLast}`, finalRegType)
        .catch((err) => {
          logger.warn(`Failed to dispatch registration success email to ${normalizedEmail}:`, err);
        });

      // Generate tokens and return session
      const { accessToken, refreshToken: newRefreshToken } = await authService.generateTokens(existing);
      res.cookie('refreshToken', newRefreshToken, cookieOptions);

      return res.status(200).json({
        success: true,
        message: 'Account registration completed successfully.',
        data: {
          token: accessToken,
          user: await getUserPayload(existing),
        },
      });
    }

    // Check phone uniqueness if provided
    if (cleanPhone) {
      const existingPhone = await User.findOne({ where: { phone: cleanPhone } });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          errorCode: 'DUPLICATE_PHONE',
          error: 'An account with this mobile number already exists.',
          message: 'An account with this mobile number already exists.',
        });
      }
    }

    // Auto-generate username from email
    const username = normalizedEmail.split('@')[0] + Math.floor(100 + Math.random() * 900);

    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(cleanPassword, salt);

    // Scenario A: First registration - wrap in atomic database transaction
    let newUser!: User;
    const currentAcademicYear = config?.admissionCycle || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

    await sequelize.transaction(async (t) => {
      // 1. Create User
      newUser = await User.create(
        {
          username,
          email: normalizedEmail,
          passwordHash,
          firstName: trimmedFirst,
          lastName: trimmedLast,
          phone: cleanPhone,
          role: 'STUDENT',
          status: 'ACTIVE',
          registrationType: finalRegType,
        },
        { transaction: t }
      );

      // 2. Atomically create draft Admission
      await Admission.create(
        {
          userId: newUser.id,
          applicationNumber: null,
          academicYear: currentAcademicYear,
          applicationStatus: 'DRAFT',
          applicationType: finalRegType,
          entrySemester: finalRegType === 'LATERAL_ENTRY' ? 3 : 1,
        },
        { transaction: t }
      );
    });

    // Invalidate OTP after successful creation
    if (verifiedOtp) {
      await verifiedOtp.update({ verified: false, expiresAt: new Date(0) }).catch((err) => {
        logger.warn('Failed to invalidate registration OTP:', err);
      });
    }

    // Non-blocking welcome email
    emailService
      .sendRegistrationSuccessEmail(normalizedEmail, `${trimmedFirst} ${trimmedLast}`, finalRegType)
      .catch((err) => {
        logger.warn(`Failed to dispatch registration success email to ${normalizedEmail}:`, err);
      });

    // Generate tokens and return login payload
    const { accessToken, refreshToken: newRefreshToken } = await authService.generateTokens(newUser);
    res.cookie('refreshToken', newRefreshToken, cookieOptions);

    return res.status(201).json({
      success: true,
      message: 'Student account created successfully.',
      data: {
        token: accessToken,
        user: await getUserPayload(newUser),
      },
    });
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path;
      const message = field === 'phone'
        ? 'An account with this mobile number already exists.'
        : 'An account with this email already exists.';
      return res.status(409).json({
        success: false,
        errorCode: 'DUPLICATE_RESOURCE',
        error: message,
        message,
      });
    }
    return next(error);
  }
};

// ─── EMAIL OTP: FORGOT PASSWORD ENDPOINTS ─────────────────────────────────────

export const sendForgotPasswordOtp = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address or User ID/USN is required.' });
    }

    const trimmedInput = email.trim();
    const normalizedInput = trimmedInput.toLowerCase();

    // Query user by email, username, student USN, or admission application number
    let user = await User.findOne({ where: { email: normalizedInput } });
    if (!user) {
      user = await User.findOne({ where: { email: trimmedInput } });
    }
    if (!user) {
      user = await User.findOne({ where: { username: normalizedInput } });
    }
    if (!user) {
      user = await User.findOne({ where: { username: trimmedInput } });
    }
    if (!user) {
      const studentMatch = await Student.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('usn')),
          normalizedInput
        ),
      });
      if (studentMatch && studentMatch.userId) {
        user = await User.findByPk(studentMatch.userId);
      }
    }
    if (!user) {
      const admissionMatch = await Admission.findOne({
        where: {
          [Op.or]: [
            { applicationNumber: trimmedInput },
            { cetNumber: trimmedInput },
          ],
        },
      });
      if (admissionMatch && admissionMatch.userId) {
        user = await User.findByPk(admissionMatch.userId);
      }
    }

    // Do not reveal account absence to prevent enumeration
    if (!user || user.status !== 'ACTIVE') {
      return res.status(200).json({
        success: true,
        message: 'If an active account exists registered with this email or ID, a 6-digit verification code has been sent.',
      });
    }

    const targetEmail = user.email.toLowerCase();
    const genResult = await otpService.generateAndSaveOtp(targetEmail, 'FORGOT_PASSWORD');
    if (!genResult.success || !genResult.otp) {
      return res.status(400).json({ error: genResult.error || 'Failed to generate OTP verification code.' });
    }

    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Student';
    const emailSent = await emailService.sendForgotPasswordOTP(
      targetEmail,
      fullName,
      genResult.otp,
      user.role
    );

    if (!emailSent) {
      logger.warn(`Failed to send Forgot Password OTP email to ${targetEmail}`);
    }

    return res.status(200).json({
      success: true,
      email: targetEmail,
      message: 'A 6-digit verification code has been sent to your registered email address.',
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyForgotPasswordOtp = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email address and OTP code are required.' });
    }

    const trimmedInput = email.trim();
    let targetEmail = trimmedInput.toLowerCase();

    // If identifier was not an email, resolve to user's registered email
    if (!targetEmail.includes('@')) {
      let user = await User.findOne({ where: { username: targetEmail } });
      if (!user) {
        const studentMatch = await Student.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('usn')),
            targetEmail
          ),
        });
        if (studentMatch && studentMatch.userId) {
          user = await User.findByPk(studentMatch.userId);
        }
      }
      if (!user) {
        const admissionMatch = await Admission.findOne({
          where: {
            [Op.or]: [
              { applicationNumber: trimmedInput },
              { cetNumber: trimmedInput },
            ],
          },
        });
        if (admissionMatch && admissionMatch.userId) {
          user = await User.findByPk(admissionMatch.userId);
        }
      }
      if (user) {
        targetEmail = user.email.toLowerCase();
      }
    }

    const verifyResult = await otpService.verifyOtp(targetEmail, otp, 'FORGOT_PASSWORD');
    if (!verifyResult.success) {
      return res.status(400).json({ error: verifyResult.error || 'OTP verification failed.' });
    }

    return res.status(200).json({
      success: true,
      email: targetEmail,
      message: 'OTP verified successfully. You may now enter your new password.',
    });
  } catch (error) {
    return next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email address and new password are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const trimmedInput = email.trim();
    let targetEmail = trimmedInput.toLowerCase();

    // Resolve user by email, username, USN, or application number
    let user = await User.findOne({ where: { email: targetEmail } });
    if (!user) {
      user = await User.findOne({ where: { username: targetEmail } });
    }
    if (!user) {
      const studentMatch = await Student.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('usn')),
          targetEmail
        ),
      });
      if (studentMatch && studentMatch.userId) {
        user = await User.findByPk(studentMatch.userId);
      }
    }
    if (!user) {
      const admissionMatch = await Admission.findOne({
        where: {
          [Op.or]: [
            { applicationNumber: trimmedInput },
            { cetNumber: trimmedInput },
          ],
        },
      });
      if (admissionMatch && admissionMatch.userId) {
        user = await User.findByPk(admissionMatch.userId);
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    targetEmail = user.email.toLowerCase();

    // Check if OTP was verified for FORGOT_PASSWORD in past 15 minutes
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const verifiedOtp = await Otp.findOne({
      where: {
        email: targetEmail,
        purpose: 'FORGOT_PASSWORD',
        verified: true,
        updatedAt: {
          [Op.gte]: fifteenMinsAgo,
        },
      },
      order: [['updatedAt', 'DESC']],
    });

    if (!verifiedOtp) {
      return res.status(403).json({ error: 'Password reset unauthorized. OTP verification required.' });
    }

    // Hash new password using bcrypt
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update user password and invalidate previous sessions by bumping tokenVersion
    await user.update({
      passwordHash: newPasswordHash,
      tokenVersion: (user.tokenVersion || 0) + 1,
    });

    // Invalidate any 24-hour verification records for this user
    await Otp.destroy({
      where: {
        [Op.or]: [
          { email: targetEmail },
          { userId: user.id },
        ],
        purpose: 'DAILY_LOGIN',
      },
    });

    logger.info(`Password successfully reset for user ${targetEmail} (ID: ${user.id}, Role: ${user.role})`);

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully! Please log in with your new password.',
    });
  } catch (error) {
    return next(error);
  }
};

export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If currentPassword is provided, verify it
    if (currentPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    await user.update({
      passwordHash: hash,
      mustChangePassword: false,
    });

    // Invalidate any 24-hour verification records for this user
    await Otp.destroy({
      where: {
        [Op.or]: [
          { email: user.email.toLowerCase() },
          { userId: user.id },
        ],
        purpose: 'DAILY_LOGIN',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    return next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { phone, firstName, lastName, name } = req.body;
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const updateData: any = {};
    if (phone !== undefined) {
      updateData.phone = String(phone).trim();
    }

    if (firstName !== undefined || lastName !== undefined) {
      if (firstName !== undefined) {
        const cleanFirst = String(firstName).trim();
        if (!cleanFirst) {
          return res.status(400).json({ success: false, error: 'First name cannot be empty.' });
        }
        if (cleanFirst.length > 60) {
          return res.status(400).json({ success: false, error: 'First name cannot exceed 60 characters.' });
        }
        updateData.firstName = cleanFirst;
      }
      if (lastName !== undefined) {
        const cleanLast = String(lastName).trim();
        if (cleanLast.length > 60) {
          return res.status(400).json({ success: false, error: 'Last name cannot exceed 60 characters.' });
        }
        updateData.lastName = cleanLast;
      }
    } else if (name !== undefined && typeof name === 'string') {
      const cleanName = name.trim();
      if (!cleanName) {
        return res.status(400).json({ success: false, error: 'Profile name cannot be empty.' });
      }
      if (cleanName.length < 2) {
        return res.status(400).json({ success: false, error: 'Profile name must be at least 2 characters long.' });
      }
      if (cleanName.length > 100) {
        return res.status(400).json({ success: false, error: 'Profile name cannot exceed 100 characters.' });
      }
      const parts = cleanName.split(/\s+/);
      updateData.firstName = parts[0];
      updateData.lastName = parts.slice(1).join(' ');
    }

    await user.update(updateData);

    const updatedUserPayload = await getUserPayload(user);
    logger.info(`EVENT: PROFILE_UPDATED | USER_ID: ${userId} | ROLE: ${user.role} | NEW_NAME: ${updatedUserPayload.name}`);

    return res.status(200).json({
      success: true,
      message: 'Profile details updated successfully.',
      data: {
        user: updatedUserPayload,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const uploadProfileImage = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No image file uploaded.' });
    }

    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'Only image files (JPEG, PNG, WEBP) are allowed.' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const oldProfileImage = user.profileImage;

    let imageUrl = '';
    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const r2Key = `avatars/${userId}_${Date.now()}${ext}`;

    try {
      if (process.env.R2_BUCKET_NAME && process.env.R2_ACCESS_KEY_ID) {
        await r2Service.uploadFile(req.file.buffer, r2Key, req.file.mimetype);
        imageUrl = r2Service.resolveFileUrl(r2Key);
      } else {
        const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
        if (!fs.existsSync(avatarsDir)) {
          fs.mkdirSync(avatarsDir, { recursive: true });
        }
        const localFileName = `${userId}_${Date.now()}${ext}`;
        const localDest = path.join(avatarsDir, localFileName);
        fs.writeFileSync(localDest, req.file.buffer);
        imageUrl = `/uploads/avatars/${localFileName}`;
      }
    } catch (r2Err) {
      logger.warn('[ProfileImageUpload] Fallback to local uploads/avatars static file:', r2Err);
      const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
      }
      const localFileName = `${userId}_${Date.now()}${ext}`;
      const localDest = path.join(avatarsDir, localFileName);
      fs.writeFileSync(localDest, req.file.buffer);
      imageUrl = `/uploads/avatars/${localFileName}`;
    }

    await user.update({ profileImage: imageUrl });

    // Cleanup previous avatar after new upload and update succeed
    if (oldProfileImage && oldProfileImage !== imageUrl) {
      try {
        const r2Match = oldProfileImage.match(/avatars\/[^?#\s]+/);
        if (r2Match) {
          const oldR2Key = r2Match[0];
          await r2Service.deleteFile(oldR2Key);
        }
        const localMatch = oldProfileImage.match(/\/uploads\/avatars\/([^?#\s]+)/);
        if (localMatch) {
          const localFile = path.join(process.cwd(), 'uploads', 'avatars', localMatch[1]);
          if (fs.existsSync(localFile)) {
            fs.unlinkSync(localFile);
          }
        }
      } catch (cleanupErr) {
        logger.warn('[ProfileImageUpload] Failed to clean up previous profile image:', cleanupErr);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully.',
      data: {
        profileImage: imageUrl,
        user: await getUserPayload(user),
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const requestEmailChange = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const { newEmail } = req.body;
    if (!newEmail || typeof newEmail !== 'string') {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedNewEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (normalizedNewEmail === user.email.trim().toLowerCase()) {
      return res.status(400).json({ success: false, error: 'New email address must be different from your current email.' });
    }

    // Check whether the new email is already registered to another user
    const existingUser = await User.findOne({ where: { email: normalizedNewEmail } });
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ success: false, error: 'This email address cannot be used for this account.' });
    }

    // Generate OTP
    const otpResult = await otpService.generateAndSaveEmailChangeOtp(userId, normalizedNewEmail);
    if (!otpResult.success || !otpResult.otp) {
      return res.status(400).json({ success: false, error: otpResult.error || 'Failed to generate verification OTP.' });
    }

    // Send OTP email to NEW email address
    const recipientName = `${user.firstName} ${user.lastName}`.trim() || 'User';
    const emailSent = await emailService.sendEmailChangeOtp(normalizedNewEmail, recipientName, otpResult.otp, 10);
    if (!emailSent) {
      logger.warn(`Failed to send email-change OTP to ${normalizedNewEmail}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Verification OTP sent to the new email address.',
    });
  } catch (error) {
    return next(error);
  }
};

export const verifyEmailChange = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const authReq = req as any;
    const userId = authReq.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { otp } = req.body;
    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid verification code. Please try again.' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Verify OTP code
    const verifyResult = await otpService.verifyEmailChangeOtp(userId, otp);
    if (!verifyResult.success || !verifyResult.newEmail) {
      return res.status(400).json({ success: false, error: verifyResult.error || 'Invalid verification code. Please try again.' });
    }

    const newEmail = verifyResult.newEmail;
    const oldEmail = user.email;

    // Database Transaction: Atomic update
    const transaction = await sequelize.transaction();
    try {
      const existingUser = await User.findOne({ where: { email: newEmail }, transaction });
      if (existingUser && existingUser.id !== userId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, error: 'This email address cannot be used for this account.' });
      }

      await user.update({ email: newEmail }, { transaction });

      await Otp.update(
        { verified: true },
        {
          where: {
            userId,
            purpose: 'EMAIL_CHANGE',
            verified: false,
          },
          transaction,
        }
      );

      await transaction.commit();
    } catch (txErr) {
      await transaction.rollback();
      logger.error(`Email change transaction failed for user ${userId}:`, txErr);
      return res.status(500).json({ success: false, error: 'Unable to update email right now. Please try again.' });
    }

    const recipientName = `${user.firstName} ${user.lastName}`.trim() || 'User';
    emailService.sendEmailChangeConfirmation(newEmail, recipientName).catch((err) => {
      logger.error(`Failed to send email change confirmation to ${newEmail}:`, err);
    });

    if (oldEmail && oldEmail !== newEmail) {
      emailService.sendOldEmailChangeNotification(oldEmail, recipientName, newEmail).catch((err) => {
        logger.error(`Failed to send security notice to old email ${oldEmail}:`, err);
      });
    }

    logger.info(`EVENT: EMAIL_UPDATED | USER_ID: ${userId} | OLD: ${oldEmail} | NEW: ${newEmail}`);

    return res.status(200).json({
      success: true,
      message: 'Email address updated successfully.',
      email: newEmail,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/auth/activity
 * Authenticated heartbeat / activity recording endpoint
 */
export const recordActivity = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Access denied. Unauthorized.' });
    }

    const now = new Date();
    await User.update({ lastActivityAt: now }, { where: { id: userId }, silent: true });

    return res.status(200).json({
      success: true,
      lastActivityAt: now,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/me/workspaces or /api/auth/workspaces
 * Real DB-derived capabilities for role / workspace switcher
 */
export const getUserWorkspaces = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (user.role === 'STUDENT') {
      return res.json({ success: true, workspaces: [] });
    }

    const isHod = user.role === 'HOD' || (await HOD.findOne({ where: { userId: user.id, isActive: true } })) !== null;
    const isTeacher = user.role === 'TEACHER' || (user.role as string) === 'FACULTY';
    const isDean = user.role === 'DEAN';
    const isPrincipal = user.role === 'PRINCIPAL';
    const teacherProfile = await Teacher.findOne({
      where: {
        [Op.or]: [{ userId: user.id }, { id: user.id }],
        status: 'ACTIVE',
      },
    });
    const teacherCandidateIds = Array.from(new Set([user.id, teacherProfile?.id, teacherProfile?.userId].filter(Boolean) as string[]));
    const hasFacultyAssignment = (await FacultyAssignment.count({
      where: {
        [Op.or]: [
          { userId: { [Op.in]: teacherCandidateIds } },
          { teacherId: { [Op.in]: teacherCandidateIds } },
        ],
        status: {
          [Op.or]: [
            { [Op.in]: ['ACTIVE'] },
            { [Op.is]: null },
          ],
        },
      },
    })) > 0;
    const isTeachingConfigured = teacherProfile !== null && !!teacherProfile.departmentId;
    const isFaculty = isTeacher || isHod || isDean || isPrincipal || hasFacultyAssignment || isTeachingConfigured;

    const workspaces: Array<{ type: string; label: string; route: string }> = [];

    if (isHod) {
      workspaces.push({
        type: 'HOD',
        label: 'Head of Department',
        route: '/hod/dashboard',
      });
    }

    if (isFaculty) {
      workspaces.push({
        type: 'FACULTY',
        label: 'Faculty Dashboard',
        route: '/faculty/dashboard',
      });
    }

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      workspaces.push({
        type: 'ADMIN',
        label: 'Admin Workspace',
        route: '/admin/dashboard',
      });
    }

    if (user.role === 'PRINCIPAL') {
      workspaces.push({
        type: 'PRINCIPAL',
        label: 'Principal Workspace',
        route: '/principal/dashboard',
      });
    }

    if (user.role === 'DEAN') {
      workspaces.push({
        type: 'DEAN',
        label: 'Dean Workspace',
        route: '/dean/dashboard',
      });
    }

    return res.json({
      success: true,
      workspaces,
    });
  } catch (error) {
    return next(error);
  }
};



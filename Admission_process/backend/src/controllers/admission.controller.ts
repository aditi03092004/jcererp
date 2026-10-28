import { Request, Response, NextFunction } from 'express';
import { Op, Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs';
import admissionService from '../services/admission.service';
import securityEvents from '../services/securityEvents.service';
import AuditLog from '../models/AuditLog';
import AdmissionDocument from '../models/AdmissionDocument';
import Admission from '../models/Admission';
import SystemConfiguration from '../models/SystemConfiguration';
import { generateHandbookPDFBuffer } from '../utils/handbookGenerator.util';
import { validateDocument } from '../utils/documentValidation.util';
import logger from '../utils/logger.util';
import db from '../config/database';
import User from '../models/User';
import Department from '../models/Department';
import AdmissionPersonalDetail from '../models/AdmissionPersonalDetail';
import AdmissionParentDetail from '../models/AdmissionParentDetail';
import AdmissionAddress from '../models/AdmissionAddress';
import AdmissionAcademicDetail from '../models/AdmissionAcademicDetail';
import Student from '../models/Student';
import HOD from '../models/HOD';
import ProvisionalAdmission from '../models/ProvisionalAdmission';
import ProvisionalAdmissionDocument from '../models/ProvisionalAdmissionDocument';
import UsnRegistry from '../models/UsnRegistry';
import Notification from '../models/Notification';
import * as r2 from '../services/r2.service';
import sharp from 'sharp';
import { StreamingZip } from '../utils/zip.util';
import { buildR2Key, buildR2Folder, sanitizeStudentName } from '../utils/r2Key.util';
import { getAcademicYearVariants, normalizeAcademicYear } from '../utils/academicYear.util';
import {
  getEligibleAdmissionsForExport,
  identifyStudentDocuments,
  fetchDocumentWithRetry,
} from '../services/bulkExportWorker.service';

export const MAPPED_DOC_NAMES: Record<string, string> = {
  photo: 'Photo',
  signature: 'Signature',
  tenthMarksheet: 'SSLC',
  twelfthMarksheet: 'PUC',
  diplomaSemester5Marksheet: 'DiplomaSem5',
  diplomaSemester6Marksheet: 'DiplomaSem6',
  cetScoreCard: 'EntranceScoreCard',
  aadhaar: 'Aadhaar',
  casteCertificate: 'Caste',
  domicileCertificate: 'StudyCertificate',
  gapCertificate: 'Income',
  feesPaidReceipt: 'CollegeFeesReceipt',
  admissionFeeReceipt: 'AdmissionFeesReceipt',
  admissionFormFeeReceipt: 'AdmissionFormFeesReceipt',
};

async function deleteOldFile(oldPath: string | null | undefined): Promise<void> {
  if (!oldPath) return;
  if (oldPath.startsWith('/uploads/') || oldPath.startsWith('uploads/')) {
    const absolutePath = path.join(process.cwd(), oldPath.replace(/^\/+/, ''));
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (err) {
      logger.warn(`Could not delete old local file: ${absolutePath}`, err);
    }
  } else {
    // Delete from R2
    await r2.deleteFile(oldPath);
  }
}

const TARGET_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DIMENSION = 2000;
const QUALITY_STEPS = [85, 75, 65];

async function compressLocalImage(localPath: string, mimetype: string): Promise<void> {
  if (!mimetype.startsWith('image/')) return;
  try {
    const buffer = fs.readFileSync(localPath);
    if (buffer.length <= TARGET_SIZE_BYTES) {
      const metadata = await sharp(buffer).metadata();
      const needsResize = metadata.width && metadata.height && (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION);
      if (!needsResize) return;
    }

    const pipeline = sharp(buffer).rotate();
    const metadata = await pipeline.metadata();

    let processedPipeline = pipeline;
    if (metadata.width && metadata.height && (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION)) {
      processedPipeline = processedPipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    let result = buffer;
    for (const quality of QUALITY_STEPS) {
      const compressed = await processedPipeline
        .clone()
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      result = compressed;
      if (compressed.length <= TARGET_SIZE_BYTES) {
        break;
      }
    }

    fs.writeFileSync(localPath, result);
    logger.info(`[Local Compressor] Compressed image ${localPath} down to ${(result.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    logger.warn(`[Local Compressor] Failed to compress image ${localPath}:`, err);
  }
}

interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

const DOCUMENT_FIELD_MAP: Record<string, keyof AdmissionDocument> = {
  photo: 'photoUrl',
  signature: 'signatureUrl',
  tenthMarksheet: 'tenthMarksheetUrl',
  twelfthMarksheet: 'twelfthMarksheetUrl',
  diplomaSemester5Marksheet: 'diplomaSemester5MarksheetUrl',
  diplomaSemester6Marksheet: 'diplomaSemester6MarksheetUrl',
  cetScoreCard: 'cetScoreCardUrl',
  aadhaar: 'aadhaarUrl',
  casteCertificate: 'casteCertificateUrl',
  domicileCertificate: 'domicileCertificateUrl',
  gapCertificate: 'gapCertificateUrl',
  feesPaidReceipt: 'feesPaidReceiptUrl',
  admissionFeeReceipt: 'admissionFeeReceiptUrl',
  admissionFormFeeReceipt: 'admissionFormFeeReceiptUrl',
};

// ─── Student Endpoints ───────────────────────────────────────────────────────

/** POST /api/student/validate-document (Instant Single File Validation) */
export const validateSingleDocument = async (
  req: AuthRequest, res: Response, _next: NextFunction
): Promise<any> => {
  try {
    const file = req.file;
    const documentType = req.body.documentType || req.body.docType || (file ? file.fieldname : 'unknown');

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded for validation.' });
    }

    // Perform quality validation (Color + Blur)
    const result = await validateDocument(documentType, file.path, file.originalname);

    // Delete temp validation file immediately
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      // Ignore
    }

    if (!result.success) {
      return res.status(400).json({
        success: false,
        reason: result.reason,
        message: result.message,
      });
    }

    return res.json({ success: true, message: 'Document validation passed!' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message || 'Validation failed.' });
  }
};

/** GET /api/student/my-admission */
export const getMyAdmission = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const data = await admissionService.getMyAdmission(req.user!.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/student/step-status */
export const getStepStatus = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const data = await admissionService.getStepStatus(req.user!.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/application/full-details */
export const getFullDetails = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const data = await admissionService.getFullDetails(req.user!.id);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/student/admission/step/:stepName */
export const getStepData = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { stepName } = req.params;
    const data = await admissionService.getStepData(req.user!.id, stepName);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/student/create  (Step 1) */
export const saveStep1 = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const existing = await Admission.findOne({ where: { userId: req.user!.id } });
    if (!existing) {
      const config = await SystemConfiguration.findOne();
      if (config && config.admissionOpen === false) {
        return res.status(403).json({ success: false, error: 'Admissions are currently closed. Please contact the college office for further information.' });
      }
    }
    const admissionId = await admissionService.saveStep1(req.user!.id, req.body);
    securityEvents.stepEdit(req, req.user!.id, admissionId, 1);
    return res.json({ success: true, message: 'Admission details saved.' });
  } catch (err) {
    return next(err);
  }
};

/** PUT /api/student/personal  (Step 2) */
export const saveStep2 = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const admissionId = await admissionService.saveStep2(req.user!.id, req.body);
    securityEvents.stepEdit(req, req.user!.id, admissionId, 2);
    return res.json({ success: true, message: 'Personal details saved.' });
  } catch (err) {
    return next(err);
  }
};

/** PUT /api/student/parent  (Step 3) */
export const saveStep3 = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const admissionId = await admissionService.saveStep3(req.user!.id, req.body);
    securityEvents.stepEdit(req, req.user!.id, admissionId, 3);
    return res.json({ success: true, message: 'Parent details saved.' });
  } catch (err) {
    return next(err);
  }
};

/** PUT /api/student/address  (Step 4) */
export const saveStep4 = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const admissionId = await admissionService.saveStep4(req.user!.id, req.body);
    securityEvents.stepEdit(req, req.user!.id, admissionId, 4);
    return res.json({ success: true, message: 'Address saved.' });
  } catch (err) {
    return next(err);
  }
};

/** PUT /api/student/academic  (Step 5) */
export const saveStep5 = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const admissionId = await admissionService.saveStep5(req.user!.id, req.body);
    securityEvents.stepEdit(req, req.user!.id, admissionId, 5);
    return res.json({ success: true, message: 'Academic details saved.' });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/student/documents  (Step 6 — multipart/form-data) */
export const saveStep6 = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const hasFiles = files && Object.keys(files).length > 0;
    const hasTextUpdates = req.body.admissionFormFeeUtr !== undefined || req.body.admissionFormFeePaymentMode !== undefined;

    if (!hasFiles && !hasTextUpdates) {
      return res.status(400).json({ success: false, message: 'No files or updates provided.' });
    }

    const studentId = req.user!.id;

    // Fetch admission + branch + user name for R2 key construction
    const admission = await Admission.findOne({
      where: { userId: studentId },
      include: [{ model: Department, as: 'branch' }]
    });
    if (!admission) {
      return res.status(404).json({ success: false, message: 'No admission application found.' });
    }
    const existingDocs = await AdmissionDocument.findOne({ where: { admissionId: admission.id } });

    // Resolve student display name (User first+last, fallback to PersonalDetail)
    const userRecord = await User.findByPk(studentId, { attributes: ['firstName', 'lastName'] });
    const studentName = userRecord
      ? `${userRecord.firstName || ''} ${userRecord.lastName || ''}`.trim()
      : 'Student';

    const fileUrls: Record<string, string> = {};
    if (hasFiles && files) {
      for (const field of Object.keys(files)) {
        const file = files[field][0];
        // Compress the image locally before uploading to R2
        await compressLocalImage(file.path, file.mimetype);

        // Build the Cloudflare R2 key using central utility
        const r2Key = buildR2Key({
          academicYear:      admission.academicYear || '2026-2027',
          branchCode:        admission.branch?.code || 'GEN',
          studentName,
          applicationNumber: admission.applicationNumber || `TEMP-${studentId}`,
          mappedDocName:     MAPPED_DOC_NAMES[file.fieldname] || file.fieldname,
          ext:               path.extname(file.originalname).toLowerCase() || '.jpg',
        });

        await r2.uploadFromDisk(file.path, r2Key, file.mimetype);
        fileUrls[`${file.fieldname}Url`] = r2Key;
      }
    }

    const updateData: Record<string, any> = { ...fileUrls };
    if (req.body.admissionFormFeeUtr !== undefined) {
      updateData.admissionFormFeeUtr = req.body.admissionFormFeeUtr || null;
    }
    if (req.body.admissionFormFeePaymentMode !== undefined) {
      updateData.admissionFormFeePaymentMode = req.body.admissionFormFeePaymentMode || null;
    }

    const admissionId = await admissionService.saveStep6(studentId, updateData);
    securityEvents.documentUpload(req, studentId, admissionId, Object.keys(fileUrls));

    // Delete old files after DB update succeeds
    if (existingDocs) {
      for (const dbKeyField of Object.keys(fileUrls)) {
        const oldPath = existingDocs.get(dbKeyField as any) as string | null;
        if (oldPath && oldPath !== fileUrls[dbKeyField]) {
          await deleteOldFile(oldPath);
        }
      }
    }

    // Return signed URLs to frontend so it can render previews immediately
    const responseUrls: Record<string, string> = {};
    for (const k of Object.keys(fileUrls)) {
      responseUrls[k] = r2.getSignedUrlSync(fileUrls[k]);
    }

    return res.json({ success: true, message: 'Documents uploaded.', data: responseUrls });
  } catch (err) {
    return next(err);
  }
};

/** DELETE /api/student/documents/:field */
export const removeDocument = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { field } = req.params;
    const validFields = [
      'photo', 'signature', 'tenthMarksheet', 'twelfthMarksheet',
      'diplomaSemester5Marksheet', 'diplomaSemester6Marksheet',
      'cetScoreCard', 'aadhaar', 'casteCertificate', 'domicileCertificate',
      'gapCertificate', 'feesPaidReceipt'
    ];
    if (!validFields.includes(field)) {
      return res.status(400).json({ success: false, message: 'Invalid document field.' });
    }

    const dbKeyField = `${field}Url`;
    const studentId = req.user!.id;

    // Get old path before nullifying
    const admission = await Admission.findOne({ where: { userId: studentId } });
    const existingDocs = admission
      ? await AdmissionDocument.findOne({ where: { admissionId: admission.id } })
      : null;
    const oldPath = existingDocs ? (existingDocs.get(dbKeyField as any) as string | null) : null;

    // Null out the DB field
    await admissionService.saveStep6(studentId, { [dbKeyField]: null });

    // Delete old file (local or R2)
    if (oldPath) {
      await deleteOldFile(oldPath);
    }

    return res.json({ success: true, message: 'Document removed.', data: { [dbKeyField]: null } });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/student/documents/:field — Student views their own document */
export const getStudentDocument = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { field } = req.params;
    const documentColumn = DOCUMENT_FIELD_MAP[field];
    if (!documentColumn) {
      return res.status(400).json({ error: 'Invalid document field.' });
    }

    const studentId = req.user!.id;
    const admission = await Admission.findOne({ where: { userId: studentId } });
    if (!admission) {
      return res.status(404).json({ error: 'No admission application found.' });
    }

    const documents = await AdmissionDocument.findOne({ where: { admissionId: admission.id } });
    const fileUrl = documents ? (documents.get(documentColumn as string) as string | null) : null;
    if (!fileUrl) {
      return res.status(404).json({ error: 'Document not uploaded.' });
    }

    const ext = path.extname(fileUrl).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    if (fileUrl.startsWith('/uploads/') || fileUrl.startsWith('uploads/')) {
      const fullPath = path.join(process.cwd(), fileUrl.replace(/^\/?uploads\/?/, 'uploads'));
      if (fs.existsSync(fullPath)) {
        return res.sendFile(fullPath);
      } else {
        return res.status(404).json({ error: 'File not found on disk.' });
      }
    } else {
      const buffer = await r2.getFile(fileUrl);
      return res.send(buffer);
    }
  } catch (err) {
    return next(err);
  }
};

/** POST /api/student/submit  (Step 7 final submit) */
export const submitApplication = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const admissionId = await admissionService.submitApplication(req.user!.id);
    securityEvents.admissionSubmit(req, req.user!.id, admissionId);
    return res.json({ success: true, message: 'Application submitted successfully!' });
  } catch (err: any) {
    if (err.message?.includes('cannot be submitted')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return next(err);
  }
};

/** POST /api/student/check-aadhaar */
export const checkAadhaar = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { aadhaar } = req.body;
    if (!aadhaar || aadhaar.length !== 12) {
      return res.json({ exists: false });
    }
    const exists = await admissionService.checkAadhaar(aadhaar, req.user?.id);
    return res.json({ exists });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/student/check-cet */
export const checkCet = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { cetNumber, type } = req.body;
    if (!cetNumber || !type) return res.json({ exists: false });
    const exists = await admissionService.checkCet(cetNumber, type, req.user?.id);
    return res.json({ exists });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/branches */
export const getBranches = async (
  _req: Request, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const branches = await admissionService.getBranches();
    return res.json({ success: true, data: branches });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/application/download-pdf */
export const downloadPDF = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const data = await admissionService.getFullDetails(req.user!.id);
    if (!data) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const appNum = data.applicationNumber || 'UNKNOWN';
    const user = data.user || {};
    const personal = data.studentpersonaldetails || {};
    const branch = data.branch || {};

    // Build a simple text-based PDF without external dependencies
    // (If pdfkit is available, use it; fallback to plain text download)
    const content = [
      '='.repeat(60),
      '        COLLEGE ERP - ADMISSION ACKNOWLEDGMENT',
      '='.repeat(60),
      '',
      `Application Number : ${appNum}`,
      `Applicant Name     : ${user.firstName || ''} ${user.lastName || ''}`,
      `Email              : ${user.email || ''}`,
      `Phone              : ${personal.phone || user.phone || ''}`,
      `Date of Birth      : ${personal.dateOfBirth || ''}`,
      `Gender             : ${personal.gender || ''}`,
      `Admission Type     : ${data.admissionType || ''}`,
      `Branch             : ${branch.name || ''} (${branch.code || ''})`,
      `Status             : ${data.applicationStatus || ''}`,
      '',
      '-'.repeat(60),
      'This is an auto-generated acknowledgment.',
      `Generated on: ${new Date().toLocaleDateString('en-IN')}`,
      '='.repeat(60),
    ].join('\n');

    const buffer = Buffer.from(content, 'utf-8');
    
    // Log audit event
    securityEvents.documentDownload(req, req.user!.id, data.id, 'Admission Acknowledgment');

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="Admission_${appNum}.txt"`,
      'Content-Length': buffer.length,
    });
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
};

/** GET /api/public/handbook - Download official Admission Handbook PDF (Public, No Auth Required) */
export const downloadHandbook = async (
  _req: Request, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const config = await SystemConfiguration.findOne();
    if (config?.handbookUrl) {
      const key = config.handbookUrl;

      // R2 object key (new format — does not start with '/' or 'http')
      if (!key.startsWith('/') && !key.startsWith('http')) {
        const signedUrl = await r2.getSignedUrl(key, 10 * 60); // 10 min TTL for download
        res.setHeader('Content-Disposition', 'attachment; filename="Jain_College_Admission_Handbook.pdf"');
        return res.redirect(302, signedUrl);
      }

      // Legacy local disk path
      const relativePath = key.startsWith('/') ? key.slice(1) : key;
      const fullPath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(fullPath)) {
        return res.download(fullPath, 'Jain_College_Admission_Handbook.pdf');
      }
    }

    // Check if generated static file already exists on disk
    const staticHandbookPath = path.join(process.cwd(), 'uploads', 'Jain_College_Admission_Handbook.pdf');
    if (fs.existsSync(staticHandbookPath)) {
      return res.download(staticHandbookPath, 'Jain_College_Admission_Handbook.pdf');
    }

    // Generate handbook PDF buffer in memory as final fallback
    const pdfBuffer = generateHandbookPDFBuffer();

    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(staticHandbookPath, pdfBuffer);
    } catch (saveErr: any) {
      logger.warn(`Could not save static handbook PDF file: ${saveErr.message}`);
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Jain_College_Admission_Handbook.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    return next(err);
  }
};

// ─── Admin Endpoints ─────────────────────────────────────────────────────────

/** GET /api/admin/admissions/batches */
export const getAvailableBatches = async (
  _req: AuthRequest, res: Response, _next: NextFunction
): Promise<any> => {
  try {
    const batches = await admissionService.getAvailableBatches();
    return res.json({ success: true, data: batches });
  } catch (err: any) {
    logger.error('Failed to get available batches:', err);
    return res.json({
      success: true,
      data: ['2026–2030', '2025–2029', '2024–2028', '2023–2027', '2022–2026', '2021–2025']
    });
  }
};

/** GET /api/admin/admissions */
export const listAdmissions = async (
  req: AuthRequest, res: Response, _next: NextFunction
): Promise<any> => {
  try {
    const {
      status,
      branchId,
      semester,
      admissionType,
      search,
      sortBy,
      sortOrder,
      page,
      limit,
      qualification,
      gender,
      category,
      district,
      academicYear,
      batch,
      startDate,
      endDate
    } = req.query as any;
    const result = await admissionService.listApplications({
      status,
      branchId,
      semester,
      admissionType,
      search,
      sortBy,
      sortOrder,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      qualification,
      gender,
      category,
      district,
      academicYear,
      batch,
      startDate,
      endDate,
      includeFullDetails: req.query.includeFullDetails === 'true'
    });
    
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error in listAdmissions controller:", err);
    return res.json({
      success: true,
      data: { total: 0, page: 1, totalPages: 1, applications: [] }
    });
  }
};

/** GET /api/admin/admissions/:id */
export const getAdmissionById = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const data = await admissionService.getApplicationById(id);
    if (!data) return res.status(404).json({ error: 'Application not found' });

    // Enforce HOD departmental scope & Applied Science semester 1-2 rules
    if (req.user?.role === 'HOD') {
      const hod = await HOD.findOne({
        where: { userId: req.user.id, isActive: true },
        include: [{ model: Department, as: 'department' }],
      }) || await HOD.findOne({
        where: { userId: req.user.id },
        include: [{ model: Department, as: 'department' }],
        order: [['updatedAt', 'DESC']],
      });

      if (!hod || !(hod as any).department) {
        return res.status(403).json({ error: 'Forbidden. No active department assigned to this HOD account.' });
      }

      const dept = (hod as any).department;
      const isSemesterHandling = dept.type === 'SEMESTER_HANDLING' || dept.code === 'AS';

      // Resolve student branch and semester
      const studentBranchId = data.branchId || data.branch?.id;
      let studentSem = data.user?.student?.semester || data.entrySemester || 1;
      if (!data.user?.student?.semester) {
        const studentRow = await Student.findOne({
          where: { [Op.or]: [{ id: data.id }, { userId: data.userId }] },
          attributes: ['semester', 'departmentId']
        });
        if (studentRow) {
          studentSem = studentRow.semester;
        }
      }

      if (isSemesterHandling) {
        const handlingSemesters = dept.handlingSemesters || [1, 2];
        if (!handlingSemesters.includes(Number(studentSem))) {
          return res.status(403).json({
            error: 'Access denied. Student is outside the semester scope of your department.'
          });
        }
      } else {
        if (String(studentBranchId) !== String(hod.departmentId)) {
          return res.status(403).json({
            error: 'Access denied. Student does not belong to your department.'
          });
        }
      }
    }

    // Requirement 8 Logging before sending response
    const studentId = data.userId || data.user?.id || data.user?.student?.id || 'N/A';
    const docsObj = data.studentdocuments || data.documents || {};
    const docEntries = Object.entries(docsObj).filter(
      ([key, val]) => val !== null && val !== undefined && val !== '' && key !== 'id' && key !== 'admissionId' && key !== 'createdAt' && key !== 'updatedAt'
    );
    const docUrls = docEntries.map(([key, val]) => `${key}: ${val}`);

    console.log("==================== [BACKEND ADMISSION REVIEW] ====================");
    console.log("Application ID:", id);
    console.log("Student ID:", studentId);
    console.log("Number of documents found:", docEntries.length);
    console.log("Document URLs:", docUrls);
    console.log("====================================================================");

    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/admissions/:id/documents/:field — Admin/HOD views a student document */
export const viewAdmissionDocument = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { id, field } = req.params;
    const documentColumn = DOCUMENT_FIELD_MAP[field];

    if (!documentColumn) {
      return res.status(400).json({ error: 'Invalid document field.' });
    }

    let admission = await Admission.findByPk(id);
    let studentObj: any = null;
    if (!admission) {
      studentObj = await Student.findOne({
        where: { [Op.or]: [{ id }, { userId: id }] },
      });
      if (studentObj && studentObj.userId) {
        admission = await Admission.findOne({ where: { userId: studentObj.userId } });
      }
    }
    if (!admission) {
      return res.status(404).json({ error: 'No admission application found.' });
    }

    // Enforce HOD departmental scope & Applied Science semester 1-2 rules
    if (req.user?.role === 'HOD') {
      const hod = await HOD.findOne({
        where: { userId: req.user.id, isActive: true },
        include: [{ model: Department, as: 'department' }],
      }) || await HOD.findOne({
        where: { userId: req.user.id },
        include: [{ model: Department, as: 'department' }],
        order: [['updatedAt', 'DESC']],
      });

      if (!hod || !(hod as any).department) {
        return res.status(403).json({ error: 'Forbidden. No active department assigned to this HOD account.' });
      }

      const dept = (hod as any).department;
      const isSemesterHandling = dept.type === 'SEMESTER_HANDLING' || dept.code === 'AS';

      if (!studentObj) {
        studentObj = await Student.findOne({
          where: { [Op.or]: [{ id: admission.id }, { userId: admission.userId }] },
          attributes: ['semester', 'departmentId']
        });
      }

      const studentSem = studentObj?.semester || admission.entrySemester || 1;
      const studentBranchId = admission.branchId || studentObj?.departmentId;

      if (isSemesterHandling) {
        const handlingSemesters = dept.handlingSemesters || [1, 2];
        if (!handlingSemesters.includes(Number(studentSem))) {
          return res.status(403).json({
            error: 'Access denied. Student is outside the semester scope of your department.'
          });
        }
      } else {
        if (String(studentBranchId) !== String(hod.departmentId)) {
          return res.status(403).json({
            error: 'Access denied. Student does not belong to your department.'
          });
        }
      }
    }

    const documents = await AdmissionDocument.findOne({ where: { admissionId: admission.id } });
    if (!documents) {
      return res.status(404).json({ error: 'No documents found for this application.' });
    }

    const fileUrl = documents.get(documentColumn as string) as string | null;
    if (!fileUrl) {
      return res.status(404).json({ error: 'Document not uploaded.' });
    }

    securityEvents.documentDownload(req, req.user!.id, id, field);

    const ext = path.extname(fileUrl).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    if (fileUrl.startsWith('/uploads/') || fileUrl.startsWith('uploads/')) {
      const fullPath = path.join(process.cwd(), fileUrl.replace(/^\/?uploads\/?/, 'uploads'));
      if (fs.existsSync(fullPath)) {
        return res.sendFile(fullPath);
      } else {
        return res.status(404).json({ error: 'File not found on disk.' });
      }
    } else {
      const buffer = await r2.getFile(fileUrl);
      return res.send(buffer);
    }
  } catch (err) {
    return next(err);
  }
};

const DOCUMENT_LABEL_MAP: Record<string, string> = {
  photo: 'Candidate Photograph',
  signature: 'Candidate Signature',
  tenthMarksheet: 'SSLC / 10th Marksheet',
  twelfthMarksheet: 'PUC / 12th Marksheet',
  diplomaSemester5Marksheet: 'Diploma Semester 5 Marksheet',
  diplomaSemester6Marksheet: 'Diploma Semester 6 Marksheet',
  cetScoreCard: 'CET / DCET Score Card',
  aadhaar: 'Aadhaar Card',
  casteCertificate: 'Caste Certificate',
  domicileCertificate: 'Study Certificate',
  gapCertificate: 'Income Certificate',
  feesPaidReceipt: 'College Fee Receipt',
  admissionFeeReceipt: 'Admission Fee Receipt',
  admissionFormFeeReceipt: 'Admission Form Fee Receipt',
};

/** GET /api/admin/students/:studentId/documents — Admin / Principal fetch student documents & signed preview URLs */
export const getStudentDocuments = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { studentId } = req.params;

    let admission = await Admission.findOne({
      where: {
        [Op.or]: [
          { id: studentId },
          { userId: studentId }
        ]
      },
      include: [
        { model: User, as: 'user' },
        { model: Department, as: 'branch' },
        { model: AdmissionDocument, as: 'studentdocuments' }
      ]
    });

    let studentRecord: Student | null = null;

    if (!admission) {
      studentRecord = await Student.findOne({
        where: {
          [Op.or]: [
            { id: studentId },
            { userId: studentId }
          ]
        },
        include: [{ model: User, as: 'user' }, { model: Department, as: 'department' }]
      });

      if (studentRecord) {
        admission = await Admission.findOne({
          where: { userId: studentRecord.userId },
          include: [
            { model: User, as: 'user' },
            { model: Department, as: 'branch' },
            { model: AdmissionDocument, as: 'studentdocuments' }
          ]
        });
      }
    } else {
      studentRecord = await Student.findOne({
        where: { userId: admission.userId },
        include: [{ model: User, as: 'user' }, { model: Department, as: 'department' }]
      });
    }

    if (!admission && !studentRecord) {
      return res.status(404).json({ error: 'Student or admission application not found.' });
    }

    const userObj = admission?.user || studentRecord?.user;
    const studentName = userObj
      ? `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim()
      : 'Student';

    const usn = studentRecord?.usn || studentRecord?.enrollmentNumber || 'N/A';
    const appNo = admission?.applicationNumber || 'N/A';
    const branchName = admission?.branch?.name || studentRecord?.department?.name || 'General';

    const token = req.query.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : '');
    const tokenSuffix = token ? `?token=${encodeURIComponent(String(token))}` : '';

    const docsRecord = admission?.studentdocuments;
    const documents: any[] = [];

    if (docsRecord && admission) {
      for (const [field, dbCol] of Object.entries(DOCUMENT_FIELD_MAP)) {
        const fileKeyOrUrl = docsRecord.get(dbCol as string) as string | null;
        if (fileKeyOrUrl) {
          const ext = path.extname(fileKeyOrUrl).toLowerCase();
          const isPdf = ext === '.pdf';
          let mimeType = 'application/octet-stream';
          if (ext === '.pdf') mimeType = 'application/pdf';
          else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
          else if (ext === '.png') mimeType = 'image/png';
          else if (ext === '.gif') mimeType = 'image/gif';
          else if (ext === '.webp') mimeType = 'image/webp';

          const baseUrl = `/api/admin/admissions/${admission.id}/documents/${field}`;
          const viewUrl = `${baseUrl}${tokenSuffix}`;

          documents.push({
            id: `${admission.id}_${field}`,
            field,
            name: DOCUMENT_LABEL_MAP[field] || field,
            documentType: field.toUpperCase(),
            r2Key: fileKeyOrUrl,
            previewUrl: viewUrl,
            downloadUrl: viewUrl,
            mimeType,
            isPdf,
            uploadedAt: docsRecord.updatedAt
          });
        }
      }
    }

    const provisionalDocs: any[] = [];
    if (studentRecord) {
      const provAdmission = await ProvisionalAdmission.findOne({
        where: { studentId: studentRecord.id },
        include: [{ model: ProvisionalAdmissionDocument, as: 'documents' }]
      });

      if (provAdmission && provAdmission.documents) {
        for (const doc of provAdmission.documents) {
          const ext = path.extname(doc.r2Key).toLowerCase();
          const isPdf = ext === '.pdf';
          const r2ViewUrl = r2.resolveFileUrl(doc.r2Key);
          const fullViewUrl = `${r2ViewUrl}${tokenSuffix}`;

          provisionalDocs.push({
            id: doc.id,
            semesterNumber: doc.semesterNumber,
            name: doc.documentType === 'FEE_RECEIPT' ? 'College Fee Receipt' : `Semester ${doc.semesterNumber} Marks Card`,
            documentType: doc.documentType,
            originalFileName: doc.originalFileName,
            r2Key: doc.r2Key,
            previewUrl: fullViewUrl,
            downloadUrl: fullViewUrl,
            mimeType: doc.mimeType || (isPdf ? 'application/pdf' : 'image/png'),
            isPdf,
            verificationStatus: doc.verificationStatus,
            uploadedAt: doc.updatedAt
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId: studentRecord?.id || admission?.id,
        applicationId: admission?.id || null,
        studentName,
        usn,
        applicationNumber: appNo,
        branch: branchName,
        academicYear: admission?.academicYear || '2026-2027',
        applicationStatus: admission?.applicationStatus || 'ENROLLED',
        documents,
        provisionalDocuments: provisionalDocs
      }
    });
  } catch (err) {
    return next(err);
  }
};

export const updateAdmissionStatus = async (
  req: AuthRequest, res: Response, _next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { status, remarks, rejectionReason, rejectionReasonCode, sections, deadline } = req.body;
    const validStatuses = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ENROLLED', 'CORRECTION_REQUIRED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be UNDER_REVIEW, APPROVED, REJECTED, ENROLLED, or CORRECTION_REQUIRED.' });
    }

    if (status === 'REJECTED') {
      if (!rejectionReasonCode) {
        return res.status(400).json({ error: 'rejectionReasonCode is required when status is REJECTED.' });
      }
      if (rejectionReasonCode === 'OTHER' && (!remarks || !remarks.trim())) {
        return res.status(400).json({ error: 'Remarks are mandatory when rejection reason is OTHER.' });
      }
    }

    if (status === 'CORRECTION_REQUIRED') {
      if (!sections || !Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ error: 'At least one section must be specified for correction.' });
      }
      if (!remarks || !remarks.trim()) {
        return res.status(400).json({ error: 'Correction remarks/instructions are required.' });
      }
    }

    const data = await admissionService.getApplicationById(id);
    const oldStatus = data ? data.applicationStatus : 'UNKNOWN';

    const enrollmentNumber = await admissionService.updateStatus(
      id,
      status,
      req.user!.id,
      remarks,
      rejectionReason,
      rejectionReasonCode,
      sections,
      deadline
    );

    // Log audit status change with student identification
    if (status === 'ENROLLED' && enrollmentNumber) {
      await securityEvents.logAdmissionAudit({
        req,
        userId: req.user!.id,
        action: 'ADMIN_APPROVED_ADMISSION',
        admissionOrId: id,
        details: { enrollmentNumber, oldStatus, newStatus: status },
      });
    } else if (status === 'APPROVED') {
      await securityEvents.logAdmissionAudit({
        req,
        userId: req.user!.id,
        action: 'ADMIN_VERIFIED_DOCUMENTS',
        admissionOrId: id,
        details: { oldStatus, newStatus: status },
      });
    } else if (status === 'REJECTED') {
      await securityEvents.logAdmissionAudit({
        req,
        userId: req.user!.id,
        action: 'ADMISSION_STATUS_CHANGE',
        admissionOrId: id,
        details: {
          action: 'ADMISSION_REJECTED',
          reason: rejectionReasonCode,
          remarks: remarks || '',
          performedBy: req.user!.id,
        },
      });
    } else if (status === 'CORRECTION_REQUIRED') {
      await securityEvents.logAdmissionAudit({
        req,
        userId: req.user!.id,
        action: 'ADMISSION_STATUS_CHANGE',
        admissionOrId: id,
        details: {
          action: 'ADMISSION_CORRECTION_REQUIRED',
          sections,
          remarks: remarks || '',
          deadline,
          performedBy: req.user!.id,
        },
      });
    } else {
      await securityEvents.logAdmissionAudit({
        req,
        userId: req.user!.id,
        action: 'ADMISSION_STATUS_CHANGE',
        admissionOrId: id,
        details: { oldStatus, newStatus: status },
      });
    }

    return res.json({ message: `Application ${status.toLowerCase()}`, enrollmentNumber });
  } catch (error: any) {
    console.error('Error updating status:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};

export const verifyAdmissionChecklist = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (req.user!.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN cannot perform routine document verification. This is an ADMIN task.' });
    }

    const { id } = req.params;
    const payload = req.body;
    
    await admissionService.verifyChecklist(id, req.user!.id, payload);
    
    await securityEvents.logAdmissionAudit({
      req,
      userId: req.user!.id,
      action: 'ADMIN_VERIFIED_DOCUMENTS',
      admissionOrId: id,
      details: { payload },
    });
    
    return res.json({ message: 'Validation checklist updated successfully' });
  } catch (error: any) {
    console.error('Error verifying checklist:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};

export const saveDocumentStatuses = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    const { id } = req.params;
    const { statuses } = req.body;

    if (!statuses || typeof statuses !== 'object') {
      return res.status(400).json({ error: 'Invalid document statuses payload.' });
    }

    await admissionService.saveDocumentStatuses(id, statuses);

    await securityEvents.logAdmissionAudit({
      req,
      userId: req.user!.id,
      action: 'ADMIN_UPDATED_DOCUMENT_STATUSES',
      admissionOrId: id,
      details: { statuses },
    });

    return res.json({ success: true, message: 'Document statuses saved successfully.' });
  } catch (error: any) {
    console.error('Error saving document statuses:', error);
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};

/** GET /api/admin/stats */
export const getAdminStats = async (
  _req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const stats = await admissionService.getDashboardStats();
    return res.json({ success: true, data: stats });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/student/cancellation-request */
export const requestAdmissionCancellation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { reason, remarks } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const admission = await Admission.findOne({ where: { userId: req.user!.id } });
    if (!admission) {
      return res.status(404).json({ error: 'Admission application not found' });
    }

    if (admission.applicationStatus !== 'ENROLLED') {
      return res.status(403).json({ error: 'Only confirmed admissions can be cancelled' });
    }

    admission.applicationStatus = 'CANCELLATION_REQUESTED';
    admission.cancellationReason = reason;
    admission.cancellationRemarks = remarks || null;
    admission.cancellationRequestedAt = new Date();
    admission.cancellationRequestedById = req.user!.id;
    await admission.save();
    await admissionService.invalidateCache(admission.userId);

    await securityEvents.logAdmissionAudit({
      userId: req.user!.id,
      action: 'ADMISSION_STATUS_CHANGE',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      admissionOrId: admission,
      details: {
        action: 'ADMISSION_CANCELLATION_REQUESTED',
        reason,
        remarks: remarks || '',
        performedBy: req.user!.id,
      },
    });

    return res.json({ success: true, message: 'Cancellation request submitted successfully' });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/admin/admissions/:id/cancellation-process */
export const processCancellationRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { action, remarks } = req.body; // action: 'APPROVE' | 'REJECT'

    if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
      return res.status(400).json({ error: 'Valid action (APPROVE or REJECT) is required' });
    }

    const admission = await Admission.findByPk(id);
    if (!admission) {
      return res.status(404).json({ error: 'Admission application not found' });
    }

    if (admission.applicationStatus !== 'CANCELLATION_REQUESTED') {
      return res.status(400).json({ error: 'Admission application is not in Cancellation Requested status' });
    }

    if (action === 'APPROVE') {
      admission.applicationStatus = 'CANCELLED';
      admission.cancellationApprovedAt = new Date();
      admission.cancellationApprovedById = req.user!.id;
      admission.cancellationAdminRemarks = remarks || null;
      await admission.save();

      const prevUsn = admission.usn;
      if (prevUsn) {
        await UsnRegistry.update(
          { status: 'AVAILABLE' },
          { where: { usn: prevUsn } }
        );
        admission.usn = null;
        await admission.save();
      }

      const student = await Student.findOne({ where: { userId: admission.userId } });
      if (student) {
        if (student.usn && student.usn !== prevUsn) {
          await UsnRegistry.update(
            { status: 'AVAILABLE' },
            { where: { usn: student.usn } }
          );
        }
        await student.destroy();
      }

      const user = await User.findByPk(admission.userId);
      if (user) {
        await user.update({
          role: 'STUDENT',
          username: user.email
        });
      }

      await admissionService.invalidateCache(admission.userId);

      await securityEvents.logAdmissionAudit({
        userId: req.user!.id,
        action: 'ADMISSION_STATUS_CHANGE',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        admissionOrId: admission,
        details: {
          action: 'ADMISSION_CANCELLATION_APPROVED',
          remarks: remarks || '',
          performedBy: req.user!.id,
        },
      });

      return res.json({ success: true, message: 'Admission cancellation approved successfully' });
    } else {
      // Revert back to ENROLLED (if USN exists) or PRINCIPAL_APPROVED
      admission.applicationStatus = admission.usn ? 'ENROLLED' : 'PRINCIPAL_APPROVED';
      admission.cancellationRejectedAt = new Date();
      admission.cancellationRejectedById = req.user!.id;
      admission.cancellationAdminRemarks = remarks || null;
      await admission.save();
      await admissionService.invalidateCache(admission.userId);

      await securityEvents.logAdmissionAudit({
        userId: req.user!.id,
        action: 'ADMISSION_STATUS_CHANGE',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        admissionOrId: admission,
        details: {
          action: 'ADMISSION_CANCELLATION_REJECTED',
          remarks: remarks || '',
          performedBy: req.user!.id,
        },
      });

      return res.json({ success: true, message: 'Admission cancellation request rejected' });
    }
  } catch (err) {
    return next(err);
  }
};

/** POST /api/admin/admissions/:id/cancellation-direct */
export const directCancelAdmission = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { reason, remarks } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const admission = await Admission.findByPk(id);
    if (!admission) {
      return res.status(404).json({ error: 'Admission application not found' });
    }

    if (admission.applicationStatus !== 'ENROLLED' && admission.applicationStatus !== 'APPROVED') {
      return res.status(400).json({ error: 'Only confirmed/approved admissions can be directly cancelled' });
    }

    admission.applicationStatus = 'CANCELLED';
    admission.cancellationReason = reason;
    admission.cancellationRemarks = remarks || null;
    admission.cancellationApprovedAt = new Date();
    admission.cancellationApprovedById = req.user!.id;
    admission.cancellationAdminRemarks = remarks || null;
    await admission.save();

    const prevUsn = admission.usn;
    if (prevUsn) {
      await UsnRegistry.update(
        { status: 'AVAILABLE' },
        { where: { usn: prevUsn } }
      );
      admission.usn = null;
      await admission.save();
    }

    const student = await Student.findOne({ where: { userId: admission.userId } });
    if (student) {
      if (student.usn && student.usn !== prevUsn) {
        await UsnRegistry.update(
          { status: 'AVAILABLE' },
          { where: { usn: student.usn } }
        );
      }
      await student.destroy();
    }

    const user = await User.findByPk(admission.userId);
    if (user) {
      await user.update({
        role: 'STUDENT',
        username: user.email
      });
    }

    await securityEvents.logAdmissionAudit({
      userId: req.user!.id,
      action: 'ADMISSION_STATUS_CHANGE',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      admissionOrId: admission,
      details: {
        action: 'ADMISSION_CANCELLED_DIRECT',
        reason,
        remarks: remarks || '',
        performedBy: req.user!.id,
      },
    });

    return res.json({ success: true, message: 'Admission cancelled directly by administrator' });
  } catch (err) {
    return next(err);
  }
};

/** POST /api/student/upload-fee-receipt */
export const uploadFeeReceipt = async (
  req: AuthRequest, res: Response, _next: NextFunction
): Promise<any> => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Fee receipt file is required.' });
    }

    const studentId = req.user!.id;

    // Fetch admission + branch + user for R2 key construction
    const admission = await Admission.findOne({
      where: { userId: studentId },
      include: [{ model: Department, as: 'branch' }]
    });
    if (!admission) {
      return res.status(400).json({ success: false, message: 'No admission application found.' });
    }
    const oldPath = admission.admissionFeeReceiptUrl;

    const userRecord = await User.findByPk(studentId, { attributes: ['firstName', 'lastName'] });
    const studentName = userRecord
      ? `${userRecord.firstName || ''} ${userRecord.lastName || ''}`.trim()
      : 'Student';

    // Compress before upload
    await compressLocalImage(file.path, file.mimetype);

    // Upload to R2 using central key utility
    const ext = path.extname(file.originalname).toLowerCase() || path.extname(file.filename).toLowerCase() || '.jpg';
    const r2Key = buildR2Key({
      academicYear:      admission.academicYear || '2026-2027',
      branchCode:        (admission as any).branch?.code || 'GEN',
      studentName,
      applicationNumber: admission.applicationNumber || `TEMP-${studentId}`,
      mappedDocName:     'AdmissionFeesReceipt',
      ext,
    });
    await r2.uploadFromDisk(file.path, r2Key, file.mimetype);

    const result = await admissionService.uploadFeeReceipt(studentId, r2Key);

    // Delete old file (local or R2)
    if (oldPath && oldPath !== r2Key) {
      await deleteOldFile(oldPath);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
};

/** POST /api/admin/admissions/:id/fee-verify */
export const verifyFeeReceipt = async (
  req: AuthRequest, res: Response, _next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { approve, remarks, rejectionReason } = req.body;
    if (typeof approve !== 'boolean') {
      return res.status(400).json({ error: 'approve parameter (boolean) is required.' });
    }

    const result = await admissionService.verifyFeeReceipt(id, req.user!.id, { approve, remarks, rejectionReason });
    
    await securityEvents.logAdmissionAudit({
      userId: req.user!.id,
      action: approve ? 'ADMIN_VERIFIED_FEE_RECEIPT' : 'ADMIN_REJECTED_FEE_RECEIPT',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      admissionOrId: id,
      details: { approve, remarks, rejectionReason },
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

/** PUT /api/admin/admissions/:id */
export const updateAdmissionDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const transaction = await db.transaction();
  try {
    const { id } = req.params;
    const payload = req.body;

    let admission = await Admission.findByPk(id, { transaction });
    if (!admission) {
      const student = await Student.findOne({
        where: { [Op.or]: [{ id }, { userId: id }] },
        transaction
      });

      if (student) {
        const sanitizePayload = (obj: any) => {
          if (!obj || typeof obj !== 'object') return obj;
          const sanitized = { ...obj };
          for (const key of Object.keys(sanitized)) {
            if (sanitized[key] === '') {
              sanitized[key] = null;
            }
          }
          return sanitized;
        };

        if (payload.branchId !== undefined) {
          student.departmentId = payload.branchId === 'ALL' || payload.branchId === '' ? student.departmentId : payload.branchId;
        }
        if (payload.academicYear !== undefined) student.currentAcademicYear = payload.academicYear;
        if (payload.admissionType !== undefined) student.admissionType = payload.admissionType;
        if (payload.semester !== undefined) {
          const s = parseInt(payload.semester, 10);
          if (!isNaN(s)) student.semester = s;
        }

        if (payload.user) {
          const user = await User.findByPk(student.userId, { transaction });
          if (user) {
            const sanitizedUser = sanitizePayload(payload.user);
            if (sanitizedUser.firstName !== undefined) user.firstName = sanitizedUser.firstName;
            if (sanitizedUser.lastName !== undefined) user.lastName = sanitizedUser.lastName;
            if (sanitizedUser.email !== undefined) user.email = sanitizedUser.email;
            if (sanitizedUser.phone !== undefined) user.phone = sanitizedUser.phone;
            await user.save({ transaction });
          }
        }

        if (payload.studentpersonaldetails) {
          const spd = sanitizePayload(payload.studentpersonaldetails);
          if (spd.gender !== undefined) student.gender = spd.gender;
          if (spd.dateOfBirth !== undefined) student.dateOfBirth = spd.dateOfBirth ? new Date(spd.dateOfBirth) : null;
        }

        if (payload.studentparentdetails) {
          const spar = sanitizePayload(payload.studentparentdetails);
          if (spar.fatherName !== undefined) student.fatherName = spar.fatherName;
          if (spar.motherName !== undefined) student.motherName = spar.motherName;
          if (spar.fatherPhone !== undefined || spar.parentPhone !== undefined) student.parentPhone = spar.fatherPhone || spar.parentPhone;
          if (spar.fatherEmail !== undefined) student.parentEmail = spar.fatherEmail;
        }

        if (payload.studentaddress) {
          const saddr = sanitizePayload(payload.studentaddress);
          if (saddr.currentAddressLine1 !== undefined) student.address = saddr.currentAddressLine1;
        }

        await student.save({ transaction });
        await transaction.commit();
        return res.json({ success: true, message: 'Student details updated successfully.' });
      }

      await transaction.rollback();
      return res.status(404).json({ error: 'Admission or Student record not found.' });
    }

    const sanitizePayload = (obj: any) => {
      if (!obj || typeof obj !== 'object') return obj;
      const sanitized = { ...obj };
      for (const key of Object.keys(sanitized)) {
        if (sanitized[key] === '') {
          sanitized[key] = null;
        }
      }
      return sanitized;
    };

    // Update main Admission fields
    if (payload.admissionType !== undefined) admission.admissionType = payload.admissionType;
    if (payload.branchId !== undefined) admission.branchId = payload.branchId === 'ALL' || payload.branchId === '' ? null : payload.branchId;
    if (payload.academicYear !== undefined) admission.academicYear = payload.academicYear;
    if (payload.aadhaar !== undefined) admission.aadhaar = payload.aadhaar;
    if (payload.cetNumber !== undefined) admission.cetNumber = payload.cetNumber;
    if (payload.dcetNumber !== undefined) admission.dcetNumber = payload.dcetNumber;
    await admission.save({ transaction });

    // Update associated User fields
    if (payload.user) {
      const user = await User.findByPk(admission.userId, { transaction });
      if (user) {
        const sanitizedUser = sanitizePayload(payload.user);
        if (sanitizedUser.firstName !== undefined) user.firstName = sanitizedUser.firstName;
        if (sanitizedUser.lastName !== undefined) user.lastName = sanitizedUser.lastName;
        if (sanitizedUser.email !== undefined) user.email = sanitizedUser.email;
        if (sanitizedUser.phone !== undefined) user.phone = sanitizedUser.phone;
        await user.save({ transaction });
      }
    }

    // Update AdmissionPersonalDetail fields
    if (payload.studentpersonaldetails) {
      const [pd] = await AdmissionPersonalDetail.findOrCreate({
        where: { admissionId: id },
        defaults: { admissionId: id },
        transaction
      });
      await pd.update(sanitizePayload(payload.studentpersonaldetails), { transaction });
    }

    // Update AdmissionParentDetail fields
    if (payload.studentparentdetails) {
      const [par] = await AdmissionParentDetail.findOrCreate({
        where: { admissionId: id },
        defaults: { admissionId: id },
        transaction
      });
      await par.update(sanitizePayload(payload.studentparentdetails), { transaction });
    }

    // Update AdmissionAddress fields
    if (payload.studentaddress) {
      const [addr] = await AdmissionAddress.findOrCreate({
        where: { admissionId: id },
        defaults: { admissionId: id },
        transaction
      });
      await addr.update(sanitizePayload(payload.studentaddress), { transaction });
    }

    // Update AdmissionAcademicDetail fields
    if (payload.studentacademicdetails) {
      const [acad] = await AdmissionAcademicDetail.findOrCreate({
        where: { admissionId: id },
        defaults: { admissionId: id },
        transaction
      });
      await acad.update(sanitizePayload(payload.studentacademicdetails), { transaction });
    }

    await transaction.commit();
    return res.json({ success: true, message: 'Admission application details updated successfully.' });
  } catch (err) {
    await transaction.rollback();
    return next(err);
  }
};

/** POST /api/admin/admissions/:id/documents (Admin Document Upload) */
export const saveAdminDocuments = async (
  req: AuthRequest & { studentUserId?: string }, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    const studentId = req.studentUserId;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Could not resolve student identity.' });
    }

    // Fetch admission + branch + user for R2 key construction
    const admission = await Admission.findOne({
      where: { userId: studentId },
      include: [{ model: Department, as: 'branch' }]
    });
    const existingDocs = admission
      ? await AdmissionDocument.findOne({ where: { admissionId: admission.id } })
      : null;

    const userRecord = await User.findByPk(studentId, { attributes: ['firstName', 'lastName'] });
    const studentName = userRecord
      ? `${userRecord.firstName || ''} ${userRecord.lastName || ''}`.trim()
      : 'Student';

    const fileUrls: Record<string, string> = {};
    for (const field of Object.keys(files)) {
      const file = files[field][0];
      await compressLocalImage(file.path, file.mimetype);

      // Build R2 key using central utility
      const r2Key = buildR2Key({
        academicYear:      admission?.academicYear || '2026-2027',
        branchCode:        (admission as any)?.branch?.code || 'GEN',
        studentName,
        applicationNumber: admission?.applicationNumber || `TEMP-${studentId}`,
        mappedDocName:     MAPPED_DOC_NAMES[file.fieldname] || file.fieldname,
        ext:               path.extname(file.originalname).toLowerCase() || '.jpg',
      });
      await r2.uploadFromDisk(file.path, r2Key, file.mimetype);
      fileUrls[`${file.fieldname}Url`] = r2Key;
    }

    const admissionId = await admissionService.saveStep6(studentId, fileUrls);
    securityEvents.documentUpload(req, studentId, admissionId, Object.keys(fileUrls));

    // Delete old files (local or R2)
    if (existingDocs) {
      for (const dbKeyField of Object.keys(fileUrls)) {
        const oldPath = existingDocs.get(dbKeyField as any) as string | null;
        if (oldPath && oldPath !== fileUrls[dbKeyField]) {
          await deleteOldFile(oldPath);
        }
      }
    }

    // Return signed URLs so the admin document view can immediately preview
    const responseUrls: Record<string, string> = {};
    for (const k of Object.keys(fileUrls)) {
      responseUrls[k] = r2.getSignedUrlSync(fileUrls[k]);
    }

    return res.json({ success: true, message: 'Documents uploaded.', data: responseUrls });
  } catch (err) {
    return next(err);
  }
};

/** DELETE /api/admin/admissions/:id/documents/:field (Admin Remove Document) */
export const removeAdminDocument = async (
  req: AuthRequest & { studentUserId?: string }, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { field } = req.params;
    const validFields = [
      'photo', 'signature', 'tenthMarksheet', 'twelfthMarksheet',
      'diplomaSemester5Marksheet', 'diplomaSemester6Marksheet',
      'cetScoreCard', 'aadhaar', 'casteCertificate', 'domicileCertificate',
      'gapCertificate', 'feesPaidReceipt'
    ];
    if (!validFields.includes(field)) {
      return res.status(400).json({ success: false, message: 'Invalid document field.' });
    }

    const dbKeyField = `${field}Url`;
    const studentId = req.studentUserId;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Could not resolve student identity.' });
    }

    // Get old local file path
    const admission = await Admission.findOne({ where: { userId: studentId } });
    const existingDocs = admission
      ? await AdmissionDocument.findOne({ where: { admissionId: admission.id } })
      : null;
    const oldPath = existingDocs ? (existingDocs.get(dbKeyField as any) as string | null) : null;

    await admissionService.saveStep6(studentId, { [dbKeyField]: null });

    // Delete old file — works for both local /uploads/... paths and R2 object keys
    if (oldPath) {
      await deleteOldFile(oldPath);
    }

    return res.json({ success: true, message: 'Document removed.', data: { [dbKeyField]: null } });
  } catch (err) {
    return next(err);
  }
};

/** DELETE /api/admin/admissions/bulk-delete-cancelled */
export const bulkDeleteCancelledAdmissions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const transaction = await db.transaction();
  try {
    // 1. Fetch all cancelled admissions
    const cancelledAdmissions = await Admission.findAll({
      where: { applicationStatus: 'CANCELLED' },
      transaction
    });

    if (cancelledAdmissions.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ error: 'No cancelled admission applications found to delete.' });
    }

    const admissionIds = cancelledAdmissions.map(a => a.id);
    const userIds = cancelledAdmissions.map(a => a.userId).filter(Boolean);

    // Fetch corresponding student profile records to release USNs
    const cancelledStudents = await Student.findAll({
      where: { userId: userIds },
      transaction
    });

    // 2. Perform database deletes in order
    // Delete Admission documents
    await AdmissionDocument.destroy({ where: { admissionId: admissionIds }, transaction });

    // Delete Admission details
    await AdmissionAcademicDetail.destroy({ where: { admissionId: admissionIds }, transaction });
    await AdmissionAddress.destroy({ where: { admissionId: admissionIds }, transaction });
    await AdmissionParentDetail.destroy({ where: { admissionId: admissionIds }, transaction });
    await AdmissionPersonalDetail.destroy({ where: { admissionId: admissionIds }, transaction });

    // Release USN in UsnRegistry if any was claimed
    const studentUSNs = cancelledStudents.map(s => s.usn).filter(Boolean);
    if (studentUSNs.length > 0) {
      await UsnRegistry.update(
        { status: 'AVAILABLE' },
        { where: { usn: studentUSNs }, transaction }
      );
    }

    // Delete Student records
    await Student.destroy({ where: { userId: userIds }, transaction });

    // Delete Notifications
    await Notification.destroy({ where: { targetUserId: userIds }, transaction });

    // Delete Admission applications
    await Admission.destroy({ where: { id: admissionIds }, transaction });

    // Delete associated User accounts
    await User.destroy({ where: { id: userIds }, transaction });

    // 3. Record Audit Log inside the transaction
    const adminUser = await User.findByPk(req.user!.id, { transaction });
    const adminName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() : 'Admin';

    await AuditLog.create({
      userId: req.user!.id,
      action: 'BULK_DELETE_CANCELLED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        adminId: req.user!.id,
        adminName,
        timestamp: new Date(),
        count: cancelledAdmissions.length,
        admissionIds,
        userIds,
        applicationNumbers: cancelledAdmissions.map(a => a.applicationNumber).filter(Boolean),
        performedBy: req.user!.id,
      },
    }, { transaction });

    // 4. Commit database transaction
    await transaction.commit();

    // 5. File System Cleanup (Post-commit)
    const baseUploadDir = path.join(process.cwd(), 'uploads', 'admissions');
    for (const userId of userIds) {
      if (!userId) continue;

      // Validate UUID strictly to prevent path traversal
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        logger.error(`Skipping file cleanup for invalid student user UUID: ${userId}`);
        continue;
      }

      const studentFolder = path.join(baseUploadDir, userId);

      // Verify path belongs to uploads/admissions directory
      const relativePath = path.relative(baseUploadDir, studentFolder);
      const isSafe = relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

      if (!isSafe) {
        logger.error(`Security Alert: Blocked path traversal attempt for student user ID: ${userId}`);
        continue;
      }

      try {
        if (fs.existsSync(studentFolder)) {
          fs.rmSync(studentFolder, { recursive: true, force: true });
          logger.info(`Successfully deleted upload folder for student user ID: ${userId}`);
        }
      } catch (fileErr) {
        logger.error(`Failed to delete upload folder for student user ID ${userId}:`, fileErr);
      }
    }

    return res.json({
      success: true,
      message: `${cancelledAdmissions.length} cancelled student record(s) permanently deleted.`
    });
  } catch (err) {
    await transaction.rollback();
    return next(err);
  }
};

/** DELETE /api/admin/admissions/:id */
export const deleteAdmissionById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const { id } = req.params;
  const transaction = await db.transaction();
  try {
    const admission = await Admission.findByPk(id, { transaction });
    if (!admission) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Admission application not found.' });
    }

    // Security check: Only allow deleting REJECTED applications
    if (admission.applicationStatus !== 'REJECTED') {
      await transaction.rollback();
      return res.status(400).json({ error: 'Only rejected applications can be deleted.' });
    }

    const userId = admission.userId;

    // Fetch corresponding student profile records if any
    const student = await Student.findOne({
      where: { userId },
      transaction
    });

    // Capture student identification for historical audit snapshot before deleting records
    const studentIdent = await securityEvents.resolveStudentIdentification(admission);

    // Perform database deletes in order
    await AdmissionDocument.destroy({ where: { admissionId: id }, transaction });
    await AdmissionAcademicDetail.destroy({ where: { admissionId: id }, transaction });
    await AdmissionAddress.destroy({ where: { admissionId: id }, transaction });
    await AdmissionParentDetail.destroy({ where: { admissionId: id }, transaction });
    await AdmissionPersonalDetail.destroy({ where: { admissionId: id }, transaction });

    // Release USN in UsnRegistry if any was claimed
    const usnsToRelease: string[] = [];
    if (student && student.usn) usnsToRelease.push(student.usn);
    if (admission.usn) usnsToRelease.push(admission.usn);
    if (usnsToRelease.length > 0) {
      await UsnRegistry.update(
        { status: 'AVAILABLE' },
        { where: { usn: usnsToRelease }, transaction }
      );
    }

    // Delete Student records
    await Student.destroy({ where: { userId }, transaction });

    // Delete Notifications
    await Notification.destroy({ where: { targetUserId: userId }, transaction });

    // Delete Admission application
    await Admission.destroy({ where: { id }, transaction });

    // Delete associated User account
    await User.destroy({ where: { id: userId }, transaction });

    // Record Audit Log inside the transaction
    const adminUser = await User.findByPk(req.user!.id, { transaction });
    const adminName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() : 'Admin';

    await AuditLog.create({
      userId: req.user!.id,
      action: 'DELETE_REJECTED_ADMISSION',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        adminId: req.user!.id,
        adminName,
        timestamp: new Date(),
        admissionId: id,
        applicationNumber: admission.applicationNumber,
        studentName: studentIdent.studentName,
        userId,
        performedBy: req.user!.id,
      },
    }, { transaction });


    // Commit database transaction
    await transaction.commit();

    // File System Cleanup (Post-commit)
    if (userId) {
      const baseUploadDir = path.join(process.cwd(), 'uploads', 'admissions');
      // Validate UUID strictly to prevent path traversal
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(userId)) {
        const studentFolder = path.join(baseUploadDir, userId);
        // Verify path belongs to uploads/admissions directory
        const relativePath = path.relative(baseUploadDir, studentFolder);
        const isSafe = relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

        if (isSafe) {
          try {
            if (fs.existsSync(studentFolder)) {
              fs.rmSync(studentFolder, { recursive: true, force: true });
              logger.info(`Successfully deleted upload folder for student user ID: ${userId}`);
            }
          } catch (fileErr) {
            logger.error(`Failed to delete upload folder for student user ID ${userId}:`, fileErr);
          }
        } else {
          logger.error(`Security Alert: Blocked path traversal attempt for student user ID: ${userId}`);
        }
      } else {
        logger.error(`Skipping file cleanup for invalid student user UUID: ${userId}`);
      }
    }

    return res.json({
      success: true,
      message: `Rejected application ${admission.applicationNumber} permanently deleted.`
    });
  } catch (err) {
    await transaction.rollback();
    return next(err);
  }
};

// ─── USN ENTRY & ALLOCATION SYSTEM ───────────────────────────────────────────

/** GET /api/admin/usn/eligible */
export const listUsnEligibleApplicants = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const {
      academicYear,
      branchId,
      semester,
      entryType,
      usnStatus,
      search,
      alphabet,
      sortBy = 'name',
      sortOrder = 'ASC',
      page = 1,
      limit = 25,
    } = req.query as any;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 25;
    const offset = (pageNum - 1) * limitNum;

    // Base query only includes eligible verified/approved statuses
    const where: any = {
      applicationStatus: { [Op.in]: ['APPROVED', 'PRINCIPAL_APPROVED', 'ENROLLED'] },
    };

    // Filter by Academic Year using canonical normalization and variants (handles 2027-28, 2027-2028, 2027–28)
    if (academicYear && academicYear !== 'ALL') {
      const variants = getAcademicYearVariants(String(academicYear));
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { academicYear: { [Op.in]: variants } },
          { '$user.student.currentAcademicYear$': { [Op.in]: variants } },
        ]
      });
    }

    // Filter by Branch
    if (branchId && branchId !== 'ALL') {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { branchId: branchId },
          { '$user.student.departmentId$': branchId }
        ]
      });
    }

    // Filter by Semester
    if (semester && semester !== 'ALL') {
      const semNum = parseInt(semester, 10);
      where[Op.and] = where[Op.and] || [];
      if (semNum === 3) {
        where[Op.and].push({
          [Op.or]: [
            { entrySemester: 3 },
            { qualification: 'DIPLOMA' },
            { admissionType: 'DCET' },
            { applicationType: 'LATERAL_ENTRY' },
            { '$user.student.semester$': 3 }
          ]
        });
      } else if (semNum === 1) {
        where[Op.and].push({
          [Op.or]: [
            { entrySemester: 1 },
            { '$user.student.semester$': 1 },
            {
              [Op.and]: [
                { entrySemester: { [Op.or]: [1, null] } },
                { qualification: { [Op.or]: [{ [Op.ne]: 'DIPLOMA' }, { [Op.eq]: null }] } },
                { admissionType: { [Op.or]: [{ [Op.ne]: 'DCET' }, { [Op.eq]: null }] } },
                { applicationType: { [Op.or]: [{ [Op.ne]: 'LATERAL_ENTRY' }, { [Op.eq]: null }] } },
              ]
            }
          ]
        });
      } else if (!isNaN(semNum)) {
        where[Op.and].push({
          [Op.or]: [
            { entrySemester: semNum },
            { '$user.student.semester$': semNum }
          ]
        });
      }
    }

    // Filter by Entry Type (Regular or Lateral)
    if (entryType && entryType !== 'ALL') {
      where[Op.and] = where[Op.and] || [];
      if (entryType === 'LATERAL') {
        where[Op.and].push({
          [Op.or]: [
            { qualification: 'DIPLOMA' },
            { admissionType: 'DCET' },
            { applicationType: 'LATERAL_ENTRY' }
          ]
        });
      } else if (entryType === 'REGULAR') {
        where[Op.and].push({
          qualification: { [Op.or]: [{ [Op.ne]: 'DIPLOMA' }, { [Op.eq]: null }] },
          admissionType: { [Op.or]: [{ [Op.ne]: 'DCET' }, { [Op.eq]: null }] },
        });
      }
    }

    // Filter by USN Status
    if (usnStatus && usnStatus !== 'ALL') {
      where[Op.and] = where[Op.and] || [];
      if (usnStatus === 'PENDING') {
        where[Op.and].push({
          [Op.or]: [
            { usn: null },
            { usn: '' }
          ]
        });
      } else if (usnStatus === 'ASSIGNED') {
        where[Op.and].push({
          usn: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
        });
      }
    }

    // Universal Search
    if (search && search.trim() !== '') {
      const s = search.trim();
      const tokens = s.split(/\s+/).filter(Boolean);

      const searchOrs: any[] = [
        { applicationNumber: { [Op.iLike]: `%${s}%` } },
        { usn: { [Op.iLike]: `%${s}%` } },
        { '$studentpersonaldetails.firstName$': { [Op.iLike]: `%${s}%` } },
        { '$studentpersonaldetails.lastName$': { [Op.iLike]: `%${s}%` } },
        Sequelize.where(
          Sequelize.fn('concat', Sequelize.col('studentpersonaldetails.firstName'), ' ', Sequelize.fn('coalesce', Sequelize.col('studentpersonaldetails.middleName'), ''), ' ', Sequelize.col('studentpersonaldetails.lastName')),
          { [Op.iLike]: `%${s}%` }
        ),
        Sequelize.where(
          Sequelize.fn('concat', Sequelize.col('studentpersonaldetails.firstName'), ' ', Sequelize.col('studentpersonaldetails.lastName')),
          { [Op.iLike]: `%${s}%` }
        ),
      ];

      if (tokens.length > 1) {
        searchOrs.push({
          [Op.and]: tokens.map(token => ({
            [Op.or]: [
              { '$studentpersonaldetails.firstName$': { [Op.iLike]: `%${token}%` } },
              { '$studentpersonaldetails.middleName$': { [Op.iLike]: `%${token}%` } },
              { '$studentpersonaldetails.lastName$': { [Op.iLike]: `%${token}%` } },
              { applicationNumber: { [Op.iLike]: `%${token}%` } },
              { usn: { [Op.iLike]: `%${token}%` } },
            ]
          }))
        });
      }

      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({ [Op.or]: searchOrs });
    }

    // Alphabet filter
    if (alphabet && alphabet !== 'ALL') {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        '$studentpersonaldetails.firstName$': { [Op.iLike]: `${alphabet}%` },
      });
    }

    // Order/Sorting
    let order: any[] = [];
    const dir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    if (sortBy === 'applicationNumber') {
      order = [['applicationNumber', dir]];
    } else if (sortBy === 'usn') {
      order = [['usn', `${dir} NULLS LAST`]];
    } else if (sortBy === 'usnStatus') {
      order = [['usn', dir === 'ASC' ? 'NULLS FIRST' : 'NULLS LAST']];
    } else {
      // Default: Normalized Full Name A-Z/Z-A sorting
      order = [
        [
          db.literal('LOWER(TRIM(CONCAT(COALESCE("studentpersonaldetails"."firstName", \'\'), \' \', COALESCE("studentpersonaldetails"."middleName", \'\'), \' \', COALESCE("studentpersonaldetails"."lastName", \'\'))))'),
          dir
        ]
      ];
    }

    const { count, rows } = await Admission.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
          include: [
            {
              model: Student,
              as: 'student',
              attributes: ['id', 'semester', 'enrollmentNumber', 'rollNumber', 'currentAcademicYear', 'departmentId'],
              required: false,
            }
          ]
        },
        { model: Department, as: 'branch', attributes: ['id', 'name', 'code'] },
        { model: User, as: 'verifiedByAdmin', attributes: ['id', 'firstName', 'lastName', 'email', 'username'], required: false },
        { model: User, as: 'correctionRequestedBy', attributes: ['id', 'firstName', 'lastName', 'email', 'username'], required: false },
        { model: User, as: 'rejectedByAdmin', attributes: ['id', 'firstName', 'lastName', 'email', 'username'], required: false },
        { model: User, as: 'approvedByAdmin', attributes: ['id', 'firstName', 'lastName', 'email', 'username'], required: false },
        { model: AdmissionPersonalDetail, as: 'studentpersonaldetails', attributes: ['firstName', 'middleName', 'lastName'] },
      ],
      order,
      limit: limitNum,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
      applicants: rows,
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/usn/summary */
export const getUsnSummary = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { academicYear, branchId, semester, entryType } = req.query as any;

    const baseWhere: any = {
      applicationStatus: { [Op.in]: ['APPROVED', 'PRINCIPAL_APPROVED', 'ENROLLED'] },
    };

    if (academicYear && academicYear !== 'ALL') {
      const variants = getAcademicYearVariants(String(academicYear));
      baseWhere[Op.and] = baseWhere[Op.and] || [];
      baseWhere[Op.and].push({
        [Op.or]: [
          { academicYear: { [Op.in]: variants } },
          { '$user.student.currentAcademicYear$': { [Op.in]: variants } }
        ]
      });
    }

    if (branchId && branchId !== 'ALL') {
      baseWhere[Op.and] = baseWhere[Op.and] || [];
      baseWhere[Op.and].push({
        [Op.or]: [
          { branchId: branchId },
          { '$user.student.departmentId$': branchId }
        ]
      });
    }

    if (semester && semester !== 'ALL') {
      const semNum = parseInt(semester, 10);
      baseWhere[Op.and] = baseWhere[Op.and] || [];
      if (semNum === 3) {
        baseWhere[Op.and].push({
          [Op.or]: [
            { entrySemester: 3 },
            { qualification: 'DIPLOMA' },
            { admissionType: 'DCET' },
            { applicationType: 'LATERAL_ENTRY' },
            { '$user.student.semester$': 3 }
          ]
        });
      } else if (semNum === 1) {
        baseWhere[Op.and].push({
          [Op.or]: [
            { entrySemester: 1 },
            { '$user.student.semester$': 1 },
            {
              [Op.and]: [
                { entrySemester: { [Op.or]: [1, null] } },
                { qualification: { [Op.or]: [{ [Op.ne]: 'DIPLOMA' }, { [Op.eq]: null }] } },
                { admissionType: { [Op.or]: [{ [Op.ne]: 'DCET' }, { [Op.eq]: null }] } },
                { applicationType: { [Op.or]: [{ [Op.ne]: 'LATERAL_ENTRY' }, { [Op.eq]: null }] } },
              ]
            }
          ]
        });
      } else if (!isNaN(semNum)) {
        baseWhere[Op.and].push({
          [Op.or]: [
            { entrySemester: semNum },
            { '$user.student.semester$': semNum }
          ]
        });
      }
    }

    if (entryType && entryType !== 'ALL') {
      baseWhere[Op.and] = baseWhere[Op.and] || [];
      if (entryType === 'LATERAL') {
        baseWhere[Op.and].push({
          [Op.or]: [
            { qualification: 'DIPLOMA' },
            { admissionType: 'DCET' },
            { applicationType: 'LATERAL_ENTRY' }
          ]
        });
      } else if (entryType === 'REGULAR') {
        baseWhere[Op.and].push({
          qualification: { [Op.or]: [{ [Op.ne]: 'DIPLOMA' }, { [Op.eq]: null }] },
          admissionType: { [Op.or]: [{ [Op.ne]: 'DCET' }, { [Op.eq]: null }] },
        });
      }
    }

    const include = [
      {
        model: User,
        as: 'user',
        attributes: ['id'],
        include: [
          {
            model: Student,
            as: 'student',
            attributes: ['id', 'semester', 'currentAcademicYear', 'departmentId'],
            required: false,
          }
        ],
        required: false,
      }
    ];

    const totalEligible = await Admission.count({
      where: baseWhere,
      include,
      distinct: true,
      col: 'id',
    });

    const assigned = await Admission.count({
      where: {
        ...baseWhere,
        usn: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      },
      include,
      distinct: true,
      col: 'id',
    });

    const pending = totalEligible - assigned;
    const completionRate = totalEligible > 0 ? parseFloat(((assigned / totalEligible) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      data: {
        totalEligible,
        assigned,
        pending,
        completionRate,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/** Shared USN Assignment validation helper */
const validateUsnAssignment = async (
  applicationId: string,
  usn: string | null | undefined
): Promise<{ error?: string; admission?: Admission; cleanUsn?: string | null }> => {
  const admission = await Admission.findByPk(applicationId, {
    include: [
      { model: Department, as: 'branch' },
      { model: AdmissionPersonalDetail, as: 'studentpersonaldetails' },
    ]
  });

  if (!admission) {
    return { error: 'Admission application not found.' };
  }

  if (!['APPROVED', 'PRINCIPAL_APPROVED', 'ENROLLED'].includes(admission.applicationStatus)) {
    return { error: 'Applicant is not in an eligible status for USN allocation.' };
  }

  // If USN is empty/null, it is a removal request — always valid
  if (!usn || usn.trim() === '') {
    return { admission, cleanUsn: null };
  }

  const cleanUsn = usn.trim().toUpperCase();
  const match = cleanUsn.match(/^2JR(\d{2})([A-Z]{2})(\d{3})$/);
  if (!match) {
    return { error: 'Invalid USN format. Must match pattern 2JR + YY + XX + NNN (e.g. 2JR26CS101).' };
  }

  const usnYearSuffix = match[1];
  const usnDeptCode = match[2];

  // Validate USN year suffix matches application academic year
  let expectedYearSuffix = '';
  if (admission.academicYear) {
    const startYear = admission.academicYear.split('-')[0].trim();
    if (startYear.length === 4) {
      expectedYearSuffix = startYear.substring(2);
    }
  }
  if (expectedYearSuffix && usnYearSuffix !== expectedYearSuffix) {
    return { error: `USN year '${usnYearSuffix}' does not match academic year '${admission.academicYear}' (expected '${expectedYearSuffix}').` };
  }

  // Validate department code matches branch code via centralized VTU branch mappings
  if (!admission.branch) {
    return { error: 'No branch is assigned to this applicant.' };
  }
  const VTU_BRANCH_CODES: Record<string, string> = {
    'CSE': 'CS',
    'CSE-AIML': 'CI',
    'AIML': 'CI',
    'AI&ML': 'CI',
    'AI-ML': 'CI',
    'CV': 'CV',
    'CIVIL': 'CV',
    'CE': 'CV',
    'ECE': 'EC',
    'ME': 'ME',
    'MECHANICAL': 'ME',
    'ISE': 'IS',
    'IS': 'IS',
    'CSE-DS': 'CD',
    'DS': 'CD',
    'CSBS': 'CB',
    'EEE': 'EE',
    'EE': 'EE'
  };
  const normBranch = admission.branch.code.toUpperCase().trim();
  const expectedPrefix = VTU_BRANCH_CODES[normBranch] || normBranch.substring(0, 2);
  if (expectedPrefix !== usnDeptCode) {
    return { error: `USN department code '${usnDeptCode}' does not match applicant branch '${admission.branch.code}' (expected '${expectedPrefix}').` };
  }

  // Check uniqueness across other admissions
  const duplicateAdmission = await Admission.findOne({
    where: { usn: cleanUsn, id: { [Op.ne]: applicationId } }
  });
  if (duplicateAdmission) {
    return { error: `USN ${cleanUsn} is already assigned to another applicant.` };
  }

  const duplicateStudent = await Student.findOne({
    where: { usn: cleanUsn, userId: { [Op.ne]: admission.userId } }
  });
  if (duplicateStudent) {
    return { error: `USN ${cleanUsn} is already assigned to another student.` };
  }

  return { admission, cleanUsn };
};

/** POST /api/admin/usn/bulk-assign */
export const bulkAssignUsns = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const { assignments, source = 'MANUAL', batchId } = req.body;

  if (!assignments || !Array.isArray(assignments)) {
    return res.status(400).json({ error: 'Assignments array is required.' });
  }

  const validationResults: { applicationId: string; error: string }[] = [];
  const processedAssignments: { admission: Admission; cleanUsn: string | null }[] = [];

  // Check local duplicates in payload
  const localUsns = new Set<string>();
  for (const item of assignments) {
    if (item.usn && item.usn.trim() !== '') {
      const u = item.usn.trim().toUpperCase();
      if (localUsns.has(u)) {
        validationResults.push({ applicationId: item.applicationId, error: `Duplicate USN '${u}' submitted multiple times in the same batch.` });
      } else {
        localUsns.add(u);
      }
    }
  }

  for (const item of assignments) {
    const { applicationId, usn } = item;
    if (!applicationId) {
      validationResults.push({ applicationId: '', error: 'Application ID is required for each assignment.' });
      continue;
    }
    try {
      const { error, admission, cleanUsn } = await validateUsnAssignment(applicationId, usn);
      if (error) {
        validationResults.push({ applicationId, error });
      } else if (admission) {
        processedAssignments.push({ admission, cleanUsn: cleanUsn ?? null });
      }
    } catch (e: any) {
      validationResults.push({ applicationId, error: e.message || 'System validation error.' });
    }
  }

  if (validationResults.length > 0) {
    return res.status(400).json({ success: false, message: 'Some USN assignments failed validation.', errors: validationResults });
  }

  // Sort for deterministic locking order to avoid deadlocks
  processedAssignments.sort((a, b) => {
    const uA = a.cleanUsn || '';
    const uB = b.cleanUsn || '';
    if (uA && uB) return uA.localeCompare(uB);
    return a.admission.id.localeCompare(b.admission.id);
  });

  const transaction = await db.transaction();
  try {
    const adminUser = await User.findByPk(req.user!.id, { transaction });
    const adminName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() : 'Admin';

    for (const item of processedAssignments) {
      const { admission, cleanUsn } = item;
      const prevUsn = admission.usn;
      if (prevUsn === cleanUsn) continue;

      // 1. Release previous USN if any was assigned
      if (prevUsn) {
        const prevRegistry = await UsnRegistry.findOne({
          where: { usn: prevUsn },
          lock: transaction.LOCK.UPDATE,
          transaction
        });
        if (prevRegistry) {
          await prevRegistry.update({ status: 'AVAILABLE' }, { transaction });
        }
      }

      // 2. Claim and lock new USN
      if (cleanUsn) {
        let registryEntry = await UsnRegistry.findOne({
          where: { usn: cleanUsn },
          lock: transaction.LOCK.UPDATE,
          transaction
        });
        if (!registryEntry) {
          // Auto-create registry entry if not pre-seeded — admin-assigned USNs are trusted
          const studentFullName = admission.studentpersonaldetails
            ? `${admission.studentpersonaldetails.firstName || ''} ${admission.studentpersonaldetails.lastName || ''}`.trim()
            : 'Unknown';
          const deptCode = admission.branch?.code || 'GEN';
          registryEntry = await UsnRegistry.create({
            usn: cleanUsn,
            status: 'CLAIMED',
            studentName: studentFullName,
            departmentCode: deptCode,
            semester: 1,
          }, { transaction });
        } else {
          if (registryEntry.status !== 'AVAILABLE') {
            throw new Error(`USN ${cleanUsn} is already claimed by another candidate.`);
          }
          await registryEntry.update({ status: 'CLAIMED' }, { transaction });
        }
      }

      await admission.update({ usn: cleanUsn }, { transaction });

      if (admission.applicationStatus === 'ENROLLED') {
        const student = await Student.findOne({ where: { userId: admission.userId }, transaction });
        if (student) {
          // Requirement 1 & 5: Permanent Student Identity
          // USN is updated on the existing student record.
          // Never overwrite permanent enrollmentNumber or replace historical rollNumber.
          await student.update({
            usn: cleanUsn || null,
            ...(student.enrollmentNumber ? {} : { enrollmentNumber: cleanUsn || null }),
          }, { transaction });
        }
        const user = await User.findByPk(admission.userId, { transaction });
        if (user && cleanUsn) await user.update({ username: cleanUsn.toLowerCase() }, { transaction });
      }

      await AuditLog.create({
        userId: req.user!.id,
        action: cleanUsn ? (prevUsn ? 'USN_UPDATED' : 'USN_ASSIGNED') : 'USN_REMOVED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
          admissionId: admission.id,
          applicationNumber: admission.applicationNumber,
          studentName: admission.studentpersonaldetails ? `${admission.studentpersonaldetails.firstName} ${admission.studentpersonaldetails.middleName ? admission.studentpersonaldetails.middleName + ' ' : ''}${admission.studentpersonaldetails.lastName}`.replace(/\s+/g, ' ').trim() : 'N/A',
          previousUsn: prevUsn || null,
          newUsn: cleanUsn || null,
          assignedBy: req.user!.id,
          assignedByName: adminName,
          source,
          batchId: batchId || null,
          timestamp: new Date()
        }
      }, { transaction });
    }

    await transaction.commit();
    return res.json({ success: true, message: 'All USNs assigned successfully.' });
  } catch (err: any) {
    await transaction.rollback();
    console.error('[bulkAssignUsns] Transaction failed:', err.message);
    return res.status(500).json({ error: err.message || 'USN assignment failed. Changes rolled back.' });
  }
};

/** PATCH /api/admin/usn/:id */
export const assignSingleUsn = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const { id } = req.params;
  const { usn } = req.body;

  try {
    const { error, admission, cleanUsn } = await validateUsnAssignment(id, usn);
    if (error) return res.status(400).json({ error });
    if (!admission) return res.status(404).json({ error: 'Admission application not found.' });

    const transaction = await db.transaction();
    try {
      const prevUsn = admission.usn;
      const adminUser = await User.findByPk(req.user!.id, { transaction });
      const adminName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() : 'Admin';

      if (prevUsn !== cleanUsn) {
        // 1. Release previous USN if any was assigned
        if (prevUsn) {
          const prevRegistry = await UsnRegistry.findOne({
            where: { usn: prevUsn },
            lock: transaction.LOCK.UPDATE,
            transaction
          });
          if (prevRegistry) {
            await prevRegistry.update({ status: 'AVAILABLE' }, { transaction });
          }
        }

        // 2. Claim and validate new USN
        if (cleanUsn) {
          let registryEntry = await UsnRegistry.findOne({
            where: { usn: cleanUsn },
            lock: transaction.LOCK.UPDATE,
            transaction
          });
          if (!registryEntry) {
            // Auto-create registry entry if not pre-seeded — admin-assigned USNs are trusted
            const studentFullName = admission.studentpersonaldetails
              ? `${admission.studentpersonaldetails.firstName || ''} ${admission.studentpersonaldetails.lastName || ''}`.trim()
              : 'Unknown';
            const deptCode = admission.branch?.code || 'GEN';
            registryEntry = await UsnRegistry.create({
              usn: cleanUsn,
              status: 'CLAIMED',
              studentName: studentFullName,
              departmentCode: deptCode,
              semester: 1,
            }, { transaction });
          } else {
            if (registryEntry.status !== 'AVAILABLE') {
              throw new Error(`USN ${cleanUsn} is already claimed by another candidate.`);
            }

            const dupAdm = await Admission.findOne({ where: { usn: cleanUsn, id: { [Op.ne]: admission.id } }, transaction });
            const dupStu = await Student.findOne({ where: { usn: cleanUsn, userId: { [Op.ne]: admission.userId } }, transaction });
            if (dupAdm || dupStu) throw new Error(`USN ${cleanUsn} has already been assigned to another applicant.`);

            await registryEntry.update({ status: 'CLAIMED' }, { transaction });
          }
        }

        await admission.update({ usn: cleanUsn }, { transaction });

        if (admission.applicationStatus === 'ENROLLED') {
          const student = await Student.findOne({ where: { userId: admission.userId }, transaction });
          if (student) {
            // Requirement 1 & 5: Permanent Student Identity
            // USN is updated on the existing student record.
            // Never overwrite permanent enrollmentNumber or replace historical rollNumber.
            await student.update({
              usn: cleanUsn || null,
              ...(student.enrollmentNumber ? {} : { enrollmentNumber: cleanUsn || null }),
            }, { transaction });
          }
          const user = await User.findByPk(admission.userId, { transaction });
          if (user && cleanUsn) await user.update({ username: cleanUsn.toLowerCase() }, { transaction });
        }

        await AuditLog.create({
          userId: req.user!.id,
          action: cleanUsn ? (prevUsn ? 'USN_UPDATED' : 'USN_ASSIGNED') : 'USN_REMOVED',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            admissionId: admission.id,
            applicationNumber: admission.applicationNumber,
            studentName: admission.studentpersonaldetails ? `${admission.studentpersonaldetails.firstName} ${admission.studentpersonaldetails.middleName ? admission.studentpersonaldetails.middleName + ' ' : ''}${admission.studentpersonaldetails.lastName}`.replace(/\s+/g, ' ').trim() : 'N/A',
            previousUsn: prevUsn || null,
            newUsn: cleanUsn || null,
            assignedBy: req.user!.id,
            assignedByName: adminName,
            source: 'MANUAL',
            timestamp: new Date()
          }
        }, { transaction });
      }

      await transaction.commit();
      return res.json({ success: true, message: 'USN assigned successfully.' });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    return next(err);
  }
};

/** DELETE /api/admin/usn/:id */
export const removeUsn = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const { id } = req.params;

  try {
    const admission = await Admission.findByPk(id, {
      include: [
        { model: AdmissionPersonalDetail, as: 'studentpersonaldetails' },
      ]
    });

    if (!admission) {
      return res.status(404).json({ error: 'Admission application not found.' });
    }

    const prevUsn = admission.usn;
    if (!prevUsn) {
      return res.status(400).json({ error: 'No USN is currently assigned to this applicant.' });
    }

    const transaction = await db.transaction();
    try {
      const adminUser = await User.findByPk(req.user!.id, { transaction });
      const adminName = adminUser ? `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() : 'Admin';

      // Clear the USN from the admission record
      await admission.update({ usn: null }, { transaction });

      if (admission.applicationStatus === 'ENROLLED') {
        const student = await Student.findOne({ where: { userId: admission.userId }, transaction });
        if (student) {
          await student.update({ usn: null, enrollmentNumber: null }, { transaction });
        }
        const user = await User.findByPk(admission.userId, { transaction });
        if (user) {
          await user.update({ username: user.email }, { transaction });
        }
      }

      await AuditLog.create({
        userId: req.user!.id,
        action: 'USN_REMOVED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: {
          admissionId: admission.id,
          applicationNumber: admission.applicationNumber,
          studentName: admission.studentpersonaldetails ? `${admission.studentpersonaldetails.firstName} ${admission.studentpersonaldetails.middleName ? admission.studentpersonaldetails.middleName + ' ' : ''}${admission.studentpersonaldetails.lastName}`.replace(/\s+/g, ' ').trim() : 'N/A',
          previousUsn: prevUsn,
          newUsn: null,
          assignedBy: req.user!.id,
          assignedByName: adminName,
          source: 'MANUAL',
          timestamp: new Date()
        }
      }, { transaction });

      await transaction.commit();
      return res.json({ success: true, message: 'USN removed successfully.' });
    } catch (txErr) {
      await transaction.rollback();
      throw txErr;
    }
  } catch (err) {
    return next(err);
  }
};

const normalizeApplicationNumber = (value: unknown): string => {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .toUpperCase();
};

/** POST /api/admin/usn/validate-import */
export const validateImportUsns = async (
  req: any,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Rows array is required.' });
    }

    const results: any[] = [];
    const localUsns = new Set<string>();
    const localAppNums = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const appNum = row.applicationNumber ? String(row.applicationNumber).trim() : '';
      const usnRaw = row.usn ? String(row.usn).trim().toUpperCase() : '';

      if (!appNum) {
        results.push({ rowNumber: rowNum, applicationNumber: '', usn: usnRaw, valid: false, error: 'Application number is missing.' });
        continue;
      }

      const normalizedAppNum = normalizeApplicationNumber(appNum);
      if (localAppNums.has(normalizedAppNum)) {
        results.push({ rowNumber: rowNum, applicationNumber: appNum, usn: usnRaw, valid: false, error: 'Duplicate application number in sheet.' });
        continue;
      }
      localAppNums.add(normalizedAppNum);

      if (!usnRaw) {
        results.push({ rowNumber: rowNum, applicationNumber: appNum, usn: '', valid: false, error: 'USN is missing.' });
        continue;
      }

      if (localUsns.has(usnRaw)) {
        results.push({ rowNumber: rowNum, applicationNumber: appNum, usn: usnRaw, valid: false, error: `Duplicate USN '${usnRaw}' in sheet.` });
        continue;
      }
      localUsns.add(usnRaw);

      // Find Admission by normalized application number
      const admission = await Admission.findOne({
        where: db.where(
          db.fn('LOWER', db.fn('TRIM', db.col('applicationNumber'))),
          normalizedAppNum.toLowerCase()
        ),
        include: [
          { model: Department, as: 'branch' },
          { model: AdmissionPersonalDetail, as: 'studentpersonaldetails' },
        ]
      });

      if (!admission) {
        results.push({ rowNumber: rowNum, applicationNumber: appNum, usn: usnRaw, valid: false, error: 'Application number not found.' });
        continue;
      }

      const buildErrorResult = (errMsg: string) => ({
        rowNumber: rowNum,
        applicationNumber: admission.applicationNumber,
        usn: usnRaw,
        valid: false,
        error: errMsg,
        applicationId: admission.id
      });

      if (!['APPROVED', 'PRINCIPAL_APPROVED', 'ENROLLED'].includes(admission.applicationStatus)) {
        results.push(buildErrorResult(`Applicant status '${admission.applicationStatus}' is not eligible for USN allocation.`));
        continue;
      }

      const match = usnRaw.match(/^2JR(\d{2})([A-Z]{2})(\d{3})$/);
      if (!match) {
        results.push(buildErrorResult('Invalid USN format. Must be 2JR + YY + XX + NNN (e.g. 2JR26CS101).'));
        continue;
      }

      const usnYearSuffix = match[1];
      const usnDeptCode = match[2];

      // Validate year suffix
      let expectedYearSuffix = '';
      if (admission.academicYear) {
        const startYear = admission.academicYear.split('-')[0].trim();
        if (startYear.length === 4) {
          expectedYearSuffix = startYear.substring(2);
        }
      }
      if (expectedYearSuffix && usnYearSuffix !== expectedYearSuffix) {
        results.push(buildErrorResult(`USN year '${usnYearSuffix}' does not match academic year '${admission.academicYear}' (expected '${expectedYearSuffix}').`));
        continue;
      }

      if (!admission.branch) {
        results.push(buildErrorResult('No department/branch assigned to applicant.'));
        continue;
      }

      const VTU_BRANCH_CODES: Record<string, string> = {
        'CSE': 'CS',
        'CSE-AIML': 'CI',
        'AIML': 'CI',
        'AI&ML': 'CI',
        'AI-ML': 'CI',
        'CV': 'CV',
        'CIVIL': 'CV',
        'CE': 'CV',
        'ECE': 'EC',
        'ME': 'ME',
        'MECHANICAL': 'ME',
        'ISE': 'IS',
        'IS': 'IS',
        'CSE-DS': 'CD',
        'DS': 'CD',
        'CSBS': 'CB',
        'EEE': 'EE',
        'EE': 'EE'
      };
      const normBranch = admission.branch.code.toUpperCase().trim();
      const expectedDept = VTU_BRANCH_CODES[normBranch] || normBranch.substring(0, 2);
      if (expectedDept !== usnDeptCode) {
        results.push(buildErrorResult(`USN department code '${usnDeptCode}' does not match branch '${admission.branch.code}' (expected '${expectedDept}').`));
        continue;
      }

      // Check uniqueness
      const duplicateAdmission = await Admission.findOne({
        where: { usn: usnRaw, id: { [Op.ne]: admission.id } }
      });
      if (duplicateAdmission) {
        results.push(buildErrorResult(`USN is already assigned to application ${duplicateAdmission.applicationNumber}.`));
        continue;
      }

      const duplicateStudent = await Student.findOne({
        where: { usn: usnRaw, userId: { [Op.ne]: admission.userId } }
      });
      if (duplicateStudent) {
        results.push(buildErrorResult('USN is already assigned to another student.'));
        continue;
      }

      // Valid
      results.push({
        rowNumber: rowNum,
        applicationNumber: admission.applicationNumber,
        applicantName: admission.studentpersonaldetails ? `${admission.studentpersonaldetails.firstName} ${admission.studentpersonaldetails.middleName ? admission.studentpersonaldetails.middleName + ' ' : ''}${admission.studentpersonaldetails.lastName}`.replace(/\s+/g, ' ').trim() : 'N/A',
        branch: admission.branch.code,
        entryType: admission.qualification === 'DIPLOMA' || admission.admissionType === 'DCET' ? 'Lateral' : 'Regular',
        currentUsn: admission.usn || '—',
        usn: usnRaw,
        applicationId: admission.id,
        valid: true
      });
    }

    return res.json({ success: true, results });
  } catch (err) {
    return next(err);
  }
};

export const exportSingleStudentZip = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    
    // Verify admin/principal authorization (already done by route middleware)
    const admission = await Admission.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName'] },
        { model: Department, as: 'branch' },
        { model: AdmissionDocument, as: 'studentdocuments' }
      ]
    });

    if (!admission) {
      return res.status(404).json({ error: 'Admission application not found.' });
    }

    const docs = admission.studentdocuments;
    if (!docs) {
      return res.status(404).json({ error: 'No documents found for this student.' });
    }

    const studentName = admission.user 
      ? `${admission.user.firstName || ''} ${admission.user.lastName || ''}`.trim()
      : 'Student';
    const appNum = admission.applicationNumber || `TEMP-${id}`;
    const safeStudentName = sanitizeStudentName(studentName);
    const zipFolderName = `${safeStudentName} - ${appNum}`;

    // Set streaming headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${appNum}_docs.zip"`);

    const zip = new StreamingZip(res);
    let documentCount = 0;

    for (const field of Object.keys(DOCUMENT_FIELD_MAP)) {
      const dbKey = DOCUMENT_FIELD_MAP[field];
      const fileUrl = docs.get(dbKey as any) as string | null;
      if (fileUrl) {
        let fileBuffer: Buffer | null = null;
        try {
          if (fileUrl.startsWith('/uploads/') || fileUrl.startsWith('uploads/')) {
            const absolutePath = path.join(process.cwd(), fileUrl.replace(/^\/+/, ''));
            if (fs.existsSync(absolutePath)) {
              fileBuffer = fs.readFileSync(absolutePath);
            }
          } else {
            // Cloudflare R2
            fileBuffer = await r2.getFile(fileUrl);
          }

          if (fileBuffer) {
            const ext = path.extname(fileUrl).toLowerCase() || '.jpg';
            const mappedName = MAPPED_DOC_NAMES[field] || field;
            const entryPath = `${zipFolderName}/${mappedName}${ext}`;
            await zip.addFile(entryPath, fileBuffer);
            documentCount++;
          }
        } catch (err) {
          logger.error(`Error loading document ${fileUrl} for zip:`, err);
        }
      }
    }

    // Export provisional admission documents (if any)
    if (admission.userId) {
      try {
        const studentRecord = await Student.findOne({ where: { userId: admission.userId } });
        if (studentRecord) {
          const ProvisionalAdmission = (await import('../models/ProvisionalAdmission')).default;
          const ProvisionalAdmissionDocument = (await import('../models/ProvisionalAdmissionDocument')).default;

          const provApps = await ProvisionalAdmission.findAll({
            where: { studentId: studentRecord.id },
            include: [{ model: ProvisionalAdmissionDocument, as: 'documents' }]
          });
          for (const app of provApps) {
            if (app.documents && app.documents.length > 0) {
              for (const doc of app.documents) {
                const fileUrl = doc.r2Key;
                if (fileUrl) {
                  let fileBuffer: Buffer | null = null;
                  try {
                    fileBuffer = await r2.getFile(fileUrl);
                    if (fileBuffer) {
                      const ext = path.extname(fileUrl).toLowerCase() || '.jpg';
                      let docLabel = '';
                      if (doc.documentType === 'FEE_RECEIPT') {
                        docLabel = 'CollegeFeeReceipt';
                      } else if (doc.documentType === 'SEMESTER_MARKS_CARD') {
                        docLabel = `MarksCard_Sem${doc.semesterNumber}`;
                      } else {
                        docLabel = doc.originalFileName || 'ProvisionalDoc';
                      }
                      docLabel = docLabel.replace(/\.[^/.]+$/, '');
                      
                      const admissionYear = admission.academicYear || '2026-2027';
                      const shortYear = admissionYear.replace(/-20(\d\d)$/, '-$1');
                      const semFolder = app.semester === 3 ? '3rd-semester' : app.semester === 5 ? '5th-semester' : '7th-semester';
                      
                      const entryPath = `${zipFolderName}/provisional-admission/${shortYear}/${semFolder}/${docLabel}${ext}`;
                      await zip.addFile(entryPath, fileBuffer);
                      documentCount++;
                    }
                  } catch (err) {
                    logger.error(`Error loading provisional document ${fileUrl} for zip:`, err);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        logger.error(`Error loading provisional documents for student ${studentName}:`, err);
      }
    }

    await zip.finalize();

    // Log individual zip download
    await securityEvents.logAdmissionAudit({
      userId: req.user!.id,
      action: 'INDIVIDUAL_ZIP_DOWNLOAD',
      ip: req.ip || undefined,
      userAgent: req.headers['user-agent'] || undefined,
      admissionOrId: id,
      details: { studentName, documentCount }
    });

  } catch (err) {
    return next(err);
  }
};

export const previewBulkExport = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { academicYear, branchId } = req.query;
    if (!academicYear || typeof academicYear !== 'string' || !academicYear.trim()) {
      return res.status(400).json({ success: false, error: 'Academic Year is required.' });
    }

    const admissions = await getEligibleAdmissionsForExport(
      String(academicYear),
      branchId ? String(branchId) : undefined
    );

    let documentCount = 0;
    const eligibleStudents: Array<{
      id: string;
      applicationNumber: string;
      studentName: string;
      status: string;
      documentCount: number;
    }> = [];

    for (const adm of admissions) {
      const studentExport = await identifyStudentDocuments(adm, String(academicYear));
      documentCount += studentExport.items.length;
      eligibleStudents.push({
        id: adm.id,
        applicationNumber: studentExport.applicationNumber,
        studentName: studentExport.studentName,
        status: studentExport.status,
        documentCount: studentExport.items.length,
      });
    }

    return res.json({
      success: true,
      studentCount: admissions.length,
      documentCount,
      eligibleStudents,
    });

  } catch (err) {
    return next(err);
  }
};

export const bulkExportDocuments = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { academicYear, branchId } = req.query;
    if (!academicYear || typeof academicYear !== 'string' || !academicYear.trim()) {
      return res.status(400).json({ error: 'Academic Year is required.' });
    }

    // Set execution timeout to 10 minutes to prevent request timeout problems
    req.setTimeout(600000);
    res.setTimeout(600000);

    const admissions = await getEligibleAdmissionsForExport(
      String(academicYear),
      branchId ? String(branchId) : undefined
    );

    if (!admissions || admissions.length === 0) {
      return res.status(404).json({ error: 'No finalized students found matching the filters.' });
    }

    const zipFileName = `VTU_Documents_${String(academicYear).replace(/\s+/g, '_')}_${branchId || 'ALL'}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const zip = new StreamingZip(res);
    let totalDocumentsAdded = 0;
    
    let summaryText = `JCER ERP - ADMISSION DOCUMENTS EXPORT SUMMARY\n`;
    summaryText += `Academic Year: ${academicYear}\n`;
    summaryText += `Department/Branch Filter: ${branchId || 'ALL'}\n`;
    summaryText += `Total Eligible Finalized Students: ${admissions.length}\n`;
    summaryText += `Export Date: ${new Date().toLocaleString('en-IN')}\n`;
    summaryText += `======================================================================\n\n`;
    summaryText += `STUDENTS LOG AND DOCUMENT COVERAGE:\n\n`;

    for (const adm of admissions) {
      const studentExport = await identifyStudentDocuments(adm, String(academicYear));
      const addedForStudent: string[] = [];
      const failedForStudent: string[] = [];

      for (const item of studentExport.items) {
        const fileBuffer = await fetchDocumentWithRetry(item.r2Key, item.fallbackKeys);
        if (fileBuffer && fileBuffer.length > 0) {
          await zip.addFile(item.entryPath, fileBuffer);
          totalDocumentsAdded++;
          addedForStudent.push(item.documentTypeLabel);
        } else {
          failedForStudent.push(item.documentTypeLabel);
        }
      }

      summaryText += `• Student: ${studentExport.studentName}\n`;
      summaryText += `  Application Number: ${studentExport.applicationNumber}\n`;
      summaryText += `  Branch: ${studentExport.branchCode}\n`;
      summaryText += `  Added Documents: ${addedForStudent.join(', ') || 'None'}\n`;
      if (studentExport.missingDocuments.length > 0 || failedForStudent.length > 0) {
        const missingAll = [...studentExport.missingDocuments, ...failedForStudent];
        summaryText += `  Missing Documents: ${missingAll.join(', ')}\n`;
      }
      summaryText += `\n`;
    }

    // Add EXPORT_SUMMARY.txt to ZIP
    const summaryBuffer = Buffer.from(summaryText, 'utf-8');
    await zip.addFile('EXPORT_SUMMARY.txt', summaryBuffer);

    await zip.finalize();

    // Log bulk ZIP download
    await AuditLog.create({
      userId: req.user!.id,
      action: 'BULK_DOCUMENT_EXPORT',
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      details: { academicYear, branchId, studentCount: admissions.length, documentCount: totalDocumentsAdded }
    });

  } catch (err) {
    return next(err);
  }
};

/** POST /api/admin/documents/bulk-export — Start asynchronous export job */
export const startBulkExportJob = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { academicYear, branchId } = req.body;
    if (!academicYear || typeof academicYear !== 'string' || !academicYear.trim()) {
      return res.status(400).json({ success: false, error: 'Academic Year is required.' });
    }

    const adminUserId = req.user!.id;
    const rawAy = String(academicYear).trim();
    const canonicalAy = normalizeAcademicYear(rawAy);
    const ayVariants = Array.from(new Set([
      rawAy,
      canonicalAy,
      ...getAcademicYearVariants(rawAy),
      ...getAcademicYearVariants(canonicalAy),
    ])).filter(Boolean);

    // Check for an existing QUEUED or PROCESSING job with matching filters
    const BulkExportJob = (await import('../models/BulkExportJob')).default;
    const bulkExportWorker = (await import('../services/bulkExportWorker.service')).default;

    const activeJob = await BulkExportJob.findOne({
      where: {
        createdBy: adminUserId,
        academicYear: { [Op.in]: ayVariants },
        branchId: branchId || 'ALL',
        status: { [Op.in]: ['QUEUED', 'PROCESSING'] }
      }
    });

    if (activeJob) {
      return res.json({
        success: true,
        jobId: activeJob.id,
        status: activeJob.status,
        message: 'An active export job is already running with these filters.',
      });
    }

    const newJob = await BulkExportJob.create({
      createdBy: adminUserId,
      academicYear: rawAy,
      branchId: branchId || 'ALL',
      status: 'QUEUED',
      progress: 0,
    });

    // Trigger worker asynchronously
    bulkExportWorker.triggerWorker();

    await AuditLog.create({
      userId: adminUserId,
      action: 'BULK_EXPORT_JOB_CREATED',
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
      details: { jobId: newJob.id, academicYear: rawAy, branchId }
    });

    return res.status(201).json({
      success: true,
      jobId: newJob.id,
      status: newJob.status,
      message: 'Export job queued successfully.'
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/documents/bulk-export/active — Check for active or completed job */
export const getActiveBulkExportJob = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const adminUserId = req.user!.id;
    const { academicYear, branchId } = req.query;
    const BulkExportJob = (await import('../models/BulkExportJob')).default;

    const baseWhere: any = {
      createdBy: adminUserId,
    };
    if (academicYear) {
      const rawAy = String(academicYear).trim();
      const canonicalAy = normalizeAcademicYear(rawAy);
      const ayVariants = Array.from(new Set([
        rawAy,
        canonicalAy,
        ...getAcademicYearVariants(rawAy),
        ...getAcademicYearVariants(canonicalAy),
      ])).filter(Boolean);
      baseWhere.academicYear = { [Op.in]: ayVariants };
    }
    if (branchId) {
      baseWhere.branchId = String(branchId);
    }

    // 1. Prioritize any actively running job (QUEUED or PROCESSING)
    let job = await BulkExportJob.findOne({
      where: {
        ...baseWhere,
        status: { [Op.in]: ['QUEUED', 'PROCESSING'] }
      },
      order: [['createdAt', 'DESC']]
    });

    // 2. If no in-progress job, retrieve the latest completed job matching the filter
    if (!job) {
      job = await BulkExportJob.findOne({
        where: {
          ...baseWhere,
          status: { [Op.in]: ['COMPLETED', 'COMPLETED_WITH_ERRORS'] }
        },
        order: [['createdAt', 'DESC']]
      });
    }

    if (!job) {
      return res.json({ success: true, job: null });
    }

    return res.json({
      success: true,
      job: {
        id: job.id,
        academicYear: job.academicYear,
        branchId: job.branchId,
        status: job.status,
        totalStudents: job.totalStudents,
        totalDocuments: job.totalDocuments,
        processedDocuments: job.processedDocuments,
        failedDocuments: job.failedDocuments,
        progress: job.progress,
        zipSize: job.zipSize ? Number(job.zipSize) : null,
        error: job.error,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
      }
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/documents/bulk-export/:jobId — Poll job progress */
export const getBulkExportJobStatus = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { jobId } = req.params;
    const BulkExportJob = (await import('../models/BulkExportJob')).default;

    const job = await BulkExportJob.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Export job not found.' });
    }

    return res.json({
      success: true,
      job: {
        id: job.id,
        academicYear: job.academicYear,
        branchId: job.branchId,
        status: job.status,
        totalStudents: job.totalStudents,
        totalDocuments: job.totalDocuments,
        processedDocuments: job.processedDocuments,
        failedDocuments: job.failedDocuments,
        progress: job.progress,
        zipSize: job.zipSize ? Number(job.zipSize) : null,
        error: job.error,
        completedAt: job.completedAt,
        expiresAt: job.expiresAt,
      }
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/documents/bulk-export/:jobId/download — Secure R2 signed download URL */
export const getBulkExportDownloadUrl = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { jobId } = req.params;
    const BulkExportJob = (await import('../models/BulkExportJob')).default;

    const job = await BulkExportJob.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Export job not found.' });
    }

    if (!['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(job.status)) {
      return res.status(400).json({ success: false, error: `Export package is not ready. Current status: ${job.status}` });
    }

    if (!job.zipObjectKey) {
      return res.status(404).json({ success: false, error: 'Export file key is missing or expired.' });
    }

    const filename = `VTU_Documents_${job.academicYear.replace(/\s+/g, '_')}_${job.branchId}.zip`;
    const downloadUrl = await r2.getSignedUrl(job.zipObjectKey, 3600, filename);

    return res.json({
      success: true,
      downloadUrl,
      directDownloadUrl: `/api/admin/documents/bulk-export/${jobId}/download-file`,
      filename,
      size: job.zipSize ? Number(job.zipSize) : null,
    });
  } catch (err) {
    return next(err);
  }
};

/** GET /api/admin/documents/bulk-export/:jobId/download-file — Direct authenticated stream download */
export const downloadBulkExportZipFile = async (
  req: AuthRequest, res: Response, next: NextFunction
): Promise<any> => {
  try {
    const { jobId } = req.params;
    logger.info(`[BULK DOWNLOAD] request received jobId=${jobId}`);

    const BulkExportJob = (await import('../models/BulkExportJob')).default;
    const job = await BulkExportJob.findByPk(jobId);

    if (!job) {
      logger.warn(`[BULK DOWNLOAD] jobId=${jobId} not found`);
      return res.status(404).json({ success: false, error: 'Export job not found.' });
    }

    logger.info(`[BULK DOWNLOAD] jobId=${job.id} status=${job.status} zipKey=${job.zipObjectKey} zipSize=${job.zipSize}`);

    if (!['COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(job.status)) {
      logger.warn(`[BULK DOWNLOAD] job not completed: status=${job.status}`);
      return res.status(400).json({ success: false, error: `Export package is not ready. Current status: ${job.status}` });
    }

    if (!job.zipObjectKey) {
      logger.error(`[BULK DOWNLOAD] job.zipObjectKey is missing`);
      return res.status(404).json({ success: false, error: 'Export file key is missing or expired.' });
    }

    const filename = `VTU_Documents_${job.academicYear.replace(/\s+/g, '_')}_${job.branchId}.zip`;

    // 1. If signed direct download URL is available, redirect to Cloudflare R2 directly (fast, resilient, no backend RAM load)
    try {
      const signedDownloadUrl = await r2.getSignedUrl(job.zipObjectKey, 3600, filename);
      if (signedDownloadUrl && (signedDownloadUrl.startsWith('http://') || signedDownloadUrl.startsWith('https://'))) {
        logger.info(`[BULK DOWNLOAD] Redirecting jobId=${jobId} to direct R2 signed download URL`);
        return res.redirect(signedDownloadUrl);
      }
    } catch (urlErr: any) {
      logger.warn(`[BULK DOWNLOAD] Signed URL redirect fallback: ${urlErr.message}`);
    }

    // 2. Stream fallback from R2 to client response without buffering whole file in RAM
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (job.zipSize) {
      res.setHeader('Content-Length', String(job.zipSize));
    }
    res.setHeader('Cache-Control', 'no-transform, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-No-Compression', '1');
    res.setHeader('x-no-compression', '1');

    res.on('finish', () => {
      logger.info(`[BULK DOWNLOAD] response completed successfully for job ${jobId}`);
    });
    res.on('close', () => {
      logger.info(`[BULK DOWNLOAD] response connection closed for job ${jobId}`);
    });
    res.on('error', (resErr) => {
      logger.error(`[BULK DOWNLOAD] response error for job ${jobId}:`, resErr);
    });

    logger.info(`[BULK DOWNLOAD] streaming response for job ${jobId}`);
    const stream = r2.getFileStream(job.zipObjectKey);
    stream.on('error', (streamErr) => {
      logger.error(`[BULK DOWNLOAD] R2 stream error for job ${jobId}:`, streamErr);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to stream ZIP archive from storage.' });
      }
    });
    return stream.pipe(res);
  } catch (err: any) {
    logger.error(`[BULK DOWNLOAD] response error: ${err.message}`, err);
    return next(err);
  }
};


import { google } from 'googleapis';
import { Readable } from 'stream';
import GoogleDriveIntegration from '../models/GoogleDriveIntegration';
import AttendanceBackupFile from '../models/AttendanceBackupFile';
import AttendanceBackupJob from '../models/AttendanceBackupJob';
import User from '../models/User';
import MarksBackupFile from '../models/MarksBackupFile';
import { encryptText, decryptText } from '../utils/crypto.util';
import logger from '../utils/logger.util';

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const ROOT_FOLDER_NAME = 'JCER ERP Attendance';

/**
 * Canonical 5 permanent default department folders created directly under Root:
 * JCER ERP Attendance/
 *   ├── CSE/
 *   ├── CSE-AIML/
 *   ├── ECE/
 *   ├── ME/
 *   └── CV/
 *
 * AS is explicitly excluded from default folder creation.
 */
export const PERMANENT_ATTENDANCE_DEPARTMENT_CODES = [
  'CSE',
  'CSE-AIML',
  'ECE',
  'ME',
  'CV',
] as const;

/**
 * Resolves canonical attendance department code from department code, UUID, or name.
 * CRITICAL ARCHITECTURE RULE:
 * CSE and CSE-AIML MUST NEVER be treated as the same department.
 * Preserves exact distinct identities:
 * - 'CSE' -> 'CSE'
 * - 'CSE-AIML' / 'AIML' -> 'CSE-AIML'
 * - 'ECE' -> 'ECE'
 * - 'ME' -> 'ME'
 * - 'CV' -> 'CV'
 * - 'AS' -> 'AS'
 * NEVER performs fuzzy .includes('CSE') checks.
 */
export function resolveAttendanceDepartmentCode(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return 'CSE';
  const clean = input.trim();
  const upper = clean.toUpperCase();

  // 1. Direct exact canonical codes
  if (upper === 'CSE-AIML' || upper === 'AIML') return 'CSE-AIML';
  if (upper === 'CSE') return 'CSE';
  if (upper === 'ECE') return 'ECE';
  if (upper === 'ME') return 'ME';
  if (upper === 'CV') return 'CV';
  if (upper === 'AS') return 'AS';

  // 2. Known PostgreSQL Department UUIDs
  if (clean === 'e2d70068-a247-4b6d-8ad2-c95d5dd4287f') return 'CSE-AIML';
  if (clean === '9cb41a9d-e5b9-474c-a586-a86772eec5b3') return 'CSE';
  if (clean === '5134929b-53d4-44a8-a881-3882ba1f5e93') return 'ECE';
  if (clean === '3083bb23-656a-4285-a5c1-64ff455a45aa') return 'ME';
  if (clean === 'cb064a49-a8aa-40b8-9942-0473780624ae') return 'CV';
  if (clean === '337858c4-7aa8-4826-8118-d748a04daf31') return 'AS';

  // 3. Exact full names (case-insensitive)
  if (
    upper === 'COMPUTER SCIENCE & ENGINEERING (AIML)' ||
    upper === 'COMPUTER SCIENCE AND ENGINEERING (AIML)'
  ) {
    return 'CSE-AIML';
  }
  if (
    upper === 'COMPUTER SCIENCE & ENGINEERING' ||
    upper === 'COMPUTER SCIENCE AND ENGINEERING'
  ) {
    return 'CSE';
  }
  if (
    upper === 'ELECTRONICS & COMMUNICATION ENGINEERING' ||
    upper === 'ELECTRONICS AND COMMUNICATION ENGINEERING'
  ) {
    return 'ECE';
  }
  if (upper === 'MECHANICAL ENGINEERING') return 'ME';
  if (upper === 'CIVIL ENGINEERING') return 'CV';
  if (upper === 'APPLIED SCIENCE') return 'AS';

  // 4. Code prefix with separator (ALWAYS test CSE-AIML before CSE!)
  if (/^CSE-AIML([—–:\s-]|$)/i.test(clean)) return 'CSE-AIML';
  if (/^AIML([—–:\s-]|$)/i.test(clean)) return 'CSE-AIML';
  if (/^CSE([—–:\s-]|$)/i.test(clean)) return 'CSE';
  if (/^ECE([—–:\s-]|$)/i.test(clean)) return 'ECE';
  if (/^ME([—–:\s-]|$)/i.test(clean)) return 'ME';
  if (/^CV([—–:\s-]|$)/i.test(clean)) return 'CV';
  if (/^AS([—–:\s-]|$)/i.test(clean)) return 'AS';

  return upper;
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const backendBase =
    process.env.API_URL?.replace(/\/api\/?$/, '') ||
    process.env.BACKEND_URL?.replace(/\/api\/?$/, '') ||
    process.env.RENDER_EXTERNAL_URL ||
    'http://localhost:5000';

  const defaultRedirectUri = `${backendBase}/api/google/oauth/callback`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are missing from backend environment.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export const googleDriveService = {
  /**
   * Generates Google OAuth consent URL with CSRF state
   */
  generateAuthUrl(stateData?: string): string {
    const oauth2Client = getOAuth2Client();
    const state = stateData || `state_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Ensures refresh token is always returned
      scope: DRIVE_SCOPES,
      state,
    });
  },

  /**
   * Exchanges OAuth authorization code for tokens, saves encrypted refresh token, and initializes root folder
   */
  async handleOAuthCallback(code: string, userId?: string): Promise<{ accountEmail: string; rootFolderId: string }> {
    const oauth2Client = getOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.refresh_token) {
      // Check if existing refresh token is already stored
      const existing = await GoogleDriveIntegration.findOne({
        where: { status: 'CONNECTED' },
        order: [['updatedAt', 'DESC']],
      });
      if (!existing || !existing.encryptedRefreshToken) {
        throw new Error('No refresh token received from Google. Please reconnect with consent prompt.');
      }
    }

    // Retrieve user profile from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const accountEmail = userInfo.data.email || 'jcer.attendance.backup@gmail.com';
    const accountName = userInfo.data.name || 'JCER Google Account';

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Find or create Root Folder "JCER ERP Attendance"
    const rootFolderId = await this.ensureRootFolder(drive);

    // Ensure 5 permanent default department folders exist under Root
    await this.ensureDefaultDepartmentFolders(drive, rootFolderId);

    // Save or update GoogleDriveIntegration record
    let integration = await GoogleDriveIntegration.findOne({
      order: [['createdAt', 'ASC']],
    });

    const encryptedToken = tokens.refresh_token ? encryptText(tokens.refresh_token) : integration?.encryptedRefreshToken || '';

    if (integration) {
      integration.accountEmail = accountEmail;
      integration.accountName = accountName;
      if (tokens.refresh_token) {
        integration.encryptedRefreshToken = encryptedToken;
      }
      integration.accessToken = tokens.access_token || null;
      integration.tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      integration.rootFolderId = rootFolderId;
      integration.rootFolderName = ROOT_FOLDER_NAME;
      integration.status = 'CONNECTED';
      integration.connectedById = userId || integration.connectedById;
      integration.lastSyncAt = new Date();
      integration.lastError = null;
      await integration.save();
    } else {
      integration = await GoogleDriveIntegration.create({
        accountEmail,
        accountName,
        encryptedRefreshToken: encryptedToken,
        accessToken: tokens.access_token || null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scope: DRIVE_SCOPES.join(' '),
        rootFolderId,
        rootFolderName: ROOT_FOLDER_NAME,
        status: 'CONNECTED',
        autoBackupEnabled: true,
        connectedById: userId || null,
        lastSyncAt: new Date(),
      });
    }

    logger.info(`Google Drive successfully connected for account ${accountEmail} by user ${userId}. Root folder ID: ${rootFolderId}`);
    return { accountEmail, rootFolderId };
  },

  /**
   * Retrieves authorized Google Drive client with automatic token refreshing
   */
  async getAuthorizedDriveClient() {
    const integration = await GoogleDriveIntegration.findOne({
      where: { status: 'CONNECTED' },
    });

    if (!integration || !integration.encryptedRefreshToken) {
      throw new Error('Google Drive is not connected. Please connect from Dean Settings.');
    }

    const refreshToken = decryptText(integration.encryptedRefreshToken);
    const oauth2Client = getOAuth2Client();

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Setup listener for auto-refreshed access tokens
    oauth2Client.on('tokens', async (tokens) => {
      try {
        if (tokens.access_token) {
          integration.accessToken = tokens.access_token;
          if (tokens.expiry_date) {
            integration.tokenExpiry = new Date(tokens.expiry_date);
          }
          await integration.save();
        }
      } catch (err: any) {
        logger.warn('Failed to update refreshed access token in DB:', err.message);
      }
    });

    return {
      drive: google.drive({ version: 'v3', auth: oauth2Client }),
      integration,
    };
  },

  /**
   * Ensures the root folder "JCER ERP Attendance" exists and is not trashed
   */
  async ensureRootFolder(drive: any): Promise<string> {
    const query = `name = '${ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // Create root folder under My Drive
    const createRes = await drive.files.create({
      requestBody: {
        name: ROOT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id, name',
    });

    return createRes.data.id;
  },

  /**
   * Ensures the root folder "JCER ERP Bitwise Marks" exists and is not trashed
   */
  async ensureMarksRootFolder(drive: any, folderName = 'JCER ERP Bitwise Marks'): Promise<string> {
    const safeName = folderName.replace(/'/g, "\\'");
    const query = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // Create root folder under My Drive
    const createRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id, name',
    });

    return createRes.data.id;
  },

  /**
   * Finds or creates a subfolder strictly scoped under a parent folder ID
   */
  async findOrCreateSubfolder(drive: any, parentId: string, folderName: string): Promise<string> {
    if (!parentId) {
      throw new Error(`Cannot create or find subfolder "${folderName}" without a valid parent folder ID.`);
    }

    // Sanitize folder name quotes
    const safeName = folderName.replace(/'/g, "\\'");
    const query = `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const createRes = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id, name, parents',
    });

    return createRes.data.id;
  },

  /**
   * Ensures the five permanent default department folders exist directly under Root:
   * JCER ERP Attendance/
   *   ├── CSE/
   *   ├── CSE-AIML/
   *   ├── ECE/
   *   ├── ME/
   *   └── CV/
   * Idempotent: reuses existing folders without creating duplicates.
   * AS is explicitly NOT created here as one of the permanent folders.
   */
  async ensureDefaultDepartmentFolders(drive: any, rootFolderId: string): Promise<Record<string, string>> {
    if (!rootFolderId) {
      throw new Error('Root folder ID is required to ensure default department folders.');
    }

    const folderMap: Record<string, string> = {};
    for (const code of PERMANENT_ATTENDANCE_DEPARTMENT_CODES) {
      folderMap[code] = await this.findOrCreateSubfolder(drive, rootFolderId, code);
    }

    logger.info(`Verified 5 permanent department folders in Google Drive: ${Object.keys(folderMap).join(', ')}`);
    return folderMap;
  },

  /**
   * Safe, idempotent reconciliation method to ensure the Root folder and 5 default
   * department folders are present in Google Drive.
   */
  async reconcileAttendanceHierarchy(): Promise<{
    rootFolderId: string;
    departmentFolders: Record<string, string>;
  }> {
    const { drive, integration } = await this.getAuthorizedDriveClient();
    let rootId = integration.rootFolderId;
    if (!rootId) {
      rootId = await this.ensureRootFolder(drive);
      integration.rootFolderId = rootId;
      await integration.save();
    }

    const departmentFolders = await this.ensureDefaultDepartmentFolders(drive, rootId);
    return { rootFolderId: rootId, departmentFolders };
  },

  /**
   * Idempotently builds or locates full hierarchy with strict parent-child chaining:
   * JCER ERP Attendance -> [DeptCode] -> [AcademicYear] -> Semester [N] -> Section [X]
   *
   * DEPARTMENT ALWAYS PRECEDES ACADEMIC YEAR.
   * CSE and CSE-AIML are strictly separated.
   */
  async ensureFolderHierarchy(
    academicYear: string,
    departmentCode: string,
    semester: number,
    section: string
  ): Promise<string> {
    const { drive, integration } = await this.getAuthorizedDriveClient();

    let rootId = integration.rootFolderId;
    if (!rootId) {
      rootId = await this.ensureRootFolder(drive);
      integration.rootFolderId = rootId;
      await integration.save();
    }

    // 1. Department Folder directly under Root (Canonical Code: CSE, CSE-AIML, ECE, ME, CV, etc.)
    const cleanDept = resolveAttendanceDepartmentCode(departmentCode);
    const deptFolderId = await this.findOrCreateSubfolder(drive, rootId, cleanDept);

    // 2. Academic Year Folder inside Department (e.g. "2026-27")
    let cleanAY = academicYear.trim().replace(/\u2013|\u2014/g, '-');
    const ayMatch = cleanAY.match(/^(\d{4})-\d{2}(\d{2})$/);
    if (ayMatch) {
      cleanAY = `${ayMatch[1]}-${ayMatch[2]}`;
    }
    const ayFolderId = await this.findOrCreateSubfolder(drive, deptFolderId, cleanAY);

    // 3. Semester Folder inside Academic Year (e.g. "Semester 1", "Semester 3")
    const semFolderName = `Semester ${semester}`;
    const semFolderId = await this.findOrCreateSubfolder(drive, ayFolderId, semFolderName);

    // 4. Section Folder inside Semester (e.g. "Section A", "Section B")
    const cleanSec = section.replace(/^Section\s+/i, '').trim() || 'A';
    const secFolderName = `Section ${cleanSec}`;
    const secFolderId = await this.findOrCreateSubfolder(drive, semFolderId, secFolderName);

    return secFolderId;
  },

  /**
   * Idempotently builds or locates Semester folder directly under Department -> Academic Year:
   * JCER ERP Attendance -> [DeptCode] -> [AcademicYear] -> Semester [N]
   *
   * DEPARTMENT ALWAYS PRECEDES ACADEMIC YEAR.
   */
  async ensureSemesterFolderHierarchy(
    academicYear: string,
    departmentCode: string,
    semester: number
  ): Promise<string> {
    const { drive, integration } = await this.getAuthorizedDriveClient();

    let rootId = integration.rootFolderId;
    if (!rootId) {
      rootId = await this.ensureRootFolder(drive);
      integration.rootFolderId = rootId;
      await integration.save();
    }

    // 1. Department Folder directly under Root (Canonical Code: CSE, CSE-AIML, ECE, ME, CV, etc.)
    const cleanDept = resolveAttendanceDepartmentCode(departmentCode);
    const deptFolderId = await this.findOrCreateSubfolder(drive, rootId, cleanDept);

    // 2. Academic Year Folder inside Department (e.g. "2026-27")
    let cleanAY = academicYear.trim().replace(/\u2013|\u2014/g, '-');
    const ayMatch = cleanAY.match(/^(\d{4})-\d{2}(\d{2})$/);
    if (ayMatch) {
      cleanAY = `${ayMatch[1]}-${ayMatch[2]}`;
    }
    const ayFolderId = await this.findOrCreateSubfolder(drive, deptFolderId, cleanAY);

    // 3. Semester Folder inside Academic Year (e.g. "Semester 1", "Semester 3")
    const semFolderName = `Semester ${semester}`;
    const semFolderId = await this.findOrCreateSubfolder(drive, ayFolderId, semFolderName);

    return semFolderId;
  },

  /**
   * Safe, idempotent reconciliation method to ensure the Root folder "JCER ERP Bitwise Marks"
   * and permanent department folders are present in Google Drive, and any legacy inverted
   * folders (e.g. 2026-27 -> CV -> Semester 1) are migrated to Department-first.
   */
  async reconcileMarksHierarchy(): Promise<{
    rootFolderId: string;
    departmentFolders: Record<string, string>;
  }> {
    const { drive } = await this.getAuthorizedDriveClient();
    const marksRootFolderId = await this.ensureMarksRootFolder(drive, 'JCER ERP Bitwise Marks');
    const departmentFolders = await this.ensureDefaultDepartmentFolders(drive, marksRootFolderId);
    await this.cleanupLegacyMarksHierarchy(drive, marksRootFolderId);
    return { rootFolderId: marksRootFolderId, departmentFolders };
  },

  /**
   * Cleans up and migrates any legacy inverted folders (e.g. Root -> "2026-27" -> "CV" -> "Semester 1")
   * into the standard Attendance-aligned hierarchy:
   * JCER ERP Bitwise Marks -> [DeptCode] (CV) -> [AcademicYear] (2026-27) -> Semester [N] (Semester 1)
   */
  async cleanupLegacyMarksHierarchy(drive: any, marksRootFolderId: string): Promise<void> {
    try {
      // Find all direct folder children under marksRootFolderId
      const res = await drive.files.list({
        q: `'${marksRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      const folders = res.data.files || [];
      for (const folder of folders) {
        const folderName = folder.name?.trim() || '';
        // Detect if folder name is an Academic Year (e.g. "2026-27", "2025-2026", "2024–25")
        if (/^\d{4}[-–—]\d{2,4}$/.test(folderName)) {
          logger.info(`Detected legacy academic year folder "${folderName}" directly under Bitwise Marks root. Migrating to Department-first structure...`);

          let cleanAY = folderName.replace(/\u2013|\u2014/g, '-');
          const ayMatch = cleanAY.match(/^(\d{4})-\d{2}(\d{2})$/);
          if (ayMatch) {
            cleanAY = `${ayMatch[1]}-${ayMatch[2]}`;
          }

          // List contents of this legacy AY folder
          const subRes = await drive.files.list({
            q: `'${folder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            spaces: 'drive',
          });

          for (const deptItem of subRes.data.files || []) {
            if (deptItem.mimeType === 'application/vnd.google-apps.folder') {
              const cleanDept = resolveAttendanceDepartmentCode(deptItem.name);
              // Ensure Root -> DeptCode
              const targetDeptFolderId = await this.findOrCreateSubfolder(drive, marksRootFolderId, cleanDept);
              // Ensure Root -> DeptCode -> AcademicYear
              const targetAyFolderId = await this.findOrCreateSubfolder(drive, targetDeptFolderId, cleanAY);

              // List contents of this legacy dept folder (e.g. "Semester 1" folders)
              const deptSubRes = await drive.files.list({
                q: `'${deptItem.id}' in parents and trashed = false`,
                fields: 'files(id, name, mimeType)',
                spaces: 'drive',
              });

              for (const semItem of deptSubRes.data.files || []) {
                if (semItem.mimeType === 'application/vnd.google-apps.folder') {
                  // Ensure Root -> DeptCode -> AcademicYear -> Semester [N]
                  const targetSemFolderId = await this.findOrCreateSubfolder(drive, targetAyFolderId, semItem.name);

                  // Move any files inside the legacy semester folder to the new semester folder
                  const filesRes = await drive.files.list({
                    q: `'${semItem.id}' in parents and trashed = false`,
                    fields: 'files(id, name)',
                    spaces: 'drive',
                  });

                  for (const file of filesRes.data.files || []) {
                    try {
                      await drive.files.update({
                        fileId: file.id,
                        addParents: targetSemFolderId,
                        removeParents: semItem.id,
                        fields: 'id, parents',
                      });
                      logger.info(`Migrated marks file "${file.name}" to new Semester folder (${targetSemFolderId})`);

                      // Update MarksBackupFile in DB if present
                      await MarksBackupFile.update(
                        { googleDriveFolderId: targetSemFolderId },
                        { where: { googleDriveFileId: file.id } }
                      );
                    } catch (moveErr: any) {
                      logger.warn(`Failed moving file "${file.name}":`, moveErr.message);
                    }
                  }

                  // Trash old semester folder
                  try {
                    await drive.files.update({
                      fileId: semItem.id,
                      requestBody: { trashed: true },
                    });
                  } catch (tErr: any) {
                    logger.warn(`Failed trashing legacy sem folder "${semItem.name}":`, tErr.message);
                  }
                } else {
                  // Direct file under dept folder
                  try {
                    await drive.files.update({
                      fileId: semItem.id,
                      addParents: targetAyFolderId,
                      removeParents: deptItem.id,
                      fields: 'id, parents',
                    });
                  } catch (moveErr: any) {
                    logger.warn(`Failed moving file "${semItem.name}":`, moveErr.message);
                  }
                }
              }

              // Trash old dept folder
              try {
                await drive.files.update({
                  fileId: deptItem.id,
                  requestBody: { trashed: true },
                });
              } catch (tErr: any) {
                logger.warn(`Failed trashing legacy dept folder "${deptItem.name}":`, tErr.message);
              }
            }
          }

          // Trash the legacy academic year folder itself
          try {
            await drive.files.update({
              fileId: folder.id,
              requestBody: { trashed: true },
            });
            logger.info(`Successfully trashed legacy AY folder "${folder.name}" (${folder.id})`);
          } catch (tErr: any) {
            logger.warn(`Failed trashing legacy folder "${folder.name}":`, tErr.message);
          }
        }
      }
    } catch (err: any) {
      logger.warn('Error during legacy Bitwise Marks hierarchy cleanup:', err.message);
    }
  },

  /**
   * Idempotently builds or locates Semester folder directly under Department -> Academic Year for Bitwise Marks:
   * JCER ERP Bitwise Marks -> [DeptCode] -> [AcademicYear] -> Semester [N]
   *
   * DEPARTMENT ALWAYS PRECEDES ACADEMIC YEAR (Matching Attendance structure).
   */
  async ensureMarksSemesterFolderHierarchy(
    academicYear: string,
    departmentCode: string,
    semester: number
  ): Promise<string> {
    const { drive } = await this.getAuthorizedDriveClient();
    const marksRootFolderId = await this.ensureMarksRootFolder(drive, 'JCER ERP Bitwise Marks');

    // 1. Ensure 5 default department folders exist under Root
    await this.ensureDefaultDepartmentFolders(drive, marksRootFolderId);

    // 2. Clean up any legacy inverted folders (e.g. Root -> 2026-27 -> CV -> Semester 1)
    await this.cleanupLegacyMarksHierarchy(drive, marksRootFolderId);

    // 3. Department Folder directly under Root (Canonical Code: CSE, CSE-AIML, ECE, ME, CV, etc.)
    const cleanDept = resolveAttendanceDepartmentCode(departmentCode);
    const deptFolderId = await this.findOrCreateSubfolder(drive, marksRootFolderId, cleanDept);

    // 4. Academic Year Folder inside Department (e.g. "2026-27")
    let cleanAY = academicYear.trim().replace(/\u2013|\u2014/g, '-');
    const ayMatch = cleanAY.match(/^(\d{4})-\d{2}(\d{2})$/);
    if (ayMatch) {
      cleanAY = `${ayMatch[1]}-${ayMatch[2]}`;
    }
    const ayFolderId = await this.findOrCreateSubfolder(drive, deptFolderId, cleanAY);

    // 5. Semester Folder inside Academic Year (e.g. "Semester 1", "Semester 3")
    const semFolderName = `Semester ${semester}`;
    const semFolderId = await this.findOrCreateSubfolder(drive, ayFolderId, semFolderName);

    return semFolderId;
  },

  /**
   * Uploads new or updates existing Consolidated Semester Excel workbook directly inside the Semester folder
   */
  async uploadOrUpdateConsolidatedWorkbook(
    semesterFolderId: string,
    fileName: string,
    fileBuffer: Buffer,
    existingDriveFileId?: string | null
  ): Promise<string> {
    const { drive } = await this.getAuthorizedDriveClient();

    const media = {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: Readable.from(fileBuffer),
    };

    // 1. If explicit existing Drive file ID provided, attempt update and verify parent
    if (existingDriveFileId) {
      try {
        const fileMeta = await drive.files.get({
          fileId: existingDriveFileId,
          fields: 'id, name, parents, trashed',
        });

        if (fileMeta.data && !fileMeta.data.trashed) {
          const currentParents = fileMeta.data.parents || [];
          const updateParams: any = {
            fileId: existingDriveFileId,
            requestBody: {
              name: fileName,
            },
            media,
            fields: 'id, name, parents, modifiedTime',
          };

          // Re-parent file into target Semester folder if not already there
          if (!currentParents.includes(semesterFolderId)) {
            updateParams.addParents = semesterFolderId;
            if (currentParents.length > 0) {
              updateParams.removeParents = currentParents.join(',');
            }
          }

          const updateRes = await drive.files.update(updateParams);
          return updateRes.data.id!;
        }
      } catch (err: any) {
        logger.warn(`Google Drive update failed for consolidated fileId ${existingDriveFileId}. Will check folder:`, err.message);
      }
    }

    // 2. Check if a file with same name already exists in target Semester folder
    const safeName = fileName.replace(/'/g, "\\'");
    const query = `'${semesterFolderId}' in parents and name = '${safeName}' and trashed = false`;
    const searchRes = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      const foundId = searchRes.data.files[0].id!;
      const updateRes = await drive.files.update({
        fileId: foundId,
        media,
        fields: 'id, name, parents, modifiedTime',
      });
      return updateRes.data.id!;
    }

    // 3. Create new workbook file directly under Semester folder
    const createRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [semesterFolderId],
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      media,
      fields: 'id, name, parents, modifiedTime',
    });

    return createRes.data.id!;
  },

  /**
   * Uploads new or updates existing Excel workbook strictly within the target Section folder
   */
  async uploadOrUpdateAttendanceWorkbook(
    folderId: string,
    fileName: string,
    fileBuffer: Buffer,
    existingDriveFileId?: string | null
  ): Promise<string> {
    const { drive } = await this.getAuthorizedDriveClient();

    const media = {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body: Readable.from(fileBuffer),
    };

    // 1. If explicit existing Drive file ID provided, attempt update and verify parent
    if (existingDriveFileId) {
      try {
        const fileMeta = await drive.files.get({
          fileId: existingDriveFileId,
          fields: 'id, name, parents, trashed',
        });

        if (fileMeta.data && !fileMeta.data.trashed) {
          const currentParents = fileMeta.data.parents || [];
          const updateParams: any = {
            fileId: existingDriveFileId,
            requestBody: {
              name: fileName,
            },
            media,
            fields: 'id, name, parents, modifiedTime',
          };

          // Re-parent file into target Section folder if not already there
          if (!currentParents.includes(folderId)) {
            updateParams.addParents = folderId;
            if (currentParents.length > 0) {
              updateParams.removeParents = currentParents.join(',');
            }
          }

          const updateRes = await drive.files.update(updateParams);
          return updateRes.data.id!;
        }
      } catch (err: any) {
        logger.warn(`Google Drive update failed for fileId ${existingDriveFileId}. Will check folder:`, err.message);
      }
    }

    // 2. Check if a file with same name already exists in target Section folder
    const safeName = fileName.replace(/'/g, "\\'");
    const query = `'${folderId}' in parents and name = '${safeName}' and trashed = false`;
    const searchRes = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents)',
      spaces: 'drive',
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
      const foundId = searchRes.data.files[0].id!;
      const updateRes = await drive.files.update({
        fileId: foundId,
        media,
        fields: 'id, name, parents, modifiedTime',
      });
      return updateRes.data.id!;
    }

    // 3. Create new workbook file strictly under Section folderId
    const createRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      media,
      fields: 'id, name, parents, modifiedTime',
    });

    return createRes.data.id!;
  },

  /**
   * Returns Google Drive connection status and sync metrics
   */
  async getIntegrationStatus() {
    const integration = await GoogleDriveIntegration.findOne({
      order: [['createdAt', 'ASC']],
      include: [{ model: User, as: 'connectedBy', attributes: ['id', 'firstName', 'lastName', 'email'] }],
    });

    const pendingJobsCount = await AttendanceBackupJob.count({
      where: { status: 'PENDING' },
    });

    const failedJobsCount = await AttendanceBackupJob.count({
      where: { status: 'FAILED' },
    });

    const totalSyncedFilesCount = await AttendanceBackupFile.count({
      where: { status: 'SYNCED' },
    });

    const recentJobs = await AttendanceBackupJob.findAll({
      order: [['updatedAt', 'DESC']],
      limit: 10,
    });

    const hasValidToken = Boolean(
      integration &&
      integration.status === 'CONNECTED' &&
      integration.encryptedRefreshToken &&
      integration.encryptedRefreshToken.trim() !== ''
    );

    const isConnected = hasValidToken;
    let effectiveStatus: 'CONNECTED' | 'NOT_CONNECTED' | 'ERROR' = 'NOT_CONNECTED';
    if (isConnected) {
      effectiveStatus = integration?.lastError ? 'ERROR' : 'CONNECTED';
    }

    const accountEmail = isConnected ? (integration?.accountEmail || null) : null;
    const accountName = isConnected ? (integration?.accountName || null) : null;
    const rootFolderName = isConnected ? (integration?.rootFolderName || 'JCER ERP Attendance') : 'JCER ERP Attendance';
    const rootFolderId = isConnected ? (integration?.rootFolderId || null) : null;
    const autoBackupEnabled = isConnected ? Boolean(integration?.autoBackupEnabled) : false;
    const lastSyncAt = isConnected ? (integration?.lastSyncAt || null) : null;
    const lastError = isConnected ? (integration?.lastError || null) : null;

    const numSyncedFiles = Number(totalSyncedFilesCount) || 0;
    const numPending = Number(pendingJobsCount) || 0;
    const numFailed = Number(failedJobsCount) || 0;

    return {
      connected: isConnected,
      isConnected,
      status: effectiveStatus,
      accountEmail,
      googleAccountEmail: accountEmail,
      accountName,
      rootFolder: rootFolderName,
      rootFolderName,
      rootFolderId,
      autoBackupEnabled,
      lastSuccessfulSync: lastSyncAt,
      lastSyncAt,
      lastError,
      connectedBy: isConnected && integration?.connectedBy
        ? `${(integration as any).connectedBy.firstName || ''} ${(integration as any).connectedBy.lastName || ''}`.trim() || (integration as any).connectedBy.email
        : null,
      activeWorkbooks: numSyncedFiles,
      totalSyncedFiles: numSyncedFiles,
      pendingBackups: numPending,
      failedBackups: numFailed,
      pendingJobsCount: numPending,
      failedJobsCount: numFailed,
      stats: {
        activeWorkbooks: numSyncedFiles,
        totalSyncedFiles: numSyncedFiles,
        pendingBackups: numPending,
        failedBackups: numFailed,
      },
      recentJobs: recentJobs.map((j) => ({
        id: j.id,
        action: j.action,
        status: j.status,
        attemptCount: Number(j.attemptCount) || 0,
        lastAttemptAt: j.lastAttemptAt,
        errorMessage: j.errorMessage,
        completedAt: j.completedAt,
        createdAt: j.createdAt,
      })),
    };
  },

  /**
   * Tests active Google Drive connection and verifies root folder access
   */
  async testConnection(): Promise<{ success: boolean; message: string; rootFolderId?: string; accountEmail?: string }> {
    try {
      const { drive, integration } = await this.getAuthorizedDriveClient();

      const rootFolderId = await this.ensureRootFolder(drive);
      integration.rootFolderId = rootFolderId;
      integration.lastSyncAt = new Date();
      integration.lastError = null;
      integration.status = 'CONNECTED';
      await integration.save();

      // Ensure 5 permanent default department folders exist under Root
      await this.ensureDefaultDepartmentFolders(drive, rootFolderId);

      return {
        success: true,
        message: `Google Drive connection verified! Connected account: ${integration.accountEmail}, Root folder: "${ROOT_FOLDER_NAME}".`,
        rootFolderId,
        accountEmail: integration.accountEmail,
      };
    } catch (err: any) {
      const integration = await GoogleDriveIntegration.findOne();
      if (integration) {
        integration.lastError = err.message || 'Connection test failed';
        await integration.save();
      }
      return {
        success: false,
        message: err.message || 'Failed to authenticate with Google Drive API.',
      };
    }
  },

  /**
   * Disconnects Google Drive without deleting historical backups
   */
  async disconnect(): Promise<void> {
    const integration = await GoogleDriveIntegration.findOne();
    if (integration) {
      integration.status = 'DISCONNECTED';
      integration.accessToken = null;
      integration.encryptedRefreshToken = '';
      integration.lastError = null;
      await integration.save();
    }
    logger.info('Google Drive disconnected by administrator.');
  },

  /**
   * Toggles automatic backup on/off
   */
  async toggleAutoBackup(enabled: boolean): Promise<boolean> {
    const integration = await GoogleDriveIntegration.findOne();
    if (integration) {
      integration.autoBackupEnabled = enabled;
      await integration.save();
      return enabled;
    }
    return false;
  },

  /**
   * Checks if a Google Drive file exists and is not trashed
   */
  async checkFileExists(fileId: string): Promise<boolean> {
    if (!fileId) return false;
    try {
      const { drive } = await this.getAuthorizedDriveClient();
      const res = await drive.files.get({
        fileId,
        fields: 'id, name, trashed',
      });
      return Boolean(res.data && !res.data.trashed);
    } catch (err: any) {
      if (err.status === 404 || err.code === 404 || err.message?.includes('File not found')) {
        return false;
      }
      logger.warn(`Error checking file existence in Google Drive (${fileId}):`, err.message);
      return false;
    }
  },

  /**
   * Permanently deletes a file from Google Drive idempotently
   * If the file is already deleted or 404, returns true safely.
   */
  async deleteFile(fileId: string): Promise<boolean> {
    if (!fileId) return false;
    try {
      const { drive } = await this.getAuthorizedDriveClient();
      await drive.files.delete({ fileId });
      logger.info(`Google Drive file ${fileId} successfully deleted.`);
      return true;
    } catch (err: any) {
      if (err.status === 404 || err.code === 404 || err.message?.includes('File not found')) {
        logger.info(`Google Drive file ${fileId} already absent / not found (404), treated as deleted.`);
        return true;
      }
      logger.error(`Failed to delete Google Drive file ${fileId}:`, err.message);
      throw err;
    }
  },

  /**
   * Downloads a binary file buffer directly from Google Drive
   */
  async downloadFileBuffer(fileId: string): Promise<Buffer> {
    if (!fileId) throw new Error('File ID is required to download from Google Drive.');
    const { drive } = await this.getAuthorizedDriveClient();
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data as ArrayBuffer);
  },

  /**
   * Retrieves full file metadata from Google Drive
   */
  async getFileMetadata(fileId: string): Promise<any> {
    if (!fileId) throw new Error('File ID is required to fetch metadata.');
    const { drive } = await this.getAuthorizedDriveClient();
    const res = await drive.files.get({
      fileId,
      fields: 'id, name, modifiedTime, version, md5Checksum, size, trashed',
    });
    return res.data;
  },
};

export default googleDriveService;

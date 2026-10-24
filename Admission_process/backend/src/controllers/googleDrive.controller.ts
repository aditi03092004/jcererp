import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import googleDriveService from '../services/googleDrive.service';
import attendanceBackupQueueService from '../services/attendanceBackupQueue.service';
import logger from '../utils/logger.util';

/**
 * Controller managing Google Drive integration & Attendance Backup workflows
 */

/**
 * GET /api/google/oauth
 * Generates OAuth URL and redirects Dean to Google Consent Screen
 */
export const initiateOAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const userId = req.user?.id || (req.query.userId as string);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Session missing.' });
    }

    const authUrl = googleDriveService.generateAuthUrl(userId);

    // If request asks for JSON response, return the URL
    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.json({ success: true, authUrl });
    }

    // Otherwise directly redirect the Dean to Google
    return res.redirect(authUrl);
  } catch (error: any) {
    logger.error('GOOGLE_DRIVE_INITIATE_OAUTH_ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate Google OAuth.' });
  }
};

/**
 * GET /api/google/oauth/callback
 * Handles Google OAuth callback redirect from Google Cloud
 */
export const handleOAuthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    const defaultFrontend = process.env.NODE_ENV === 'production' ? 'https://jcererp.pages.dev' : 'http://localhost:5173';
    const frontendBaseUrl = process.env.FRONTEND_URL || defaultFrontend;
    const settingsUrl = `${frontendBaseUrl}/dean/settings/google-drive`;

    if (error) {
      logger.warn(`Google OAuth callback received error: ${error}`);
      return res.redirect(`${settingsUrl}?status=error&message=${encodeURIComponent(`Google authorization was denied: ${error}`)}`);
    }

    if (!code || !state) {
      logger.warn('Google OAuth callback missing code or state.');
      return res.redirect(`${settingsUrl}?status=error&message=${encodeURIComponent('Invalid OAuth callback response from Google.')}`);
    }

    const integration = await googleDriveService.handleOAuthCallback(code, state);

    logger.info(`Google Drive successfully connected for account: ${integration.accountEmail}`);
    return res.redirect(`${settingsUrl}?status=success&email=${encodeURIComponent(integration.accountEmail || '')}`);
  } catch (error: any) {
    logger.error('GOOGLE_DRIVE_OAUTH_CALLBACK_ERROR:', error);
    const defaultFrontend = process.env.NODE_ENV === 'production' ? 'https://jcererp.pages.dev' : 'http://localhost:5173';
    const frontendBaseUrl = process.env.FRONTEND_URL || defaultFrontend;
    const settingsUrl = `${frontendBaseUrl}/dean/settings/google-drive`;
    return res.redirect(`${settingsUrl}?status=error&message=${encodeURIComponent(error.message || 'Failed to connect Google Drive.')}`);
  }
};

/**
 * GET /api/google-drive/status
 * Retrieves current integration connection status and backup metrics
 */
export const getStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const status = await googleDriveService.getIntegrationStatus();
    return res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    logger.error('GET_GOOGLE_DRIVE_STATUS_ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to get Google Drive status.' });
  }
};

/**
 * POST /api/google-drive/test-connection
 * Tests Google Drive API token and verifies root folder access
 */
export const testConnection = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const result = await googleDriveService.testConnection();
    return res.json(result);
  } catch (error: any) {
    logger.error('TEST_GOOGLE_DRIVE_CONNECTION_ERROR:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Google Drive connection test failed.',
    });
  }
};

/**
 * POST /api/google-drive/disconnect
 * Disconnects Google Drive integration without deleting backup data
 */
export const disconnect = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    await googleDriveService.disconnect();

    return res.json({
      success: true,
      message: 'Google Drive disconnected successfully. Existing backup files in Google Drive and history remain intact.',
    });
  } catch (error: any) {
    logger.error('DISCONNECT_GOOGLE_DRIVE_ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to disconnect Google Drive.' });
  }
};

/**
 * POST /api/google-drive/toggle-auto-backup
 * Enables or disables automatic Google Drive backup
 */
export const toggleAutoBackup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Field "enabled" must be a boolean.' });
    }

    const isAutoBackup = await googleDriveService.toggleAutoBackup(enabled);
    return res.json({
      success: true,
      message: `Automatic Google Drive backup has been ${isAutoBackup ? 'enabled' : 'disabled'}.`,
      data: {
        autoBackupEnabled: isAutoBackup,
      },
    });
  } catch (error: any) {
    logger.error('TOGGLE_GOOGLE_DRIVE_AUTO_BACKUP_ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to update auto backup setting.' });
  }
};

/**
 * POST /api/google-drive/retry-failed
 * Manually retries any failed backup jobs
 */
export const retryFailedBackups = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { retriedCount } = await attendanceBackupQueueService.retryAllFailedJobs();
    return res.json({
      success: true,
      message: `Queued ${retriedCount} failed backup job(s) for immediate retry.`,
      data: { retriedCount },
    });
  } catch (error: any) {
    logger.error('RETRY_FAILED_BACKUPS_ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to retry backup jobs.' });
  }
};

/**
 * POST /api/google-drive/backup-subject/:assignmentId
 * Queues an immediate backup job for an assignment
 */
export const triggerSubjectBackup = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const assignmentId = req.params.assignmentId;
    if (!assignmentId) {
      return res.status(400).json({ error: 'Assignment ID is required.' });
    }

    const job = await attendanceBackupQueueService.queueAttendanceBackup(assignmentId, undefined, 'CREATE');
    if (!job) {
      return res.status(400).json({
        success: false,
        error: 'Google Drive backup is currently disabled or not connected.',
      });
    }

    return res.json({
      success: true,
      message: 'Backup job queued successfully.',
      data: { jobId: job.id, status: job.status },
    });
  } catch (error: any) {
    logger.error('TRIGGER_SUBJECT_BACKUP_ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to queue subject backup.' });
  }
};

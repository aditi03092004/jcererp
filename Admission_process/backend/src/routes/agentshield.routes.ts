import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/rbac.middleware';
import * as agentShieldCtrl from '../controllers/agentshield.controller';

const router = Router();

// Memory storage for OWASP ZAP scan reports
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json') || file.originalname.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JSON or XML scan reports are supported.'));
    }
  },
});

// Guard all AgentShield administrative APIs with strict RBAC: Only CYBERADMIN and SUPER_ADMIN
const requireCyberAdmin = [authMiddleware, authorizeRoles('CYBERADMIN', 'SUPER_ADMIN')];

// ── 1. Security Overview & Health ──
router.get('/overview', requireCyberAdmin, agentShieldCtrl.getOverview);
router.get('/analytics', requireCyberAdmin, agentShieldCtrl.getAnalytics);
router.get('/health', requireCyberAdmin, agentShieldCtrl.getHealthDiagnostics);

// ── 2. Security Events ──
router.get('/events', requireCyberAdmin, agentShieldCtrl.getEvents);

// ── 3. Security Incidents ──
router.get('/incidents', requireCyberAdmin, agentShieldCtrl.getIncidents);
router.get('/incidents/:id', requireCyberAdmin, agentShieldCtrl.getIncidentById);
router.patch('/incidents/:id/status', requireCyberAdmin, agentShieldCtrl.updateIncidentStatus);
router.post('/incidents/:id/notes', requireCyberAdmin, agentShieldCtrl.addIncidentNote);
router.post('/incidents/:id/resend-notification', requireCyberAdmin, agentShieldCtrl.resendIncidentNotification);

// ── 4. Blocked Requests & Protective Actions ──
router.get('/blocked-requests', requireCyberAdmin, agentShieldCtrl.getBlockedRequests);
router.post('/lift-restriction', requireCyberAdmin, agentShieldCtrl.liftRestriction);

// ── 5. Detection Rules Management ──
router.get('/rules', requireCyberAdmin, agentShieldCtrl.getRules);
router.put('/rules/:id', requireCyberAdmin, agentShieldCtrl.updateRule);

// ── 6. OWASP ZAP Security Assessments ──
router.get('/assessments', requireCyberAdmin, agentShieldCtrl.getAssessments);
router.get('/assessments/:id', requireCyberAdmin, agentShieldCtrl.getAssessmentById);
router.post('/assessments/import', requireCyberAdmin, upload.single('report'), agentShieldCtrl.importZapReport);
router.patch('/findings/:id/status', requireCyberAdmin, agentShieldCtrl.updateFindingStatus);

// ── 7. Security Audit Logs ──
router.get('/audit-logs', requireCyberAdmin, agentShieldCtrl.getAuditLogs);

export default router;

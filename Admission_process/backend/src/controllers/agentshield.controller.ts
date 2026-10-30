import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import SecurityEvent from '../models/agentshield/SecurityEvent';
import SecurityIncident, { IncidentStatus, IncidentSeverity } from '../models/agentshield/SecurityIncident';
import DetectionRule from '../models/agentshield/DetectionRule';
import SecurityAssessment from '../models/agentshield/SecurityAssessment';
import SecurityFinding from '../models/agentshield/SecurityFinding';
import SecurityAuditLog from '../models/agentshield/SecurityAuditLog';
import agentShieldEngine from '../services/agentshield/engine.service';
import rulesService from '../services/agentshield/rules.service';
import responseService from '../services/agentshield/response.service';
import zapParserService from '../services/agentshield/zapParser.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * 1. Security Overview Dashboard Metrics
 */
export const getOverview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const metrics = await agentShieldEngine.getOverviewMetrics();
    return res.json({ success: true, data: metrics });
  } catch (err) {
    return next(err);
  }
};

/**
 * 2. Paginated Security Events
 */
export const getEvents = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const where: any = {};
    if (req.query.riskLevel) where.riskLevel = req.query.riskLevel;
    if (req.query.category) where.category = req.query.category;
    if (req.query.ruleId) where.ruleId = req.query.ruleId;
    if (req.query.search) {
      where[Op.or] = [
        { route: { [Op.iLike]: `%${req.query.search}%` } },
        { clientIp: { [Op.iLike]: `%${req.query.search}%` } },
        { correlationId: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const { rows, count } = await SecurityEvent.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * 3. Paginated Security Incidents
 */
export const getIncidents = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.severity) where.severity = req.query.severity;
    if (req.query.category) where.category = req.query.category;
    if (req.query.search) {
      where[Op.or] = [
        { incidentNumber: { [Op.iLike]: `%${req.query.search}%` } },
        { title: { [Op.iLike]: `%${req.query.search}%` } },
        { sourceIdentifier: { [Op.iLike]: `%${req.query.search}%` } },
        { targetResource: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const { rows, count } = await SecurityIncident.findAndCountAll({
      where,
      order: [['lastObservedAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * 4. Single Incident Details with Supporting Events
 */
export const getIncidentById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const incident = await SecurityIncident.findByPk(id, {
      include: [
        {
          model: SecurityEvent,
          as: 'events',
          limit: 50,
          order: [['timestamp', 'DESC']],
        },
      ],
    });

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Security incident not found.' });
    }

    return res.json({ success: true, data: incident });
  } catch (err) {
    return next(err);
  }
};

/**
 * 5. Update Incident Lifecycle Status
 */
export const updateIncidentStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const { status, resolutionSummary } = req.body;

    const validStatuses: IncidentStatus[] = ['NEW', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const incident = await SecurityIncident.findByPk(id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Security incident not found.' });
    }

    const previousState = { status: incident.status, resolutionSummary: incident.resolutionSummary };
    incident.status = status;

    if (status === 'RESOLVED') {
      incident.resolvedAt = new Date();
      incident.resolvedBy = req.user?.email || 'CyberAdmin';
      if (resolutionSummary) incident.resolutionSummary = resolutionSummary.trim();
    } else {
      incident.resolvedAt = null;
      incident.resolvedBy = null;
    }

    await incident.save();

    // Record in Security Audit Log
    await SecurityAuditLog.create({
      actorId: req.user!.id,
      actorEmail: req.user!.email || 'cyberadmin@jcer.edu',
      action: 'UPDATE_INCIDENT_STATUS',
      targetType: 'INCIDENT',
      targetId: incident.id,
      previousState,
      newState: { status: incident.status, resolutionSummary: incident.resolutionSummary },
      ipAddress: req.ip || null,
      timestamp: new Date(),
      details: { incidentNumber: incident.incidentNumber },
    }).catch(() => {});

    return res.json({ success: true, data: incident, message: `Incident ${incident.incidentNumber} marked as ${status}.` });
  } catch (err) {
    return next(err);
  }
};

/**
 * 6. Add Investigation Note to Incident
 */
export const addIncidentNote = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ success: false, error: 'Investigation note text is required.' });
    }

    const incident = await SecurityIncident.findByPk(id);
    if (!incident) {
      return res.status(404).json({ success: false, error: 'Security incident not found.' });
    }

    const noteObj = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      author: `${req.user?.firstName || 'Cyber'} ${req.user?.lastName || 'Admin'}`,
      authorEmail: req.user?.email || 'cyberadmin@jcer.edu',
      note: note.trim(),
      timestamp: new Date().toISOString(),
    };

    const notes = Array.isArray(incident.investigationNotes) ? [...incident.investigationNotes, noteObj] : [noteObj];
    incident.investigationNotes = notes;
    await incident.save();

    await SecurityAuditLog.create({
      actorId: req.user!.id,
      actorEmail: req.user!.email || 'cyberadmin@jcer.edu',
      action: 'ADD_INVESTIGATION_NOTE',
      targetType: 'INCIDENT',
      targetId: incident.id,
      previousState: null,
      newState: { noteId: noteObj.id },
      ipAddress: req.ip || null,
      timestamp: new Date(),
      details: { incidentNumber: incident.incidentNumber },
    }).catch(() => {});

    return res.status(201).json({ success: true, data: noteObj, incident });
  } catch (err) {
    return next(err);
  }
};

/**
 * 7. Blocked & Restricted Requests
 */
export const getBlockedRequests = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const activeRestrictions = responseService.getActiveRestrictions();
    const recentBlockedEvents = await SecurityEvent.findAll({
      where: {
        responseAction: { [Op.in]: ['RATE_LIMITED', 'BLOCKED', 'HONEYPOT_TRIGGER'] },
      },
      order: [['timestamp', 'DESC']],
      limit: 50,
    });

    return res.json({
      success: true,
      data: {
        activeRestrictions,
        recentBlockedEvents,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * 8. Lift Active IP Restriction
 */
export const liftRestriction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { clientIp } = req.body;
    if (!clientIp) {
      return res.status(400).json({ success: false, error: 'clientIp is required.' });
    }

    const lifted = await responseService.liftRestriction(clientIp, {
      id: req.user!.id,
      email: req.user!.email || 'cyberadmin@jcer.edu',
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: lifted ? `Restriction on ${clientIp} lifted successfully.` : `No active restriction found for ${clientIp}.`,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * 9. Detection Rules Management
 */
export const getRules = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const rules = await rulesService.getAllRules();
    return res.json({ success: true, data: rules });
  } catch (err) {
    return next(err);
  }
};

export const updateRule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const rule = await rulesService.updateRule(id, req.body, {
      id: req.user!.id,
      email: req.user!.email || 'cyberadmin@jcer.edu',
      ipAddress: req.ip,
    });

    return res.json({ success: true, data: rule, message: `Detection rule '${rule.name}' updated successfully.` });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to update rule.' });
  }
};

/**
 * 10. OWASP ZAP Assessments & Findings
 */
export const getAssessments = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const assessments = await SecurityAssessment.findAll({
      order: [['scanDate', 'DESC']],
    });
    return res.json({ success: true, data: assessments });
  } catch (err) {
    return next(err);
  }
};

export const getAssessmentById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const assessment = await SecurityAssessment.findByPk(id);
    if (!assessment) {
      return res.status(404).json({ success: false, error: 'Assessment not found.' });
    }

    const findings = await SecurityFinding.findAll({
      where: { assessmentId: id },
      order: [
        ['risk', 'ASC'], // HIGH first, then MEDIUM, LOW
        ['alert', 'ASC'],
      ],
    });

    return res.json({ success: true, data: { assessment, findings } });
  } catch (err) {
    return next(err);
  }
};

export const importZapReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No report file uploaded. Please provide a JSON report file.' });
    }

    const customTitle = req.body.title ? String(req.body.title).trim() : undefined;
    const assessment = await zapParserService.importZapReport(
      req.file.buffer,
      req.file.originalname,
      {
        id: req.user!.id,
        email: req.user!.email || 'cyberadmin@jcer.edu',
        ipAddress: req.ip,
      },
      customTitle
    );

    return res.status(201).json({
      success: true,
      data: assessment,
      message: `Successfully imported OWASP ZAP report with ${assessment.totalFindings} findings.`,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || 'Failed to import report.' });
  }
};

export const updateFindingStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const { status, remediationNotes } = req.body;

    const finding = await SecurityFinding.findByPk(id);
    if (!finding) {
      return res.status(404).json({ success: false, error: 'Finding not found.' });
    }

    const previousState = { status: finding.status, remediationNotes: finding.remediationNotes };
    if (status) finding.status = status;
    if (remediationNotes !== undefined) finding.remediationNotes = remediationNotes;
    finding.updatedBy = req.user?.email || 'CyberAdmin';
    await finding.save();

    await SecurityAuditLog.create({
      actorId: req.user!.id,
      actorEmail: req.user!.email || 'cyberadmin@jcer.edu',
      action: 'UPDATE_FINDING_STATUS',
      targetType: 'FINDING',
      targetId: finding.id,
      previousState,
      newState: { status: finding.status, remediationNotes: finding.remediationNotes },
      ipAddress: req.ip || null,
      timestamp: new Date(),
      details: { alert: finding.alert, assessmentId: finding.assessmentId },
    }).catch(() => {});

    return res.json({ success: true, data: finding, message: 'Finding status updated successfully.' });
  } catch (err) {
    return next(err);
  }
};

/**
 * 11. Security Audit Logs
 */
export const getAuditLogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const where: any = {};
    if (req.query.action) where.action = req.query.action;
    if (req.query.targetType) where.targetType = req.query.targetType;

    const { rows, count } = await SecurityAuditLog.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * 12. Monitoring Health & Component Diagnostics
 */
export const getHealthDiagnostics = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const diagnostics = await agentShieldEngine.getHealthDiagnostics();
    return res.json({ success: true, data: diagnostics });
  } catch (err) {
    return next(err);
  }
};

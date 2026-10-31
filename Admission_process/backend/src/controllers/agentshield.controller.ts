import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import SecurityEvent from '../models/agentshield/SecurityEvent';
import SecurityIncident, { IncidentStatus, IncidentSeverity } from '../models/agentshield/SecurityIncident';
import SecurityIncidentNotification from '../models/agentshield/SecurityIncidentNotification';
import DetectionRule from '../models/agentshield/DetectionRule';
import SecurityAssessment from '../models/agentshield/SecurityAssessment';
import SecurityFinding from '../models/agentshield/SecurityFinding';
import SecurityAuditLog from '../models/agentshield/SecurityAuditLog';
import agentShieldEngine from '../services/agentshield/engine.service';
import rulesService from '../services/agentshield/rules.service';
import responseService from '../services/agentshield/response.service';
import zapParserService from '../services/agentshield/zapParser.service';
import notificationService from '../services/agentshield/notification.service';
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
 * 1.5. Security Analytics Aggregations
 */
export const getAnalytics = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const timeRange = (req.query.timeRange as string) || '24h';
    const now = new Date();
    let startDate: Date;

    if (timeRange === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === 'custom' && req.query.startDate) {
      startDate = new Date(req.query.startDate as string);
    } else {
      // default 24h
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : now;

    // 1. Fetch all events in the timeframe
    const events = await SecurityEvent.findAll({
      where: {
        timestamp: {
          [Op.gte]: startDate,
          [Op.lte]: endDate,
        },
      },
      order: [['timestamp', 'ASC']],
    });

    // Also get all-time open and resolved incidents for comprehensive status
    const allOpenIncidentsCount = await SecurityIncident.count({
      where: { status: { [Op.in]: ['NEW', 'INVESTIGATING'] } },
    });
    const allResolvedIncidentsCount = await SecurityIncident.count({
      where: { status: 'RESOLVED' },
    });

    // Compute Summary KPIs
    const totalEvents = events.length;
    const criticalThreats = events.filter((e) => e.riskLevel === 'CRITICAL').length;
    const highThreats = events.filter((e) => e.riskLevel === 'HIGH').length;
    const mediumThreats = events.filter((e) => e.riskLevel === 'MEDIUM').length;
    const lowThreats = events.filter((e) => e.riskLevel === 'LOW').length;
    const blockedRequests = events.filter((e) =>
      ['BLOCKED', 'RATE_LIMITED', 'HONEYPOT_TRIGGER'].includes(e.responseAction)
    ).length;

    // 2. Time Series: Events Over Time
    const isHourly = timeRange === '24h' || (endDate.getTime() - startDate.getTime() <= 36 * 60 * 60 * 1000);
    const bucketMap = new Map<string, { label: string; timestamp: string; events: number; critical: number; high: number; medium: number; low: number }>();

    if (isHourly) {
      // Create hourly buckets
      const cursor = new Date(startDate);
      cursor.setMinutes(0, 0, 0);
      while (cursor <= endDate) {
        const key = cursor.toISOString().slice(0, 13);
        const hours = cursor.getHours().toString().padStart(2, '0');
        bucketMap.set(key, {
          label: `${hours}:00`,
          timestamp: cursor.toISOString(),
          events: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        });
        cursor.setHours(cursor.getHours() + 1);
      }

      events.forEach((ev) => {
        const evDate = new Date(ev.timestamp);
        const key = evDate.toISOString().slice(0, 13);
        const bucket = bucketMap.get(key);
        if (bucket) {
          bucket.events++;
          if (ev.riskLevel === 'CRITICAL') bucket.critical++;
          else if (ev.riskLevel === 'HIGH') bucket.high++;
          else if (ev.riskLevel === 'MEDIUM') bucket.medium++;
          else if (ev.riskLevel === 'LOW') bucket.low++;
        }
      });
    } else {
      // Create daily buckets
      const cursor = new Date(startDate);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= endDate) {
        const key = cursor.toISOString().slice(0, 10);
        const month = cursor.toLocaleString('default', { month: 'short' });
        const day = cursor.getDate();
        bucketMap.set(key, {
          label: `${month} ${day}`,
          timestamp: cursor.toISOString(),
          events: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      events.forEach((ev) => {
        const evDate = new Date(ev.timestamp);
        const key = evDate.toISOString().slice(0, 10);
        const bucket = bucketMap.get(key);
        if (bucket) {
          bucket.events++;
          if (ev.riskLevel === 'CRITICAL') bucket.critical++;
          else if (ev.riskLevel === 'HIGH') bucket.high++;
          else if (ev.riskLevel === 'MEDIUM') bucket.medium++;
          else if (ev.riskLevel === 'LOW') bucket.low++;
        }
      });
    }

    const eventsOverTime = Array.from(bucketMap.values());

    // 3. Threat Severity Distribution
    const severityDistribution = [
      { name: 'Critical', value: criticalThreats, color: '#DC2626' },
      { name: 'High', value: highThreats, color: '#EA580C' },
      { name: 'Medium', value: mediumThreats, color: '#D97706' },
      { name: 'Low', value: lowThreats, color: '#64748B' },
    ];

    // 4. Threat Category Distribution
    const categoryNameMap: Record<string, string> = {
      DECEPTION: 'Honeypot Detection',
      RECONNAISSANCE: 'Route Probing',
      ACCESS_CONTROL: 'Unauthorized Access',
      INJECTION: 'Injection Attempts',
      AUTHENTICATION: 'Brute Force',
      DOS_THROTTLE: 'Rate Anomalies',
    };

    const categoryCounts: Record<string, number> = {};
    events.forEach((e) => {
      const cat = e.category || 'OTHER';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const categoryDistribution = Object.keys(categoryCounts).map((cat) => ({
      category: cat,
      name: categoryNameMap[cat] || cat,
      count: categoryCounts[cat],
    })).sort((a, b) => b.count - a.count);

    // 5. Security Response Analytics
    const responseCounts: Record<string, number> = {
      BLOCKED: 0,
      RATE_LIMITED: 0,
      HONEYPOT_TRIGGER: 0,
      MONITOR: 0,
    };

    events.forEach((e) => {
      const action = e.responseAction || 'MONITOR';
      if (responseCounts[action] !== undefined) {
        responseCounts[action]++;
      } else {
        responseCounts.MONITOR++;
      }
    });

    const securityResponseAnalytics = [
      { action: 'BLOCKED', label: 'Blocked Requests', count: responseCounts.BLOCKED, color: '#DC2626' },
      { action: 'RATE_LIMITED', label: 'Rate-Limited Requests', count: responseCounts.RATE_LIMITED, color: '#EA580C' },
      { action: 'HONEYPOT_TRIGGER', label: 'Honeypot Traps', count: responseCounts.HONEYPOT_TRIGGER, color: '#6D35E8' },
      { action: 'MONITOR', label: 'Monitored Signals', count: responseCounts.MONITOR, color: '#0EA5E9' },
    ];

    // 6. Incident Status Distribution
    const allIncidents = await SecurityIncident.findAll({ attributes: ['status'] });
    const incidentStatusCounts: Record<string, number> = {
      NEW: 0,
      INVESTIGATING: 0,
      MITIGATED: 0,
      RESOLVED: 0,
    };
    allIncidents.forEach((inc) => {
      if (incidentStatusCounts[inc.status] !== undefined) {
        incidentStatusCounts[inc.status]++;
      }
    });

    const incidentStatusDistribution = [
      { name: 'New', value: incidentStatusCounts.NEW, color: '#DC2626' },
      { name: 'Investigating', value: incidentStatusCounts.INVESTIGATING, color: '#D97706' },
      { name: 'Mitigated', value: incidentStatusCounts.MITIGATED, color: '#2563EB' },
      { name: 'Resolved', value: incidentStatusCounts.RESOLVED, color: '#16A34A' },
    ];

    // 7. Top Targeted Endpoints
    const endpointMap = new Map<string, { endpoint: string; eventCount: number; highestSeverity: string; lastOccurrence: Date }>();
    const severityWeight: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

    events.forEach((ev) => {
      const ep = ev.route || 'Unknown';
      const existing = endpointMap.get(ep);
      const evDate = new Date(ev.timestamp);
      if (!existing) {
        endpointMap.set(ep, {
          endpoint: ep,
          eventCount: 1,
          highestSeverity: ev.riskLevel,
          lastOccurrence: evDate,
        });
      } else {
        existing.eventCount++;
        if ((severityWeight[ev.riskLevel] || 0) > (severityWeight[existing.highestSeverity] || 0)) {
          existing.highestSeverity = ev.riskLevel;
        }
        if (evDate > existing.lastOccurrence) {
          existing.lastOccurrence = evDate;
        }
      }
    });

    const topEndpoints = Array.from(endpointMap.values())
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        lastOccurrence: item.lastOccurrence.toISOString(),
      }));

    // 8. Top Detection Sources
    const sourceMap = new Map<string, { sourceIdentifier: string; eventCount: number; highestSeverity: string; lastOccurrence: Date }>();

    events.forEach((ev) => {
      const src = ev.clientIp || '127.0.0.1';
      const existing = sourceMap.get(src);
      const evDate = new Date(ev.timestamp);
      if (!existing) {
        sourceMap.set(src, {
          sourceIdentifier: src,
          eventCount: 1,
          highestSeverity: ev.riskLevel,
          lastOccurrence: evDate,
        });
      } else {
        existing.eventCount++;
        if ((severityWeight[ev.riskLevel] || 0) > (severityWeight[existing.highestSeverity] || 0)) {
          existing.highestSeverity = ev.riskLevel;
        }
        if (evDate > existing.lastOccurrence) {
          existing.lastOccurrence = evDate;
        }
      }
    });

    const topSources = Array.from(sourceMap.values())
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        lastOccurrence: item.lastOccurrence.toISOString(),
      }));

    return res.json({
      success: true,
      data: {
        timeRange,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        summary: {
          totalEvents,
          criticalThreats,
          highThreats,
          mediumThreats,
          lowThreats,
          blockedRequests,
          openIncidents: allOpenIncidentsCount,
          resolvedIncidents: allResolvedIncidentsCount,
        },
        eventsOverTime,
        severityDistribution,
        categoryDistribution,
        securityResponseAnalytics,
        incidentStatusDistribution,
        topEndpoints,
        topSources,
      },
    });
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
        {
          model: SecurityIncidentNotification,
          as: 'notifications',
          limit: 10,
          order: [['createdAt', 'DESC']],
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
 * 6b. Manually Trigger Resending Alert Email for an Incident
 */
export const resendIncidentNotification = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const incident = await SecurityIncident.findByPk(id);

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Security incident not found.' });
    }

    if (incident.severity !== 'CRITICAL' && incident.severity !== 'HIGH') {
      return res.status(400).json({
        success: false,
        error: 'Email notifications are only supported for HIGH and CRITICAL severity incidents.',
      });
    }

    await notificationService.notifyIncidentAlert(incident, true);

    await SecurityAuditLog.create({
      actorId: req.user!.id,
      actorEmail: req.user!.email || 'cyberadmin@jcer.edu',
      action: 'RESEND_INCIDENT_NOTIFICATION',
      targetType: 'INCIDENT',
      targetId: incident.id,
      previousState: null,
      newState: { notificationStatus: incident.notificationStatus },
      ipAddress: req.ip || null,
      timestamp: new Date(),
      details: { incidentNumber: incident.incidentNumber, severity: incident.severity },
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Alert email notification queued for incident ${incident.incidentNumber}.`,
      data: incident,
    });
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

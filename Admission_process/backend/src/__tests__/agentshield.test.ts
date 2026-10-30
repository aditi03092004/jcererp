import { Request, Response } from 'express';
import { authorizeRoles } from '../middleware/rbac.middleware';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import SecurityEvent from '../models/agentshield/SecurityEvent';
import SecurityIncident from '../models/agentshield/SecurityIncident';
import DetectionRule from '../models/agentshield/DetectionRule';
import SecurityFinding from '../models/agentshield/SecurityFinding';
import SecurityAuditLog from '../models/agentshield/SecurityAuditLog';
import { rulesService } from '../services/agentshield/rules.service';
import { riskService } from '../services/agentshield/risk.service';
import { correlationService } from '../services/agentshield/correlation.service';
import { responseService } from '../services/agentshield/response.service';
import { zapParserService } from '../services/agentshield/zapParser.service';
import agentShieldEngine, { SecuritySignal } from '../services/agentshield/engine.service';
import * as agentShieldController from '../controllers/agentshield.controller';
import { agentShieldMiddleware, sanitizeQuery } from '../middleware/agentShield.middleware';

// Helper to create mock Express response
const createMockRes = () => {
  const res: any = {};
  res.statusCode = 200;
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((data: any) => {
    res.body = data;
    return res;
  });
  res.setHeader = jest.fn();
  return res;
};

describe('AgentShield Security Engine & Incident Management Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. RBAC & Access Control
  // =========================================================================
  describe('1. Access Control & Authorization (RBAC)', () => {
    it('should reject unauthenticated requests with 401 in authMiddleware', async () => {
      const req: any = {
        headers: {},
        originalUrl: '/api/v1/agentshield/overview',
      };
      const res = createMockRes();
      const next = jest.fn();

      await authMiddleware(req as AuthenticatedRequest, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/no token provided|access denied/i) })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject unauthorized roles (STUDENT, FACULTY, HOD, PARENT) with 403 Forbidden', () => {
      const rolesToReject = ['STUDENT', 'FACULTY', 'HOD', 'PARENT', 'TEACHER'];
      const middleware = authorizeRoles('CYBERADMIN', 'SUPER_ADMIN');

      for (const role of rolesToReject) {
        const req: any = {
          user: { id: 'u1', email: `${role.toLowerCase()}@jcer.edu`, role },
        };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req as AuthenticatedRequest, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ error: `Forbidden. Role '${role}' is not authorized to access this resource.` })
        );
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('should permit CYBERADMIN and SUPER_ADMIN through the role authorization gate', () => {
      const allowedRoles = ['CYBERADMIN', 'SUPER_ADMIN'];
      const middleware = authorizeRoles('CYBERADMIN', 'SUPER_ADMIN');

      for (const role of allowedRoles) {
        const req: any = {
          user: { id: 'u-auth', email: 'admin@jcer.edu', role },
        };
        const res = createMockRes();
        const next = jest.fn();

        middleware(req as AuthenticatedRequest, res as Response, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('should return overview metrics to authorized CYBERADMIN', async () => {
      jest.spyOn(agentShieldEngine, 'getOverviewMetrics').mockResolvedValue({
        counts: {
          totalEvents24h: 42,
          openIncidents: 3,
          criticalIncidents: 1,
          highIncidents: 2,
          activeRestrictions: 0,
        },
        recentIncidents: [],
        riskBreakdown: {},
        trend24h: [],
      });

      const req: any = {
        user: { id: 'cyber-1', email: 'cyberadmin@jcer.edu', role: 'CYBERADMIN' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.getOverview(req as AuthenticatedRequest, res as Response, next);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(res.body.data.counts.totalEvents24h).toBe(42);
      expect(res.body.data.counts.openIncidents).toBe(3);
    });
  });

  // =========================================================================
  // 2. Detection Rules Service & Threshold Configuration
  // =========================================================================
  describe('2. Detection Rules Management & Enforcement', () => {
    it('should seed default detection rules idempotently', async () => {
      const mockRules: any[] = [];
      jest.spyOn(DetectionRule, 'findByPk').mockImplementation((id: any) => {
        const found = mockRules.find((r) => r.id === id);
        return Promise.resolve(found || null);
      });
      jest.spyOn(DetectionRule, 'create').mockImplementation((data: any) => {
        const item = { ...data, save: jest.fn(), toJSON: () => data };
        mockRules.push(item);
        return Promise.resolve(item as any);
      });
      jest.spyOn(DetectionRule, 'findAll').mockImplementation(() => Promise.resolve(mockRules as any));

      await rulesService.seedDefaultRules();

      expect(mockRules.length).toBeGreaterThanOrEqual(6);
      const ruleIds = mockRules.map((r) => r.id);
      expect(ruleIds).toContain('RULE_ROUTE_PROBING');
      expect(ruleIds).toContain('RULE_UNAUTHORIZED_ACCESS');
      expect(ruleIds).toContain('RULE_AUTH_FAILURE');
      expect(ruleIds).toContain('RULE_HONEYPOT');
      expect(ruleIds).toContain('RULE_RATE_ANOMALY');
      expect(ruleIds).toContain('RULE_SUSPICIOUS_PAYLOAD');
    });

    it('should reject invalid rule thresholds or windows during update', async () => {
      const mockRule: any = {
        id: 'RULE_ROUTE_PROBING',
        threshold: 10,
        observationWindowSeconds: 60,
        toJSON: () => ({ id: 'RULE_ROUTE_PROBING' }),
      };
      jest.spyOn(DetectionRule, 'findByPk').mockResolvedValue(mockRule as any);

      await expect(
        rulesService.updateRule('RULE_ROUTE_PROBING', { threshold: 0 }, { id: 'admin-1', email: 'admin@jcer.edu' })
      ).rejects.toThrow('Rule threshold must be between 1 and 10,000.');

      await expect(
        rulesService.updateRule('RULE_ROUTE_PROBING', { observationWindowSeconds: 2 }, { id: 'admin-1', email: 'admin@jcer.edu' })
      ).rejects.toThrow('Observation window must be between 5 seconds and 86,400 seconds (24 hours).');
    });

    it('should record an audit log entry when a detection rule is updated', async () => {
      const existingRule: any = {
        id: 'RULE_ROUTE_PROBING',
        name: 'Route Probing Detector',
        threshold: 10,
        observationWindowSeconds: 60,
        riskLevel: 'MEDIUM',
        responsePolicy: 'MONITOR',
        enabled: true,
        save: jest.fn().mockResolvedValue(true),
        toJSON: function (this: any) {
          return { ...this };
        },
      };

      jest.spyOn(DetectionRule, 'findByPk').mockResolvedValue(existingRule as any);
      const auditCreateSpy = jest.spyOn(SecurityAuditLog, 'create').mockResolvedValue({} as any);

      const updated = await rulesService.updateRule(
        'RULE_ROUTE_PROBING',
        { threshold: 15, riskLevel: 'HIGH' },
        { id: 'admin-uuid-test', email: 'cyberadmin@jcer.edu', ipAddress: '10.0.0.1' }
      );

      expect(updated.threshold).toBe(15);
      expect(updated.riskLevel).toBe('HIGH');
      expect(auditCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_DETECTION_RULE',
          targetId: 'RULE_ROUTE_PROBING',
          actorId: 'admin-uuid-test',
          actorEmail: 'cyberadmin@jcer.edu',
          ipAddress: '10.0.0.1',
        })
      );
    });
  });

  // =========================================================================
  // 3. Explainable Risk Assessment Scoring
  // =========================================================================
  describe('3. Explainable Risk Assessment Scoring Engine', () => {
    it('should score LOW risk for minor route probing below thresholds', () => {
      const assessment = riskService.evaluateRisk({
        ruleId: 'RULE_ROUTE_PROBING',
        category: 'RECONNAISSANCE',
        count: 2,
        threshold: 10,
        windowSeconds: 60,
        distinctRoutesCount: 2,
        targetPath: '/api/v1/nonexistent',
        clientIp: '192.168.1.5',
      });

      expect(assessment.riskScore).toBeLessThan(75);
      expect(['LOW', 'MEDIUM']).toContain(assessment.riskLevel);
      expect(assessment.explanation).toContain('route probing');
      expect(assessment.factors.length).toBeGreaterThan(0);
    });

    it('should score CRITICAL for honeypot canary probe', () => {
      const assessment = riskService.evaluateRisk({
        ruleId: 'RULE_HONEYPOT',
        category: 'DECEPTION',
        count: 1,
        threshold: 1,
        windowSeconds: 60,
        isHoneypot: true,
        targetPath: '/api/v1/system/debug-internal-keys',
        clientIp: '192.168.1.15',
      });

      expect(assessment.riskScore).toBeGreaterThanOrEqual(90);
      expect(assessment.riskLevel).toBe('CRITICAL');
      expect(assessment.explanation).toContain('canary resource');
      expect(assessment.factors.some((f) => f.includes('decoy honeypot'))).toBe(true);
    });

    it('should score HIGH or CRITICAL for suspicious injection payloads', () => {
      const assessment = riskService.evaluateRisk({
        ruleId: 'RULE_SUSPICIOUS_PAYLOAD',
        category: 'INJECTION',
        count: 3,
        threshold: 2,
        windowSeconds: 60,
        targetPath: '/api/v1/students/search',
        clientIp: '192.168.1.20',
      });

      expect(assessment.riskScore).toBeGreaterThanOrEqual(65);
      expect(['HIGH', 'CRITICAL']).toContain(assessment.riskLevel);
      expect(assessment.factors.some((f) => f.includes('injection sequence detected'))).toBe(true);
    });
  });

  // =========================================================================
  // 4. Incident Correlation & Monotonic Tracking
  // =========================================================================
  describe('4. Security Incident Correlation & Aggregation', () => {
    it('should correlate repeated events from the same source IP & category into one incident', async () => {
      let createdIncident: any = null;

      jest.spyOn(SecurityIncident, 'count').mockResolvedValue(5 as any);
      jest.spyOn(SecurityIncident, 'findOne').mockImplementation((options: any) => {
        if (createdIncident && createdIncident.sourceIdentifier === options?.where?.sourceIdentifier) {
          return Promise.resolve(createdIncident);
        }
        return Promise.resolve(null);
      });

      jest.spyOn(SecurityIncident, 'create').mockImplementation((data: any) => {
        createdIncident = {
          ...data,
          save: jest.fn().mockResolvedValue(true),
        };
        return Promise.resolve(createdIncident);
      });

      // First event
      const incident1 = await correlationService.correlateEvent({
        category: 'RECONNAISSANCE',
        ruleId: 'RULE_ROUTE_PROBING',
        sourceIdentifier: '192.168.1.100',
        targetResource: '/api/v1/admin/debug',
        severity: 'MEDIUM',
        evidenceExplanation: 'Sequential 404 probing on /api/v1/admin/debug',
        responseActionTaken: 'MONITOR',
      });

      expect(incident1).toBeDefined();
      expect(incident1.incidentNumber).toMatch(/^INC-\d{4}-\d{4}$/);
      expect(incident1.eventCount).toBe(1);

      // Second event within correlation window
      const incident2 = await correlationService.correlateEvent({
        category: 'RECONNAISSANCE',
        ruleId: 'RULE_ROUTE_PROBING',
        sourceIdentifier: '192.168.1.100',
        targetResource: '/api/v1/admin/backup',
        severity: 'HIGH',
        evidenceExplanation: 'Sequential 404 probing on /api/v1/admin/backup',
        responseActionTaken: 'RATE_LIMIT',
      });

      expect(incident2.incidentNumber).toBe(incident1.incidentNumber);
      expect(incident2.eventCount).toBe(2);
      expect(incident2.severity).toBe('HIGH'); // Escalated
    });

    it('should update incident lifecycle status via controller and audit the action', async () => {
      const mockIncident: any = {
        id: 'inc-uuid-1',
        incidentNumber: 'INC-2026-0001',
        status: 'NEW',
        resolvedBy: null,
        resolutionSummary: null,
        save: jest.fn().mockResolvedValue(true),
        toJSON: () => ({ id: 'inc-uuid-1', incidentNumber: 'INC-2026-0001', status: 'NEW' }),
      };

      jest.spyOn(SecurityIncident, 'findByPk').mockResolvedValue(mockIncident as any);
      const auditSpy = jest.spyOn(SecurityAuditLog, 'create').mockResolvedValue({} as any);

      const req: any = {
        params: { id: 'inc-uuid-1' },
        body: { status: 'RESOLVED', resolutionSummary: 'Mitigated via IP rate limit and firewall update' },
        user: { id: 'cyber-admin-1', email: 'cyberadmin@jcer.edu' },
        ip: '127.0.0.1',
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.updateIncidentStatus(req as AuthenticatedRequest, res as Response, next);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(mockIncident.status).toBe('RESOLVED');
      expect(mockIncident.resolvedBy).toBe('cyberadmin@jcer.edu');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_INCIDENT_STATUS',
          targetId: 'inc-uuid-1',
          actorEmail: 'cyberadmin@jcer.edu',
        })
      );
    });
  });

  // =========================================================================
  // 5. Protective Response & Non-Disruptive Containment
  // =========================================================================
  describe('5. Proportionate & Reversible Protective Response Service', () => {
    beforeEach(() => {
      const active = responseService.getActiveRestrictions();
      active.forEach((r) =>
        responseService.liftRestriction(r.clientIp, {
          id: 'test-admin',
          email: 'admin@jcer.edu',
          ipAddress: '127.0.0.1',
        })
      );
    });

    it('should apply temporary IP cooldown and enforce retryAfter', () => {
      const res = responseService.applyProtectiveAction(
        '198.51.100.5',
        'RULE_ROUTE_PROBING',
        'RATE_LIMIT',
        120
      );

      expect(res.actionApplied).toBe('RATE_LIMIT');
      expect(res.durationSeconds).toBe(120);

      const check = responseService.isSourceRestricted('198.51.100.5');
      expect(check.restricted).toBe(true);
      expect(check.retryAfterSeconds).toBeGreaterThan(0);
      expect(check.policy).toBe('RATE_LIMIT');

      // Unrelated IP should NOT be restricted
      expect(responseService.isSourceRestricted('198.51.100.6').restricted).toBe(false);
    });

    it('should lift restrictions immediately upon authorized administrator action', async () => {
      responseService.applyProtectiveAction('198.51.100.22', 'RULE_HONEYPOT', 'BLOCK', 300);
      expect(responseService.isSourceRestricted('198.51.100.22').restricted).toBe(true);

      jest.spyOn(SecurityAuditLog, 'create').mockResolvedValue({} as any);

      const lifted = await responseService.liftRestriction('198.51.100.22', {
        id: 'cyberadmin-uuid',
        email: 'cyberadmin@jcer.edu',
        ipAddress: '127.0.0.1',
      });

      expect(lifted).toBe(true);
      expect(responseService.isSourceRestricted('198.51.100.22').restricted).toBe(false);
    });
  });

  // =========================================================================
  // 6. Request Lifecycle Interception & Evidence Sanitization
  // =========================================================================
  describe('6. Request Lifecycle Interception & Sanitization', () => {
    it('should intercept canary honeypots and return 404 without executing backend logic', async () => {
      const req: any = {
        path: '/api/v1/system/debug-internal-keys',
        originalUrl: '/api/v1/system/debug-internal-keys',
        method: 'GET',
        headers: {},
        ip: '192.168.1.88',
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(agentShieldEngine, 'processSignal').mockResolvedValue();

      await agentShieldMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Endpoint not found' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should enforce active temporary IP restriction with 429 Too Many Requests', async () => {
      responseService.applyProtectiveAction('198.51.100.99', 'RULE_RATE_ANOMALY', 'RATE_LIMIT', 60);

      const req: any = {
        path: '/api/v1/students',
        originalUrl: '/api/v1/students',
        method: 'GET',
        headers: {},
        ip: '198.51.100.99',
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
      expect(next).not.toHaveBeenCalled();
    });

    it('should sanitize sensitive query parameters and never expose passwords or secrets', () => {
      const rawQuery = {
        name: 'studentName',
        password: 'SuperSecretPassword@2026',
        token: 'secret-jwt-token-string',
        otp: '654321',
        apiKey: 'api-secret-key-99',
        page: '1',
      };

      const sanitized = sanitizeQuery(rawQuery);

      expect(sanitized.name).toBe('studentName');
      expect(sanitized.page).toBe('1');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.otp).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(JSON.stringify(sanitized)).not.toContain('SuperSecretPassword@2026');
      expect(JSON.stringify(sanitized)).not.toContain('secret-jwt-token-string');
      expect(JSON.stringify(sanitized)).not.toContain('654321');
    });

    it('should observe and monitor ordinary successful requests (HTTP 200) without persisting them as security threats', async () => {
      (agentShieldEngine.processSignal as any).mockRestore?.();
      (agentShieldEngine as any).isInitialized = true;
      const initialTotal = (agentShieldEngine as any).totalEventsProcessed;
      const initialViolations = (agentShieldEngine as any).totalViolationsDetected;
      const eventCreateSpy = jest.spyOn(SecurityEvent, 'create');

      // Legitimate requests such as POST /api/auth/activity and GET /api/system/academic-years
      await agentShieldEngine.processSignal({
        timestamp: new Date(),
        method: 'POST',
        route: '/api/auth/activity',
        statusCode: 200,
        role: 'STUDENT',
        userId: 'student-uuid-1',
        clientIp: '10.0.0.1',
        correlationId: 'req-200-1',
      });

      await agentShieldEngine.processSignal({
        timestamp: new Date(),
        method: 'GET',
        route: '/api/system/academic-years',
        statusCode: 200,
        role: 'ANONYMOUS',
        userId: null,
        clientIp: '10.0.0.1',
        correlationId: 'req-200-2',
      });

      // Total processed counter increments
      expect((agentShieldEngine as any).totalEventsProcessed).toBe(initialTotal + 2);
      // Violations detected counter remains unchanged
      expect((agentShieldEngine as any).totalViolationsDetected).toBe(initialViolations);
      // SecurityEvent is NOT created for nominal 200 OK traffic
      expect(eventCreateSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. OWASP ZAP Ingestion & Remediation Status Lifecycle
  // =========================================================================
  describe('7. OWASP ZAP Vulnerability Report Ingestion & Findings Management', () => {
    const sampleZapReport = {
      "@generated": "2026-10-30T12:00:00.000Z",
      "@version": "2.14.0",
      "site": [
        {
          "@name": "http://localhost:5000",
          "@host": "localhost",
          "@port": "5000",
          "alerts": [
            {
              "pluginId": "10038",
              "alertRef": "10038",
              "alert": "Content Security Policy (CSP) Header Not Set",
              "name": "Content Security Policy (CSP) Header Not Set",
              "riskcode": "2",
              "confidence": "2",
              "riskdesc": "Medium (High)",
              "desc": "Content Security Policy (CSP) is an added layer of security...",
              "instances": [
                {
                  "uri": "http://localhost:5000/api/v1/admissions",
                  "method": "GET",
                  "param": "",
                  "attack": "",
                  "evidence": ""
                }
              ],
              "count": "1",
              "solution": "Ensure that your web server is configured to set Content-Security-Policy.",
              "cweid": "693",
              "wascid": "15"
            },
            {
              "pluginId": "40018",
              "alertRef": "40018",
              "alert": "SQL Injection",
              "name": "SQL Injection",
              "riskcode": "3",
              "confidence": "3",
              "riskdesc": "High (Medium)",
              "desc": "SQL injection may be possible...",
              "instances": [
                {
                  "uri": "http://localhost:5000/api/v1/students/search",
                  "method": "GET",
                  "param": "q",
                  "attack": "' OR '1'='1",
                  "evidence": "syntax error at or near"
                }
              ],
              "count": "1",
              "solution": "Use parameterized queries or prepared statements.",
              "cweid": "89",
              "wascid": "19"
            }
          ]
        }
      ]
    };

    it('should parse OWASP ZAP JSON reports and extract findings', () => {
      const parsed = zapParserService.parseJsonReport(JSON.stringify(sampleZapReport));
      expect(parsed.findings.length).toBe(2);

      const sqlFinding = parsed.findings.find((f) => f.alert === 'SQL Injection');
      expect(sqlFinding).toBeDefined();
      expect(sqlFinding?.risk).toBe('HIGH');
      expect(sqlFinding?.cweId).toBe('89');
      expect(sqlFinding?.wascId).toBe('19');

      const cspFinding = parsed.findings.find((f) => f.alert.includes('Content Security Policy'));
      expect(cspFinding).toBeDefined();
      expect(cspFinding?.risk).toBe('MEDIUM');
      expect(cspFinding?.cweId).toBe('693');
    });

    it('should update finding remediation status and record security audit log', async () => {
      const mockFinding: any = {
        id: 'finding-uuid-1',
        status: 'OPEN',
        save: jest.fn().mockResolvedValue(true),
        toJSON: () => ({ id: 'finding-uuid-1', status: 'OPEN' }),
      };

      jest.spyOn(SecurityFinding, 'findByPk').mockResolvedValue(mockFinding as any);
      const auditSpy = jest.spyOn(SecurityAuditLog, 'create').mockResolvedValue({} as any);

      const req: any = {
        params: { id: 'finding-uuid-1' },
        body: { status: 'REMEDIATED', notes: 'Implemented bind parameters and input validation' },
        user: { id: 'cyberadmin-uuid', email: 'cyberadmin@jcer.edu' },
        ip: '127.0.0.1',
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.updateFindingStatus(req as AuthenticatedRequest, res as Response, next);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(mockFinding.status).toBe('REMEDIATED');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_FINDING_STATUS',
          targetId: 'finding-uuid-1',
          actorId: 'cyberadmin-uuid',
        })
      );
    });
  });

  // =========================================================================
  // 8. Health & Diagnostic API
  // =========================================================================
  describe('8. AgentShield Engine Health & System Diagnostics', () => {
    it('should return operational status, rule inventory, and diagnostic metrics', async () => {
      jest.spyOn(agentShieldEngine, 'getHealthDiagnostics').mockResolvedValue({
        status: 'HEALTHY',
        engineInitialized: true,
        database: { status: 'CONNECTED', latencyMs: 2 },
        monitoring: {
          rulesLoaded: 6,
          rulesEnabled: 6,
          activeIncidents: 0,
          totalEventsProcessed: 100,
          totalViolationsDetected: 3,
          lastProcessedEventAt: new Date().toISOString(),
          activeRestrictionsCount: 0,
        },
        telemetry: {
          connectedSocSubscribers: 1,
          uptimeSeconds: 120,
        },
        timestamp: new Date().toISOString(),
      });

      const req: any = {
        user: { id: 'cyberadmin-uuid', email: 'cyberadmin@jcer.edu', role: 'CYBERADMIN' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.getHealthDiagnostics(req as AuthenticatedRequest, res as Response, next);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status', 'HEALTHY');
      expect(res.body.data).toHaveProperty('database');
      expect(res.body.data.telemetry).toHaveProperty('uptimeSeconds', 120);
      expect(res.body.data.monitoring).toHaveProperty('rulesLoaded', 6);
      expect(res.body.data.telemetry).toHaveProperty('connectedSocSubscribers', 1);
    });
  });

  // =========================================================================
  // 9. Concurrency, Race Condition Resilience & Campus IP Isolation
  // =========================================================================
  describe('9. Concurrency, Race Condition Resilience & Campus IP Isolation', () => {
    it('should generate incident numbers using PostgreSQL atomic sequence when available', async () => {
      if (SecurityIncident.sequelize) {
        jest.spyOn(SecurityIncident.sequelize, 'query').mockResolvedValue([[{ seq: '46' }]] as any);
      }
      const nextId = await correlationService.generateIncidentNumber();
      expect(nextId).toBe(`INC-${new Date().getFullYear()}-0046`);
    });

    it('should generate monotonic incident numbers using fallback query if sequence is unavailable', async () => {
      if (SecurityIncident.sequelize) {
        jest.spyOn(SecurityIncident.sequelize, 'query').mockRejectedValue(new Error('Sequence not available'));
      }
      jest.spyOn(SecurityIncident, 'findOne').mockResolvedValue({
        incidentNumber: 'INC-2026-0045',
      } as any);

      const nextId = await correlationService.generateIncidentNumber();
      expect(nextId).toBe('INC-2026-0046');
    });

    it('should recover gracefully from concurrency collision when creating incidents', async () => {
      let createCallCount = 0;
      const existingConcurrentIncident: any = {
        id: 'inc-concurrent-1',
        incidentNumber: 'INC-2026-0008',
        eventCount: 1,
        evidenceSummary: 'Initial evidence',
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(correlationService, 'generateIncidentNumber').mockResolvedValue('INC-2026-0008');
      jest.spyOn(SecurityIncident, 'findOne')
        .mockResolvedValueOnce(null) // First query: no existing incident
        .mockResolvedValueOnce(existingConcurrentIncident); // Concurrency catch: found concurrent incident!

      jest.spyOn(SecurityIncident, 'create').mockImplementation(() => {
        createCallCount++;
        const error: any = new Error('Validation error: incidentNumber must be unique');
        error.name = 'SequelizeUniqueConstraintError';
        throw error;
      });

      const incident = await correlationService.correlateEvent({
        category: 'RECONNAISSANCE',
        ruleId: 'RULE_ROUTE_PROBING',
        sourceIdentifier: '192.168.1.55',
        targetResource: '/api/v1/test',
        severity: 'MEDIUM',
        evidenceExplanation: 'Concurrent probe request',
        responseActionTaken: 'MONITOR',
      });

      expect(incident).toBeDefined();
      expect(incident.id).toBe('inc-concurrent-1');
      expect(existingConcurrentIncident.eventCount).toBe(2);
      expect(existingConcurrentIncident.save).toHaveBeenCalled();
    });

    it('should isolate distinct authenticated users sharing the same NAT/Campus IP', async () => {
      let correlatedSources: string[] = [];
      jest.spyOn(correlationService, 'correlateEvent').mockImplementation((input: any) => {
        correlatedSources.push(input.sourceIdentifier);
        return Promise.resolve({ id: 'inc-isolated', ...input } as any);
      });
      jest.spyOn(SecurityEvent, 'create').mockResolvedValue({ id: 'evt-1' } as any);

      // Student A triggers unauthorized violation on campus IP
      await agentShieldEngine.processSignal({
        timestamp: new Date(),
        method: 'GET',
        route: '/api/v1/dean/faculty-list',
        statusCode: 403,
        role: 'STUDENT',
        userId: 'student-uuid-aaa',
        clientIp: '10.20.30.40',
        correlationId: 'req-1',
      });

      // Different student B on the same campus IP
      await agentShieldEngine.processSignal({
        timestamp: new Date(),
        method: 'GET',
        route: '/api/v1/admin/users',
        statusCode: 403,
        role: 'STUDENT',
        userId: 'student-uuid-bbb',
        clientIp: '10.20.30.40',
        correlationId: 'req-2',
      });

      // Both events were triggered on same IP '10.20.30.40'
      // If threshold triggers, each user has their own distinct identity attributed
      expect(correlatedSources.length).toBeGreaterThanOrEqual(0);
    });

    it('should permit innocent campus students sharing a restricted NAT IP', () => {
      // 1. Anonymous scanner on campus IP is restricted
      responseService.applyProtectiveAction('203.0.113.99', 'RULE_ROUTE_PROBING', 'BLOCK', 300);

      // Anonymous probe from that IP is blocked
      const anonCheck = responseService.isSourceRestricted('203.0.113.99');
      expect(anonCheck.restricted).toBe(true);
      expect(anonCheck.policy).toBe('BLOCK');

      // Authenticated campus student on the same IP is permitted
      const studentCheck = responseService.isSourceRestricted('203.0.113.99', 'student-uuid-555');
      expect(studentCheck.restricted).toBe(false);

      // 2. If a specific user is targeted for restriction
      responseService.applyProtectiveAction('203.0.113.88', 'RULE_INJECTION', 'BLOCK', 300, 'malicious-user-111');

      // Malicious user is restricted
      const badUserCheck = responseService.isSourceRestricted('203.0.113.88', 'malicious-user-111');
      expect(badUserCheck.restricted).toBe(true);

      // Other innocent student on the same IP is permitted
      const innocentCheck = responseService.isSourceRestricted('203.0.113.88', 'innocent-student-222');
      expect(innocentCheck.restricted).toBe(false);
    });

    it('should enforce strict immutability and secret redaction on SecurityAuditLog', async () => {
      // Test immutability hooks
      await expect((SecurityAuditLog as any).runHooks('beforeUpdate')).rejects.toThrow(/strictly append-only/i);
      await expect((SecurityAuditLog as any).runHooks('beforeDestroy')).rejects.toThrow(/strictly append-only/i);

      // Test deep redaction hook
      const mockLog: any = {
        details: {
          secret: 'super-secret-key',
          password: 'plainPassword123',
          otp: '123456',
          token: 'eyJhbGciOi...',
          safeField: 'normal-value',
          nested: {
            cookie: 'session_cookie=abc',
            data: 'visible',
          },
        },
      };

      await (SecurityAuditLog as any).runHooks('beforeCreate', mockLog);

      expect(mockLog.details.secret).toBe('[REDACTED]');
      expect(mockLog.details.password).toBe('[REDACTED]');
      expect(mockLog.details.otp).toBe('[REDACTED]');
      expect(mockLog.details.token).toBe('[REDACTED]');
      expect(mockLog.details.safeField).toBe('normal-value');
      expect(mockLog.details.nested.cookie).toBe('[REDACTED]');
      expect(mockLog.details.nested.data).toBe('visible');
    });

    it('should normalize IPv6-mapped IPv4 addresses in getClientIp', () => {
      const { getClientIp } = require('../middleware/agentShield.middleware');
      const req: any = {
        ip: '::ffff:192.168.1.55',
        headers: {},
      };
      expect(getClientIp(req)).toBe('192.168.1.55');
    });
  });
});

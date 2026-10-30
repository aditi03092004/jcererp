import SecurityIncident from '../models/agentshield/SecurityIncident';
import SecurityIncidentNotification from '../models/agentshield/SecurityIncidentNotification';
import User from '../models/User';
import emailService from '../services/email.service';
import notificationService from '../services/agentshield/notification.service';
import * as agentShieldController from '../controllers/agentshield.controller';

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
  return res;
};

describe('AgentShield Priority Security Alert Notifications (Brevo)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Recipient Resolution & Deduplication', () => {
    it('should resolve Principal and CyberAdmin from User model when available', async () => {
      jest.spyOn(User, 'findOne').mockImplementation(((opts: any) => {
        if (opts?.where?.role === 'PRINCIPAL') {
          return Promise.resolve({ email: 'principal@jcer.in' } as any);
        }
        if (opts?.where?.role === 'CYBERADMIN') {
          return Promise.resolve({ email: 'cyberadmin@jcer.in' } as any);
        }
        return Promise.resolve(null);
      }) as any);

      const recipients = await notificationService.resolveAlertRecipients();
      expect(recipients).toContain('principal@jcer.in');
      expect(recipients).toContain('cyberadmin@jcer.in');
      expect(recipients.length).toBe(2);
    });

    it('should deduplicate if Principal and CyberAdmin have the same email', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue({ email: 'admin-lead@jcer.in' } as any);

      const recipients = await notificationService.resolveAlertRecipients();
      expect(recipients).toEqual(['admin-lead@jcer.in']);
      expect(recipients.length).toBe(1);
    });

    it('should fall back to configured environment variables if user is not in DB', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      process.env.INITIAL_PRINCIPAL_EMAIL = 'fallback-principal@jcer.in';
      process.env.INITIAL_CYBERADMIN_EMAIL = 'fallback-cyberadmin@jcer.in';

      const recipients = await notificationService.resolveAlertRecipients();
      expect(recipients).toContain('fallback-principal@jcer.in');
      expect(recipients).toContain('fallback-cyberadmin@jcer.in');
    });
  });

  describe('2. Subject and Template Generation', () => {
    it('should format CRITICAL subject correctly', () => {
      const mockIncident = {
        incidentNumber: 'INC-2026-0042',
        severity: 'CRITICAL',
      } as any;

      const subject = notificationService.generateSubject(mockIncident);
      expect(subject).toBe('[JCER ERP][CRITICAL] Immediate Security Alert — INC-2026-0042');
    });

    it('should format HIGH subject correctly', () => {
      const mockIncident = {
        incidentNumber: 'INC-2026-0043',
        severity: 'HIGH',
      } as any;

      const subject = notificationService.generateSubject(mockIncident);
      expect(subject).toBe('[JCER ERP][HIGH] Security Alert — INC-2026-0043');
    });

    it('should escape HTML characters in templates to prevent injection', () => {
      const mockIncident = {
        incidentNumber: 'INC-2026-0099',
        title: '<script>alert("xss")</script> Test Anomaly',
        category: 'INJECTION',
        severity: 'HIGH',
        targetResource: '/api/v1/auth?probe=<foo>',
        sourceIdentifier: '10.0.0.1 <malicious>',
        responseActionTaken: 'RATE_LIMITED',
        evidenceSummary: 'Payload: union select <script>',
        recommendedSteps: ['Step 1: Check firewall <rules>'],
        lastObservedAt: new Date('2026-10-31T00:00:00Z'),
      } as any;

      const html = notificationService.generateHtmlContent(mockIncident);
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(html).toContain('/cyberadmin/agentshield?tab=incidents');

      const text = notificationService.generateTextContent(mockIncident);
      expect(text).toContain('INC-2026-0099');
      expect(text).toContain('HIGH SECURITY ALERT');
      expect(text).toContain('/cyberadmin/agentshield?tab=incidents');
    });
  });

  describe('3. Trigger Filtering by Severity', () => {
    it('should NOT dispatch email for LOW severity incidents', async () => {
      const sendSpy = jest.spyOn(emailService, 'sendAgentShieldAlertEmail');
      const mockIncident = {
        id: 'inc-low-1',
        incidentNumber: 'INC-2026-0001',
        severity: 'LOW',
      } as any;

      const dispatched = await notificationService.notifyIncidentAlert(mockIncident);
      expect(dispatched).toBe(false);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should NOT dispatch email for MEDIUM severity incidents', async () => {
      const sendSpy = jest.spyOn(emailService, 'sendAgentShieldAlertEmail');
      const mockIncident = {
        id: 'inc-med-1',
        incidentNumber: 'INC-2026-0002',
        severity: 'MEDIUM',
      } as any;

      const dispatched = await notificationService.notifyIncidentAlert(mockIncident);
      expect(dispatched).toBe(false);
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. Delivery, Persistence & Idempotency', () => {
    it('should trigger alert for HIGH severity and skip duplicates idempotently', async () => {
      jest.spyOn(notificationService, 'resolveAlertRecipients').mockResolvedValue(['admin@jcer.in']);
      const sendSpy = jest.spyOn(emailService, 'sendAgentShieldAlertEmail').mockResolvedValue(true);

      const mockIncident = {
        id: 'inc-high-100',
        incidentNumber: 'INC-2026-0100',
        severity: 'HIGH',
        title: 'Sequential Scanning',
        category: 'RECONNAISSANCE',
        targetResource: '/api/v1/auth',
        sourceIdentifier: '192.168.1.50',
        responseActionTaken: 'RATE_LIMITED',
        evidenceSummary: 'Rate anomaly',
        recommendedSteps: ['Inspect source IP'],
        lastObservedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ id: 'inc-high-100' }),
      } as any;

      // Mock finding no existing record initially
      jest.spyOn(SecurityIncidentNotification, 'findOne').mockResolvedValue(null);
      const notifCreateMock = {
        deliveryStatus: 'PENDING',
        attemptCount: 0,
        lastAttemptAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(SecurityIncidentNotification, 'create').mockResolvedValue(notifCreateMock as any);

      const result = await notificationService.notifyIncidentAlert(mockIncident);
      expect(result).toBe(true);

      // Now simulate a duplicate event when notification is already SENT
      jest.spyOn(SecurityIncidentNotification, 'findOne').mockResolvedValue({
        idempotencyKey: 'inc-high-100_HIGH',
        deliveryStatus: 'SENT',
      } as any);

      sendSpy.mockClear();
      const duplicateResult = await notificationService.notifyIncidentAlert(mockIncident);
      expect(duplicateResult).toBe(true);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should allow forceResend even if previously marked SENT', async () => {
      jest.spyOn(notificationService, 'resolveAlertRecipients').mockResolvedValue(['admin@jcer.in']);
      const sendSpy = jest.spyOn(emailService, 'sendAgentShieldAlertEmail').mockResolvedValue(true);

      const mockIncident = {
        id: 'inc-crit-200',
        incidentNumber: 'INC-2026-0200',
        severity: 'CRITICAL',
        title: 'Canary Honeypot Probed',
        category: 'DECEPTION',
        targetResource: '/api/v1/system/debug',
        sourceIdentifier: '10.0.0.99',
        responseActionTaken: 'BLOCKED',
        evidenceSummary: 'Honeypot route touched',
        recommendedSteps: ['Block IP'],
        lastObservedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
        toJSON: jest.fn().mockReturnValue({ id: 'inc-crit-200' }),
      } as any;

      const existingRecord = {
        idempotencyKey: 'inc-crit-200_CRITICAL',
        deliveryStatus: 'SENT',
        save: jest.fn().mockResolvedValue(true),
      };
      jest.spyOn(SecurityIncidentNotification, 'findOne').mockResolvedValue(existingRecord as any);

      const res = await notificationService.notifyIncidentAlert(mockIncident, true);
      expect(res).toBe(true);
      expect(existingRecord.deliveryStatus).toBe('PENDING');
    });
  });

  describe('5. Resend Controller Endpoint', () => {
    it('should return 404 if incident does not exist', async () => {
      jest.spyOn(SecurityIncident, 'findByPk').mockResolvedValue(null);
      const req: any = {
        params: { id: 'non-existent' },
        user: { id: 'u1', email: 'cyberadmin@jcer.in' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.resendIncidentNotification(req, res, next);
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('should return 400 if incident is not HIGH or CRITICAL', async () => {
      jest.spyOn(SecurityIncident, 'findByPk').mockResolvedValue({
        id: 'inc-med-1',
        incidentNumber: 'INC-2026-0005',
        severity: 'MEDIUM',
      } as any);

      const req: any = {
        params: { id: 'inc-med-1' },
        user: { id: 'u1', email: 'cyberadmin@jcer.in' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.resendIncidentNotification(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('only supported for HIGH and CRITICAL');
    });

    it('should trigger notification and return 200 for CRITICAL incident', async () => {
      const mockIncident = {
        id: 'inc-crit-1',
        incidentNumber: 'INC-2026-0006',
        severity: 'CRITICAL',
        notificationStatus: 'PENDING',
      };
      jest.spyOn(SecurityIncident, 'findByPk').mockResolvedValue(mockIncident as any);
      jest.spyOn(notificationService, 'notifyIncidentAlert').mockResolvedValue(true);

      const req: any = {
        params: { id: 'inc-crit-1' },
        user: { id: 'u1', email: 'cyberadmin@jcer.in' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await agentShieldController.resendIncidentNotification(req, res, next);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Alert email notification queued');
    });
  });
});


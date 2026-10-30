import { Op } from 'sequelize';
import SecurityIncident, { IncidentSeverity, IncidentStatus } from '../../models/agentshield/SecurityIncident';
import SecurityEvent from '../../models/agentshield/SecurityEvent';
import logger from '../../utils/logger.util';

export interface CorrelateEventInput {
  category: string;
  ruleId: string;
  sourceIdentifier: string;
  targetResource: string;
  severity: IncidentSeverity;
  evidenceExplanation: string;
  recommendedSteps?: string[];
  responseActionTaken: string;
}

export class CorrelationService {
  private readonly CORRELATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes active correlation window

  /**
   * Generates monotonic human-readable incident identifiers: INC-YYYY-XXXX
   */
  private async generateIncidentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await SecurityIncident.count({
      where: {
        incidentNumber: {
          [Op.like]: `INC-${year}-%`,
        },
      },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `INC-${year}-${seq}`;
  }

  /**
   * Generates context-aware recommended investigation steps
   */
  private getDefaultRecommendedSteps(category: string, targetResource: string): string[] {
    switch (category) {
      case 'RECONNAISSANCE':
        return [
          'Review the source IP address in college network logs or NAT gateways.',
          'Verify if requests match automated security scanning tools (e.g., directory fuzzers).',
          'Inspect web server access logs for query string parameters or user agent signatures.',
          'Assess if temporary IP rate limiting is sufficient or if firewall rules are needed.',
        ];
      case 'ACCESS_CONTROL':
        return [
          'Verify if the authenticated user account was recently degraded or role was changed.',
          'Check if frontend client has stale tokens or is requesting decommissioned APIs.',
          'Ensure no horizontal privilege escalation is being attempted against student records.',
        ];
      case 'AUTHENTICATION':
        return [
          'Verify if the targeted account exists and whether it is an administrative or student account.',
          'Check for credential stuffing patterns across multiple accounts from the same source IP.',
          'If targeted account is administrative, recommend immediate password reset and MFA audit.',
        ];
      case 'DECEPTION':
        return [
          'High priority: Canary honeypot endpoint was probed. Zero legitimate ERP traffic exists for this route.',
          'Correlate the client IP with recent network sessions and examine reverse DNS.',
          'Immediately review other endpoints touched by this source in the last 60 minutes.',
          'Consider temporary connection throttling or blocking for this source IP.',
        ];
      case 'INJECTION':
        return [
          'Inspect the sanitized payload evidence for SQL syntax, script tags, or directory traversal.',
          'Confirm that backend ORM parameterization blocked the execution.',
          'Verify input validation boundaries on the targeted endpoint.',
        ];
      default:
        return [
          'Review associated security events in the AgentShield Security Center.',
          'Examine request headers, origin, and response codes.',
          'Record investigation notes and update incident status accordingly.',
        ];
    }
  }

  /**
   * Correlates a newly detected security event into an active incident or creates a new one
   */
  public async correlateEvent(input: CorrelateEventInput): Promise<SecurityIncident> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.CORRELATION_WINDOW_MS);

    // Look for an existing open incident matching the same sourceIdentifier & category within the correlation window
    let incident = await SecurityIncident.findOne({
      where: {
        sourceIdentifier: input.sourceIdentifier,
        category: input.category,
        status: {
          [Op.in]: ['NEW', 'INVESTIGATING'],
        },
        lastObservedAt: {
          [Op.gte]: windowStart,
        },
      },
      order: [['lastObservedAt', 'DESC']],
    });

    const severityRanks: Record<IncidentSeverity, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    if (incident) {
      // Update existing incident
      const currentRank = severityRanks[incident.severity] || 1;
      const newRank = severityRanks[input.severity] || 1;
      const escalatedSeverity = newRank > currentRank ? input.severity : incident.severity;

      incident.eventCount += 1;
      incident.lastObservedAt = now;
      incident.severity = escalatedSeverity;
      incident.evidenceSummary = `${incident.evidenceSummary}\n[${now.toISOString().slice(11, 19)}] ${input.evidenceExplanation}`;
      incident.responseActionTaken = input.responseActionTaken || incident.responseActionTaken;

      await incident.save();
      logger.info(`[AgentShield] Correlated event into existing incident ${incident.incidentNumber} (Event count: ${incident.eventCount})`);
      return incident;
    }

    // Create a new incident
    const incidentNumber = await this.generateIncidentNumber();
    const title = this.generateTitle(input.category, input.targetResource, input.severity);
    const recommendedSteps = input.recommendedSteps || this.getDefaultRecommendedSteps(input.category, input.targetResource);

    incident = await SecurityIncident.create({
      incidentNumber,
      title,
      category: input.category,
      severity: input.severity,
      status: 'NEW',
      firstObservedAt: now,
      lastObservedAt: now,
      eventCount: 1,
      sourceIdentifier: input.sourceIdentifier,
      targetResource: input.targetResource,
      evidenceSummary: `[${now.toISOString().slice(11, 19)}] ${input.evidenceExplanation}`,
      recommendedSteps,
      responseActionTaken: input.responseActionTaken,
      investigationNotes: [],
      resolutionSummary: null,
      resolvedAt: null,
      resolvedBy: null,
    });

    logger.warn(`[AgentShield] Created new security incident: ${incidentNumber} (${title}) [${input.severity}]`);
    return incident;
  }

  private generateTitle(category: string, targetResource: string, severity: IncidentSeverity): string {
    switch (category) {
      case 'RECONNAISSANCE':
        return `Sequential Route Scanning & Probing (${targetResource})`;
      case 'ACCESS_CONTROL':
        return `Repeated Unauthorized Endpoint Access (${targetResource})`;
      case 'AUTHENTICATION':
        return `Repeated Authentication Failures / Potential Brute Force`;
      case 'DECEPTION':
        return `CRITICAL Canary Honeypot Triggered (${targetResource})`;
      case 'INJECTION':
        return `Suspicious Syntax & Injection Probe (${targetResource})`;
      case 'DOS_THROTTLE':
        return `Abnormal Request Rate Burst (${targetResource})`;
      default:
        return `Security Anomaly Detected on ${targetResource}`;
    }
  }
}

export const correlationService = new CorrelationService();
export default correlationService;

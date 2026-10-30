import { Op } from 'sequelize';
import sequelize from '../../config/database';
import SecurityEvent, { EventResponseAction, EventRiskLevel } from '../../models/agentshield/SecurityEvent';
import SecurityIncident, { IncidentSeverity } from '../../models/agentshield/SecurityIncident';
import DetectionRule from '../../models/agentshield/DetectionRule';
import rulesService from './rules.service';
import riskService from './risk.service';
import correlationService from './correlation.service';
import responseService from './response.service';
import realtimeService from './realtime.service';
import logger from '../../utils/logger.util';

export interface SecuritySignal {
  timestamp: Date;
  method: string;
  route: string;
  statusCode: number;
  role: string;
  userId?: string | null;
  clientIp: string;
  correlationId: string;
  userAgent?: string | null;
  query?: Record<string, any>;
  isHoneypot?: boolean;
  failedAuthAttempt?: boolean;
}

interface WindowRecord {
  timestamp: number;
  route: string;
  statusCode: number;
}

export class AgentShieldEngine {
  // Sliding memory windows keyed by clientIp or source identifier
  private routeProbingWindows: Map<string, WindowRecord[]> = new Map();
  private unauthorizedWindows: Map<string, WindowRecord[]> = new Map();
  private authFailureWindows: Map<string, WindowRecord[]> = new Map();
  private rateBurstWindows: Map<string, number[]> = new Map();

  private isInitialized = false;
  private lastProcessedTimestamp: Date | null = null;
  private totalEventsProcessed = 0;
  private totalViolationsDetected = 0;

  /**
   * Initializes AgentShield Engine
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('[AgentShield Engine] Initializing security monitoring subsystem...');
      await rulesService.seedDefaultRules();
      this.isInitialized = true;
      logger.info('[AgentShield Engine] Engine successfully initialized and active.');

      // Periodically prune stale in-memory sliding windows every 2 minutes
      setInterval(() => this.pruneStaleWindows(), 2 * 60 * 1000);
    } catch (err: any) {
      logger.error('[AgentShield Engine] Failed to initialize engine:', err);
    }
  }

  /**
   * Evaluates an incoming completed HTTP request signal
   */
  public async processSignal(signal: SecuritySignal): Promise<void> {
    if (!this.isInitialized) return;
    this.totalEventsProcessed++;
    this.lastProcessedTimestamp = new Date();

    const now = Date.now();
    const clientKey = signal.clientIp;

    try {
      // ── CHECK 1: Honeypot Trigger ──
      if (signal.isHoneypot) {
        await this.handleRuleTrigger(signal, 'RULE_HONEYPOT', {
          count: 1,
          threshold: 1,
          windowSeconds: 300,
          isHoneypot: true,
          targetPath: signal.route,
          clientIp: signal.clientIp,
          category: 'DECEPTION',
        });
        return;
      }

      // ── CHECK 2: Malicious Query / Injection Syntax ──
      const suspiciousPayloadDetected = this.detectSuspiciousPayload(signal);
      if (suspiciousPayloadDetected) {
        await this.handleRuleTrigger(signal, 'RULE_SUSPICIOUS_PAYLOAD', {
          count: 1,
          threshold: 1,
          windowSeconds: 60,
          targetPath: signal.route,
          clientIp: signal.clientIp,
          category: 'INJECTION',
          customDetails: { pattern: suspiciousPayloadDetected },
        });
        return;
      }

      // ── CHECK 3: Authentication Failures ──
      if (signal.failedAuthAttempt || (signal.route.includes('/auth/login') && signal.statusCode === 401)) {
        const failureList = this.authFailureWindows.get(clientKey) || [];
        failureList.push({ timestamp: now, route: signal.route, statusCode: signal.statusCode });
        this.authFailureWindows.set(clientKey, failureList);

        const rule = await rulesService.getRuleById('RULE_AUTH_FAILURE');
        if (rule && rule.enabled) {
          const windowMs = rule.observationWindowSeconds * 1000;
          const recent = failureList.filter((r) => now - r.timestamp <= windowMs);
          this.authFailureWindows.set(clientKey, recent);

          if (recent.length >= rule.threshold) {
            await this.handleRuleTrigger(signal, 'RULE_AUTH_FAILURE', {
              count: recent.length,
              threshold: rule.threshold,
              windowSeconds: rule.observationWindowSeconds,
              targetPath: signal.route,
              clientIp: signal.clientIp,
              category: 'AUTHENTICATION',
            });
          }
        }
      }

      // ── CHECK 4: Route Probing (404s) ──
      if (signal.statusCode === 404) {
        const probeList = this.routeProbingWindows.get(clientKey) || [];
        probeList.push({ timestamp: now, route: signal.route, statusCode: signal.statusCode });
        this.routeProbingWindows.set(clientKey, probeList);

        const rule = await rulesService.getRuleById('RULE_ROUTE_PROBING');
        if (rule && rule.enabled) {
          const windowMs = rule.observationWindowSeconds * 1000;
          const recent = probeList.filter((r) => now - r.timestamp <= windowMs);
          this.routeProbingWindows.set(clientKey, recent);

          const distinctRoutes = new Set(recent.map((r) => r.route)).size;
          const minDistinct = rule.config?.minDistinctRoutes || 2;

          // Never flag a single ordinary 404; require threshold and distinct non-existent routes
          if (recent.length >= rule.threshold && distinctRoutes >= minDistinct) {
            await this.handleRuleTrigger(signal, 'RULE_ROUTE_PROBING', {
              count: recent.length,
              threshold: rule.threshold,
              windowSeconds: rule.observationWindowSeconds,
              distinctRoutesCount: distinctRoutes,
              targetPath: signal.route,
              clientIp: signal.clientIp,
              category: 'RECONNAISSANCE',
            });
          }
        }
      }

      // ── CHECK 5: Repeated Unauthorized Access (401 / 403 on protected routes) ──
      if ((signal.statusCode === 401 || signal.statusCode === 403) && !signal.route.includes('/auth/login')) {
        const unauthList = this.unauthorizedWindows.get(clientKey) || [];
        unauthList.push({ timestamp: now, route: signal.route, statusCode: signal.statusCode });
        this.unauthorizedWindows.set(clientKey, unauthList);

        const rule = await rulesService.getRuleById('RULE_UNAUTHORIZED_ACCESS');
        if (rule && rule.enabled) {
          const windowMs = rule.observationWindowSeconds * 1000;
          const recent = unauthList.filter((r) => now - r.timestamp <= windowMs);
          this.unauthorizedWindows.set(clientKey, recent);

          if (recent.length >= rule.threshold) {
            await this.handleRuleTrigger(signal, 'RULE_UNAUTHORIZED_ACCESS', {
              count: recent.length,
              threshold: rule.threshold,
              windowSeconds: rule.observationWindowSeconds,
              statusCode: signal.statusCode,
              targetPath: signal.route,
              clientIp: signal.clientIp,
              category: 'ACCESS_CONTROL',
            });
          }
        }
      }

      // ── CHECK 6: Abnormal Request Rate Burst ──
      const burstList = this.rateBurstWindows.get(clientKey) || [];
      burstList.push(now);
      this.rateBurstWindows.set(clientKey, burstList);

      const rateRule = await rulesService.getRuleById('RULE_RATE_ANOMALY');
      if (rateRule && rateRule.enabled) {
        const windowMs = rateRule.observationWindowSeconds * 1000;
        const recent = burstList.filter((t) => now - t <= windowMs);
        this.rateBurstWindows.set(clientKey, recent);

        if (recent.length >= rateRule.threshold) {
          await this.handleRuleTrigger(signal, 'RULE_RATE_ANOMALY', {
            count: recent.length,
            threshold: rateRule.threshold,
            windowSeconds: rateRule.observationWindowSeconds,
            targetPath: signal.route,
            clientIp: signal.clientIp,
            category: 'DOS_THROTTLE',
          });
        }
      }
    } catch (err: any) {
      logger.error('[AgentShield Engine] Signal processing error:', err);
    }
  }

  /**
   * Handles when an actual detection rule threshold is satisfied
   */
  private async handleRuleTrigger(
    signal: SecuritySignal,
    ruleId: string,
    evalContext: any
  ): Promise<void> {
    this.totalViolationsDetected++;
    const rule = await rulesService.getRuleById(ruleId);
    if (!rule || !rule.enabled) return;

    // 1. Calculate risk
    const risk = riskService.evaluateRisk({
      ...evalContext,
      ruleId,
      category: rule.category,
    });

    // 2. Correlate with active incident
    const incident = await correlationService.correlateEvent({
      category: rule.category,
      ruleId,
      sourceIdentifier: signal.userId
        ? `${signal.clientIp} [User: ${signal.userId}]`
        : signal.clientIp,
      targetResource: signal.route,
      severity: risk.riskLevel as IncidentSeverity,
      evidenceExplanation: risk.explanation,
      responseActionTaken: rule.responsePolicy,
    });

    // 3. Determine and execute proportionate response action
    let responseAction: EventResponseAction = 'MONITOR';
    if (rule.responsePolicy === 'RATE_LIMIT') {
      responseService.applyProtectiveAction(signal.clientIp, ruleId, 'RATE_LIMIT', 300);
      responseAction = 'RATE_LIMITED';
    } else if (rule.responsePolicy === 'BLOCK') {
      responseService.applyProtectiveAction(signal.clientIp, ruleId, 'BLOCK', 600);
      responseAction = 'BLOCKED';
    } else if (ruleId === 'RULE_HONEYPOT') {
      responseService.applyProtectiveAction(signal.clientIp, ruleId, 'BLOCK', 600);
      responseAction = 'HONEYPOT_TRIGGER';
    }

    // 4. Persist SecurityEvent
    const event = await SecurityEvent.create({
      timestamp: signal.timestamp,
      method: signal.method,
      route: signal.route,
      statusCode: signal.statusCode,
      role: signal.role || 'ANONYMOUS',
      userId: signal.userId || null,
      clientIp: signal.clientIp,
      correlationId: signal.correlationId,
      ruleId: rule.id,
      category: rule.category,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      evidence: {
        explanation: risk.explanation,
        factors: risk.factors,
        customDetails: evalContext.customDetails || {},
      },
      responseAction,
      incidentId: incident.id,
      userAgent: signal.userAgent || null,
    });

    // 5. Update rule's lastTriggeredAt
    await rule.update({ lastTriggeredAt: new Date() }).catch(() => {});

    // 6. Real-time broadcast to connected SOC CyberAdmins
    realtimeService.broadcastEvent(event.toJSON());
    realtimeService.broadcastIncident(incident.toJSON());

    logger.warn(`[AgentShield Alert] ${rule.name} triggered by ${signal.clientIp} on ${signal.route} [${risk.riskLevel} / Score: ${risk.riskScore}]`);
  }

  /**
   * Helper to detect path traversal or common injection sequences in query parameters or URL
   */
  private detectSuspiciousPayload(signal: SecuritySignal): string | null {
    const rawTarget = `${signal.route} ${JSON.stringify(signal.query || {})}`;
    
    // Directory traversal
    if (rawTarget.includes('..') || rawTarget.includes('%2e%2e') || rawTarget.includes('..\\')) {
      return 'Directory traversal sequence (../ or ..\\)';
    }

    // Script injection
    if (/<script/i.test(rawTarget) || /javascript:/i.test(rawTarget) || /onerror\s*=/i.test(rawTarget)) {
      return 'Embedded HTML script execution pattern (<script or javascript:)';
    }

    // Obvious SQL injection signatures (deliberate syntax probes)
    if (
      /(union\s+all\s+select|union\s+select)/i.test(rawTarget) ||
      /'\s+or\s+'1'='1/i.test(rawTarget) ||
      /"\s+or\s+"1"="1/i.test(rawTarget) ||
      /;\s*drop\s+table/i.test(rawTarget)
    ) {
      return 'SQL injection syntax fragment (UNION SELECT / OR 1=1)';
    }

    return null;
  }

  /**
   * Prune sliding window maps to keep memory strictly bounded
   */
  private pruneStaleWindows(): void {
    const now = Date.now();
    const maxWindowMs = 10 * 60 * 1000; // 10 minutes

    Array.from(this.routeProbingWindows.entries()).forEach(([ip, records]) => {
      const active = records.filter((r) => now - r.timestamp <= maxWindowMs);
      if (active.length === 0) this.routeProbingWindows.delete(ip);
      else this.routeProbingWindows.set(ip, active);
    });

    Array.from(this.unauthorizedWindows.entries()).forEach(([ip, records]) => {
      const active = records.filter((r) => now - r.timestamp <= maxWindowMs);
      if (active.length === 0) this.unauthorizedWindows.delete(ip);
      else this.unauthorizedWindows.set(ip, active);
    });

    Array.from(this.authFailureWindows.entries()).forEach(([ip, records]) => {
      const active = records.filter((r) => now - r.timestamp <= maxWindowMs);
      if (active.length === 0) this.authFailureWindows.delete(ip);
      else this.authFailureWindows.set(ip, active);
    });

    Array.from(this.rateBurstWindows.entries()).forEach(([ip, timestamps]) => {
      const active = timestamps.filter((t) => now - t <= 60000);
      if (active.length === 0) this.rateBurstWindows.delete(ip);
      else this.rateBurstWindows.set(ip, active);
    });
  }

  /**
   * Health and runtime diagnostics for CyberAdmin
   */
  public async getHealthDiagnostics(): Promise<any> {
    let dbStatus = 'DISCONNECTED';
    let dbLatencyMs = -1;

    try {
      const start = Date.now();
      await sequelize.query('SELECT 1');
      dbLatencyMs = Date.now() - start;
      dbStatus = 'CONNECTED';
    } catch {
      dbStatus = 'FAILED';
    }

    const rules = await rulesService.getAllRules();
    const activeIncidents = await SecurityIncident.count({
      where: { status: { [Op.in]: ['NEW', 'INVESTIGATING'] } },
    });

    return {
      status: this.isInitialized && dbStatus === 'CONNECTED' ? 'HEALTHY' : 'DEGRADED',
      engineInitialized: this.isInitialized,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      monitoring: {
        rulesLoaded: rules.length,
        rulesEnabled: rules.filter((r) => r.enabled).length,
        activeIncidents,
        totalEventsProcessed: this.totalEventsProcessed,
        totalViolationsDetected: this.totalViolationsDetected,
        lastProcessedEventAt: this.lastProcessedTimestamp ? this.lastProcessedTimestamp.toISOString() : null,
        activeRestrictionsCount: responseService.getActiveRestrictions().length,
      },
      telemetry: {
        connectedSocSubscribers: realtimeService.getConnectedAdminsCount(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Aggregates Security Overview metrics
   */
  public async getOverviewMetrics(): Promise<any> {
    const now = new Date();
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const openIncidents = await SecurityIncident.count({
      where: { status: { [Op.in]: ['NEW', 'INVESTIGATING'] } },
    });

    const criticalIncidents = await SecurityIncident.count({
      where: {
        status: { [Op.in]: ['NEW', 'INVESTIGATING'] },
        severity: 'CRITICAL',
      },
    });

    const highIncidents = await SecurityIncident.count({
      where: {
        status: { [Op.in]: ['NEW', 'INVESTIGATING'] },
        severity: 'HIGH',
      },
    });

    const recentEventsCount = await SecurityEvent.count({
      where: {
        timestamp: { [Op.gte]: past24h },
      },
    });

    const blockedRequestsCount = await SecurityEvent.count({
      where: {
        timestamp: { [Op.gte]: past24h },
        responseAction: { [Op.in]: ['RATE_LIMITED', 'BLOCKED', 'HONEYPOT_TRIGGER'] },
      },
    });

    const latestEvent = await SecurityEvent.findOne({
      order: [['timestamp', 'DESC']],
    });

    const activeRestrictions = responseService.getActiveRestrictions();

    // 24-hour event timeline breakdown (hourly counts)
    const rawHourly = await SecurityEvent.findAll({
      attributes: [
        [sequelize.fn('date_trunc', 'hour', sequelize.col('timestamp')), 'hour'],
        [sequelize.fn('count', sequelize.col('id')), 'count'],
        'riskLevel',
      ],
      where: { timestamp: { [Op.gte]: past24h } },
      group: [sequelize.fn('date_trunc', 'hour', sequelize.col('timestamp')), 'riskLevel'],
      order: [[sequelize.fn('date_trunc', 'hour', sequelize.col('timestamp')), 'ASC']],
      raw: true,
    });

    return {
      openIncidents,
      criticalIncidents,
      highIncidents,
      recentEventsCount,
      blockedRequestsCount,
      activeRestrictionsCount: activeRestrictions.length,
      latestEventTimestamp: latestEvent ? latestEvent.timestamp.toISOString() : null,
      hourlyTrend: rawHourly,
      isEngineHealthy: this.isInitialized,
    };
  }
}

export const agentShieldEngine = new AgentShieldEngine();
export default agentShieldEngine;

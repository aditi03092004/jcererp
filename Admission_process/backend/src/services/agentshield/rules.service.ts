import DetectionRule, { DetectionRuleAttributes, RuleRiskLevel, RuleResponsePolicy } from '../../models/agentshield/DetectionRule';
import SecurityAuditLog from '../../models/agentshield/SecurityAuditLog';
import logger from '../../utils/logger.util';

export const DEFAULT_DETECTION_RULES: Partial<DetectionRuleAttributes>[] = [
  {
    id: 'RULE_ROUTE_PROBING',
    name: 'Sequential Route Probing & Scanning',
    description: 'Detects repeated requests to non-existent or hidden endpoints within a short sliding window, characteristic of automated vulnerability scanners (e.g. dirbuster, ffuf).',
    category: 'RECONNAISSANCE',
    enabled: true,
    threshold: 4,
    observationWindowSeconds: 60,
    riskLevel: 'HIGH',
    responsePolicy: 'RATE_LIMIT',
    config: {
      matchStatusCodes: [404],
      minDistinctRoutes: 3,
    },
  },
  {
    id: 'RULE_UNAUTHORIZED_ACCESS',
    name: 'Repeated Unauthorized Endpoint Probing',
    description: 'Detects repeated attempts to access privileged or restricted institutional endpoints resulting in HTTP 401 Unauthorized or 403 Forbidden.',
    category: 'ACCESS_CONTROL',
    enabled: true,
    threshold: 5,
    observationWindowSeconds: 60,
    riskLevel: 'MEDIUM',
    responsePolicy: 'MONITOR',
    config: {
      matchStatusCodes: [401, 403],
    },
  },
  {
    id: 'RULE_AUTH_FAILURE',
    name: 'Credential Stuffing & Repeated Login Failures',
    description: 'Detects repeated invalid login attempts against ERP authentication endpoints, indicating potential brute-force or credential stuffing attacks.',
    category: 'AUTHENTICATION',
    enabled: true,
    threshold: 5,
    observationWindowSeconds: 120,
    riskLevel: 'HIGH',
    responsePolicy: 'RATE_LIMIT',
    config: {
      targetEndpoints: ['/api/auth/login', '/api/v1/auth/login', '/auth/login'],
      minFailedAttempts: 5,
    },
  },
  {
    id: 'RULE_HONEYPOT',
    name: 'Decoy Administrative Honeypot Trigger',
    description: 'Immediate detection of requests accessing deceptive canary routes designed to trap unauthorized reconnaissance. Harmlessly returns 404 to attacker while recording high-priority alert.',
    category: 'DECEPTION',
    enabled: true,
    threshold: 1,
    observationWindowSeconds: 300,
    riskLevel: 'CRITICAL',
    responsePolicy: 'BLOCK',
    config: {
      canaryRoutes: [
        '/api/v1/system/debug-internal-keys',
        '/api/system/debug-internal-keys',
        '/api/v1/admin/internal-export',
        '/api/admin/internal-export',
        '/api/v1/dev/database-dump',
      ],
    },
  },
  {
    id: 'RULE_RATE_ANOMALY',
    name: 'Abnormal Request Burst Anomaly',
    description: 'Detects abnormal request rate spikes targeting sensitive API endpoints that exceed safe thresholds, accounting for campus NAT and shared networks.',
    category: 'DOS_THROTTLE',
    enabled: true,
    threshold: 45,
    observationWindowSeconds: 15,
    riskLevel: 'MEDIUM',
    responsePolicy: 'RATE_LIMIT',
    config: {
      burstThresholdPerSecond: 6,
    },
  },
  {
    id: 'RULE_SUSPICIOUS_PAYLOAD',
    name: 'Malicious Query & Syntax Injection Probing',
    description: 'Detects directory traversal patterns (e.g. ../, ..\\), SQL injection constructs (e.g. UNION SELECT, 1=1--), and executable script tags in query strings or request headers.',
    category: 'INJECTION',
    enabled: true,
    threshold: 2,
    observationWindowSeconds: 60,
    riskLevel: 'HIGH',
    responsePolicy: 'BLOCK',
    config: {
      patterns: [
        '(\\.\\./|\\.\\.\\\\)',
        '(union\\s+select|select\\s+.*\\s+from|insert\\s+into|drop\\s+table)',
        '(<script|javascript:|onerror\\s*=)',
        '(/etc/passwd|/windows/win.ini|cmd\\.exe|/bin/sh)',
      ],
    },
  },
];

class RulesService {
  private inMemoryCache: Map<string, DetectionRule> = new Map();
  private lastCacheRefresh: number = 0;
  private readonly CACHE_TTL_MS = 30000; // 30 seconds

  /**
   * Idempotently seeds default detection rules in PostgreSQL
   */
  public async seedDefaultRules(): Promise<void> {
    try {
      for (const ruleDef of DEFAULT_DETECTION_RULES) {
        const existing = await DetectionRule.findByPk(ruleDef.id!);
        if (!existing) {
          await DetectionRule.create(ruleDef as any);
          logger.info(`[AgentShield] Seeded default detection rule: ${ruleDef.id}`);
        }
      }
      await this.refreshCache(true);
    } catch (err: any) {
      logger.error('[AgentShield] Failed to seed default detection rules:', err);
    }
  }

  /**
   * Fetch all detection rules
   */
  public async getAllRules(): Promise<DetectionRule[]> {
    await this.refreshCache();
    return Array.from(this.inMemoryCache.values());
  }

  /**
   * Fetch single rule by ID
   */
  public async getRuleById(id: string): Promise<DetectionRule | null> {
    await this.refreshCache();
    return this.inMemoryCache.get(id) || null;
  }

  /**
   * Refresh in-memory rule cache
   */
  public async refreshCache(force: boolean = false): Promise<void> {
    const now = Date.now();
    if (!force && this.inMemoryCache.size > 0 && now - this.lastCacheRefresh < this.CACHE_TTL_MS) {
      return;
    }

    try {
      const rules = await DetectionRule.findAll();
      this.inMemoryCache.clear();
      for (const rule of rules) {
        this.inMemoryCache.set(rule.id, rule);
      }
      this.lastCacheRefresh = now;
    } catch (err) {
      logger.warn('[AgentShield] Failed to refresh rule cache from DB:', err);
    }
  }

  /**
   * Updates a detection rule with safe bounds validation and security audit logging
   */
  public async updateRule(
    id: string,
    updates: {
      enabled?: boolean;
      threshold?: number;
      observationWindowSeconds?: number;
      riskLevel?: RuleRiskLevel;
      responsePolicy?: RuleResponsePolicy;
      description?: string;
    },
    actor: { id: string; email: string; ipAddress?: string }
  ): Promise<DetectionRule> {
    const rule = await DetectionRule.findByPk(id);
    if (!rule) {
      throw new Error(`Detection rule '${id}' not found.`);
    }

    // Defensive validation bounds:
    if (updates.threshold !== undefined && (updates.threshold < 1 || updates.threshold > 10000)) {
      throw new Error('Rule threshold must be between 1 and 10,000.');
    }
    if (updates.observationWindowSeconds !== undefined && (updates.observationWindowSeconds < 5 || updates.observationWindowSeconds > 86400)) {
      throw new Error('Observation window must be between 5 seconds and 86,400 seconds (24 hours).');
    }

    const previousState = rule.toJSON();

    if (updates.enabled !== undefined) rule.enabled = updates.enabled;
    if (updates.threshold !== undefined) rule.threshold = updates.threshold;
    if (updates.observationWindowSeconds !== undefined) rule.observationWindowSeconds = updates.observationWindowSeconds;
    if (updates.riskLevel !== undefined) rule.riskLevel = updates.riskLevel;
    if (updates.responsePolicy !== undefined) rule.responsePolicy = updates.responsePolicy;
    if (updates.description !== undefined) rule.description = updates.description.trim();
    rule.updatedBy = actor.email;

    await rule.save();
    this.inMemoryCache.set(rule.id, rule);

    // Audit log
    await SecurityAuditLog.create({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'UPDATE_DETECTION_RULE',
      targetType: 'RULE',
      targetId: rule.id,
      previousState,
      newState: rule.toJSON(),
      ipAddress: actor.ipAddress || null,
      timestamp: new Date(),
      details: { ruleId: rule.id, updatedFields: Object.keys(updates) },
    }).catch((err) => logger.error('[AgentShield] Failed to write audit log for rule update:', err));

    return rule;
  }
}

export const rulesService = new RulesService();
export default rulesService;

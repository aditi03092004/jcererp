import { EventRiskLevel } from '../../models/agentshield/SecurityEvent';

export interface RiskEvaluationInput {
  ruleId: string;
  category: string;
  count: number;
  threshold: number;
  windowSeconds: number;
  distinctRoutesCount?: number;
  isHoneypot?: boolean;
  statusCode?: number;
  targetPath: string;
  clientIp: string;
  role?: string;
  customDetails?: Record<string, any>;
}

export interface RiskEvaluationResult {
  riskScore: number; // 0 - 100
  riskLevel: EventRiskLevel;
  explanation: string;
  factors: string[];
}

export class RiskService {
  /**
   * Transparently scores and explains risk based on observable telemetry and configured thresholds
   */
  public evaluateRisk(input: RiskEvaluationInput): RiskEvaluationResult {
    const factors: string[] = [];
    let score = 15; // baseline

    // Factor 1: Honeypot canary trigger
    if (input.isHoneypot || input.ruleId === 'RULE_HONEYPOT') {
      score = 98;
      factors.push(`Direct probe to non-routable decoy honeypot endpoint: ${input.targetPath}`);
      return {
        riskScore: score,
        riskLevel: 'CRITICAL',
        explanation: `Critical risk: Client probed decoy canary resource '${input.targetPath}'. Honeypot endpoints have zero legitimate traffic in production ERP.`,
        factors,
      };
    }

    // Factor 2: Suspicious payload or injection strings
    if (input.ruleId === 'RULE_SUSPICIOUS_PAYLOAD') {
      score = Math.min(95, 60 + input.count * 15);
      factors.push(`Path traversal or injection sequence detected in parameters targeting ${input.targetPath}`);
      const level: EventRiskLevel = score >= 85 ? 'CRITICAL' : score >= 65 ? 'HIGH' : 'MEDIUM';
      return {
        riskScore: score,
        riskLevel: level,
        explanation: `${level} risk: ${input.count} malformed or injection-like request pattern(s) detected targeting '${input.targetPath}' within ${input.windowSeconds}s.`,
        factors,
      };
    }

    // Factor 3: Route probing (404 directory scanning)
    if (input.ruleId === 'RULE_ROUTE_PROBING') {
      const distinct = input.distinctRoutesCount || 1;
      const ratio = input.count / Math.max(input.threshold, 1);
      score = Math.min(90, Math.floor(40 + ratio * 25 + distinct * 4));
      factors.push(`${input.count} requests to ${distinct} distinct nonexistent endpoint(s) within ${input.windowSeconds}s`);

      const level: EventRiskLevel = score >= 75 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
      return {
        riskScore: score,
        riskLevel: level,
        explanation: `${level} risk: Sequential route probing detected. ${input.count} requests to ${distinct} non-existent endpoint(s) (threshold: ${input.threshold}) from observed source within ${input.windowSeconds}s.`,
        factors,
      };
    }

    // Factor 4: Credential stuffing / Repeated auth failures
    if (input.ruleId === 'RULE_AUTH_FAILURE') {
      const ratio = input.count / Math.max(input.threshold, 1);
      score = Math.min(95, Math.floor(50 + ratio * 20));
      factors.push(`${input.count} consecutive failed login attempts within ${input.windowSeconds}s`);

      const level: EventRiskLevel = score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
      return {
        riskScore: score,
        riskLevel: level,
        explanation: `${level} risk: Repeated authentication failures. ${input.count} invalid login attempts observed against authentication endpoint within ${input.windowSeconds}s.`,
        factors,
      };
    }

    // Factor 5: Repeated Unauthorized Access (401/403)
    if (input.ruleId === 'RULE_UNAUTHORIZED_ACCESS') {
      const ratio = input.count / Math.max(input.threshold, 1);
      score = Math.min(85, Math.floor(35 + ratio * 20));
      factors.push(`${input.count} unauthorized or forbidden requests (HTTP ${input.statusCode || '401/403'}) to ${input.targetPath}`);

      const level: EventRiskLevel = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
      return {
        riskScore: score,
        riskLevel: level,
        explanation: `${level} risk: Repeated access violations. ${input.count} denied request(s) to protected resource '${input.targetPath}' within ${input.windowSeconds}s.`,
        factors,
      };
    }

    // Factor 6: Rate Anomaly
    if (input.ruleId === 'RULE_RATE_ANOMALY') {
      const ratio = input.count / Math.max(input.threshold, 1);
      score = Math.min(80, Math.floor(30 + ratio * 25));
      factors.push(`Traffic volume surge: ${input.count} requests within ${input.windowSeconds}s`);

      const level: EventRiskLevel = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
      return {
        riskScore: score,
        riskLevel: level,
        explanation: `${level} risk: Request rate surge detected. Observed ${input.count} requests targeting '${input.targetPath}' within ${input.windowSeconds}s window (threshold: ${input.threshold}).`,
        factors,
      };
    }

    // Generic fallback
    return {
      riskScore: 30,
      riskLevel: 'LOW',
      explanation: `Low risk: Routine observation for ${input.ruleId} on ${input.targetPath}.`,
      factors: [`Event count: ${input.count}`],
    };
  }
}

export const riskService = new RiskService();
export default riskService;

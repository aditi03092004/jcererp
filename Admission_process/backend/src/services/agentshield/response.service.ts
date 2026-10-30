import logger from '../../utils/logger.util';
import SecurityAuditLog from '../../models/agentshield/SecurityAuditLog';
import { RuleResponsePolicy } from '../../models/agentshield/DetectionRule';

export interface ActiveRestriction {
  clientIp: string;
  reason: string;
  ruleId: string;
  restrictedAt: Date;
  expiresAt: Date;
  policy: RuleResponsePolicy;
  hitCount: number;
}

export class ResponseService {
  // In-memory sliding tracker for temporary rate restrictions / blocks
  private temporaryRestrictions: Map<string, ActiveRestriction> = new Map();

  /**
   * Checks whether a client IP is currently subject to an active temporary restriction
   */
  public isSourceRestricted(clientIp: string): { restricted: boolean; reason?: string; retryAfterSeconds?: number; policy?: RuleResponsePolicy } {
    const record = this.temporaryRestrictions.get(clientIp);
    if (!record) {
      return { restricted: false };
    }

    const now = Date.now();
    if (now >= record.expiresAt.getTime()) {
      // Restriction has naturally expired
      this.temporaryRestrictions.delete(clientIp);
      return { restricted: false };
    }

    record.hitCount += 1;
    const retryAfterSeconds = Math.ceil((record.expiresAt.getTime() - now) / 1000);
    return {
      restricted: true,
      reason: record.reason,
      retryAfterSeconds,
      policy: record.policy,
    };
  }

  /**
   * Applies a proportionate, temporary, reversible protective response
   */
  public applyProtectiveAction(
    clientIp: string,
    ruleId: string,
    policy: RuleResponsePolicy,
    durationSeconds: number = 300 // default 5 minutes
  ): { actionApplied: string; durationSeconds: number } {
    if (policy === 'MONITOR') {
      return { actionApplied: 'MONITOR_ONLY', durationSeconds: 0 };
    }

    // Safety guard: Never block localhost or known institutional loopbacks permanently
    const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost';
    const effectiveDuration = isLoopback ? Math.min(durationSeconds, 30) : durationSeconds;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + effectiveDuration * 1000);

    const existing = this.temporaryRestrictions.get(clientIp);
    const hitCount = existing ? existing.hitCount + 1 : 1;

    this.temporaryRestrictions.set(clientIp, {
      clientIp,
      reason: `Automated protective response triggered by ${ruleId} (${policy})`,
      ruleId,
      restrictedAt: now,
      expiresAt,
      policy,
      hitCount,
    });

    logger.warn(`[AgentShield Response] Applied ${policy} to source ${clientIp} for ${effectiveDuration}s (Rule: ${ruleId})`);
    return { actionApplied: policy, durationSeconds: effectiveDuration };
  }

  /**
   * Returns a list of all currently active temporary restrictions
   */
  public getActiveRestrictions(): ActiveRestriction[] {
    const now = Date.now();
    const active: ActiveRestriction[] = [];
    Array.from(this.temporaryRestrictions.entries()).forEach(([ip, item]) => {
      if (now < item.expiresAt.getTime()) {
        active.push(item);
      } else {
        this.temporaryRestrictions.delete(ip);
      }
    });
    return active;
  }

  /**
   * Manually lifts an active restriction (CyberAdmin action)
   */
  public async liftRestriction(
    clientIp: string,
    actor: { id: string; email: string; ipAddress?: string }
  ): Promise<boolean> {
    const existing = this.temporaryRestrictions.get(clientIp);
    if (!existing) return false;

    this.temporaryRestrictions.delete(clientIp);

    await SecurityAuditLog.create({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'LIFT_IP_RESTRICTION',
      targetType: 'CLIENT_IP',
      targetId: clientIp,
      previousState: existing as any,
      newState: null,
      ipAddress: actor.ipAddress || null,
      timestamp: new Date(),
      details: { clientIp, liftedReason: 'Manual administrative intervention by CyberAdmin' },
    }).catch((err) => logger.error('[AgentShield] Failed to audit restriction lift:', err));

    logger.info(`[AgentShield Response] Restriction for ${clientIp} manually lifted by ${actor.email}`);
    return true;
  }
}

export const responseService = new ResponseService();
export default responseService;

import { Request, Response, NextFunction } from 'express';
import agentShieldEngine, { SecuritySignal } from '../services/agentshield/engine.service';
import responseService from '../services/agentshield/response.service';
import { AuthenticatedRequest } from './auth.middleware';
import { verifyToken } from '../utils/jwt.util';

// Designated non-destructive canary honeypot endpoints
const HONEYPOT_ROUTES = new Set([
  '/api/v1/system/debug-internal-keys',
  '/api/system/debug-internal-keys',
  '/api/v1/admin/internal-export',
  '/api/admin/internal-export',
  '/api/v1/dev/database-dump',
  '/system/debug-internal-keys',
]);

/**
 * Extracts and sanitizes client IP using trusted proxy rules and IPv4 normalization
 */
export function getClientIp(req: Request): string {
  // Respect express trust proxy configuration
  let ip = req.ip;

  if (!ip) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const first = forwarded.split(',')[0].trim();
      if (first) ip = first;
    }
  }

  if (!ip) {
    ip = req.socket?.remoteAddress || '127.0.0.1';
  }

  // Strip IPv6-mapped IPv4 prefix (::ffff:)
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  return ip || '127.0.0.1';
}

/**
 * Sanitizes query parameters by stripping sensitive keys
 */
export function sanitizeQuery(query: any): Record<string, any> {
  if (!query || typeof query !== 'object') return {};
  const sanitized: Record<string, any> = {};
  const sensitiveKeys = new Set(['password', 'token', 'secret', 'otp', 'code', 'auth', 'apikey', 'key']);

  for (const [k, v] of Object.entries(query)) {
    if (sensitiveKeys.has(k.toLowerCase())) {
      sanitized[k] = '[REDACTED]';
    } else {
      sanitized[k] = typeof v === 'string' ? v.slice(0, 200) : v;
    }
  }
  return sanitized;
}

/**
 * AgentShield Real-Time Request Monitoring & Defensive Middleware
 */
export const agentShieldMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const normalizedPath = (req.originalUrl || req.path || '').toLowerCase();

  // Fast path OPTIONS preflight, static assets, and AgentShield administrative SOC management
  if (
    req.method === 'OPTIONS' ||
    req.path.startsWith('/uploads/') ||
    normalizedPath.startsWith('/api/v1/agentshield') ||
    normalizedPath.startsWith('/api/agentshield')
  ) {
    return next();
  }

  const clientIp = getClientIp(req);

  // Extract caller user ID if valid JWT is present to evaluate campus NAT exemptions safely
  let callerUserId: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded: any = verifyToken(authHeader.split(' ')[1]);
      if (decoded && decoded.id) {
        callerUserId = decoded.id;
      }
    } catch {
      // Invalid/expired token - treated as unauthenticated
    }
  }

  // ── 1. ACTIVE DEFENSIVE RESTRICTION CHECK ──
  const restriction = responseService.isSourceRestricted(clientIp, callerUserId);
  if (restriction.restricted) {
    res.setHeader('Retry-After', String(restriction.retryAfterSeconds || 60));
    res.setHeader('X-AgentShield-Action', restriction.policy || 'RATE_LIMITED');

    res.status(429).json({
      success: false,
      errorCode: 'AGENTSHIELD_RESTRICTED',
      error: 'Too Many Suspicious Requests. Temporary restriction enforced by security policy.',
      message: 'Access is temporarily restricted. Please try again later.',
      retryAfterSeconds: restriction.retryAfterSeconds,
    });
    return;
  }

  // ── 2. NON-DESTRUCTIVE HONEYPOT CANARY INTERCEPTION ──
  if (HONEYPOT_ROUTES.has(normalizedPath)) {
    const correlationId = (req as any).correlationId || `canary_${Date.now()}`;
    const signal: SecuritySignal = {
      timestamp: new Date(),
      method: req.method,
      route: req.originalUrl || req.path,
      statusCode: 404,
      role: (req as any).user?.role || 'ANONYMOUS',
      userId: (req as any).user?.id || null,
      clientIp,
      correlationId,
      userAgent: req.headers['user-agent']?.slice(0, 255),
      query: sanitizeQuery(req.query),
      isHoneypot: true,
    };

    // Process signal asynchronously
    setImmediate(() => {
      agentShieldEngine.processSignal(signal).catch(() => {});
    });

    // Return standard harmless 404
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.originalUrl,
      method: req.method,
    });
    return;
  }

  // ── 3. ASYNCHRONOUS METRICS & THREAT EVALUATION ON RESPONSE FINISH ──
  const startTime = Date.now();

  res.on('finish', () => {
    // Only monitor relevant ERP routes under /api or abnormal 404s
    const originalUrl = req.originalUrl || req.path;
    const isApiRequest = originalUrl.startsWith('/api') || originalUrl.startsWith('/health');
    const isRelevant404 = res.statusCode === 404 && !originalUrl.includes('favicon.ico');

    if (!isApiRequest && !isRelevant404) return;

    const authenticatedUser = (req as AuthenticatedRequest).user || (req as any).authenticatedUser || null;
    const signal: SecuritySignal = {
      timestamp: new Date(),
      method: req.method,
      route: originalUrl.split('?')[0],
      statusCode: res.statusCode,
      role: authenticatedUser?.role || 'ANONYMOUS',
      userId: authenticatedUser?.id || null,
      clientIp,
      correlationId: (req as any).correlationId || `req_${Date.now()}`,
      userAgent: req.headers['user-agent']?.slice(0, 255),
      query: sanitizeQuery(req.query),
      isHoneypot: false,
    };

    // Non-blocking evaluation: will not impact API latency or user experience
    setImmediate(() => {
      agentShieldEngine.processSignal(signal).catch(() => {});
    });
  });

  return next();
};

export default agentShieldMiddleware;

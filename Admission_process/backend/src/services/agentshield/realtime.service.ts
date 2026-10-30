type SocketIOServer = any;
type Socket = any;
import { verifyToken } from '../../utils/jwt.util';
import User from '../../models/User';
import logger from '../../utils/logger.util';

export class RealtimeService {
  private io: SocketIOServer | null = null;
  private connectedAdmins: Set<string> = new Set();

  /**
   * Initialize Socket.IO instance and attach authenticated security listener
   */
  public initialize(io: SocketIOServer): void {
    this.io = io;

    io.use(async (socket: Socket, next) => {
      try {
        const rawToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
        let token = '';

        if (typeof rawToken === 'string') {
          token = rawToken.startsWith('Bearer ') ? rawToken.split(' ')[1] : rawToken;
        }

        if (!token) {
          return next(new Error('Authentication failed: Token missing.'));
        }

        const decoded: any = verifyToken(token);
        if (!decoded || !decoded.id) {
          return next(new Error('Authentication failed: Invalid token payload.'));
        }

        const user = await User.findByPk(decoded.id);
        if (!user || user.status !== 'ACTIVE') {
          return next(new Error('Authentication failed: Inactive or invalid user.'));
        }

        // Strictly verify authorization: Only CYBERADMIN and SUPER_ADMIN are permitted to subscribe
        if (user.role !== 'CYBERADMIN' && user.role !== 'SUPER_ADMIN') {
          logger.warn(`[AgentShield Realtime] Blocked unauthorized role '${user.role}' from subscribing to security channel.`);
          return next(new Error('Forbidden: Insufficient privileges for security telemetry channel.'));
        }

        (socket as any).user = {
          id: user.id,
          email: user.email,
          role: user.role,
        };

        return next();
      } catch (err: any) {
        logger.warn('[AgentShield Realtime] Socket authentication handshake failed:', err.message);
        return next(new Error('Authentication failed: ' + (err.message || 'Unauthorized')));
      }
    });

    io.on('connection', (socket: Socket) => {
      const user = (socket as any).user;
      socket.join('agentshield-soc');
      this.connectedAdmins.add(socket.id);

      logger.info(`[AgentShield Realtime] CyberAdmin connected to SOC live channel: ${user?.email} (${socket.id}). Active subscribers: ${this.connectedAdmins.size}`);

      socket.on('disconnect', () => {
        this.connectedAdmins.delete(socket.id);
        logger.info(`[AgentShield Realtime] CyberAdmin disconnected: ${socket.id}. Active subscribers: ${this.connectedAdmins.size}`);
      });
    });

    logger.info('[AgentShield Realtime] Security telemetry WebSocket channel successfully initialized.');
  }

  /**
   * Broadcast a newly detected security event to authorized subscribers
   */
  public broadcastEvent(eventData: any): void {
    if (!this.io) return;
    try {
      this.io.to('agentshield-soc').emit('agentshield:event', eventData);
    } catch (err) {
      logger.error('[AgentShield Realtime] Failed to broadcast event:', err);
    }
  }

  /**
   * Broadcast an updated or new security incident to authorized subscribers
   */
  public broadcastIncident(incidentData: any): void {
    if (!this.io) return;
    try {
      this.io.to('agentshield-soc').emit('agentshield:incident', incidentData);
    } catch (err) {
      logger.error('[AgentShield Realtime] Failed to broadcast incident:', err);
    }
  }

  /**
   * Broadcast summary metrics updates
   */
  public broadcastStats(statsData: any): void {
    if (!this.io) return;
    try {
      this.io.to('agentshield-soc').emit('agentshield:stats', statsData);
    } catch (err) {
      logger.error('[AgentShield Realtime] Failed to broadcast stats:', err);
    }
  }

  /**
   * Count of currently connected CyberAdmins
   */
  public getConnectedAdminsCount(): number {
    return this.connectedAdmins.size;
  }
}

export const realtimeService = new RealtimeService();
export default realtimeService;

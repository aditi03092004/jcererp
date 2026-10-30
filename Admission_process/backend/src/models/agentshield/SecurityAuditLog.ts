import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export class SecurityAuditLog extends Model {
  public id!: string;
  public actorId!: string;
  public actorEmail!: string;
  public action!: string;
  public targetType!: string;
  public targetId!: string;
  public previousState!: any;
  public newState!: any;
  public ipAddress!: string | null;
  public timestamp!: Date;
  public details!: any;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SecurityAuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    actorId: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    actorEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    targetType: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    targetId: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    previousState: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    newState: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'security_audit_logs',
    timestamps: true,
    indexes: [
      { fields: ['timestamp'] },
      { fields: ['actorEmail'] },
      { fields: ['action'] },
      { fields: ['targetType'] },
    ],
  }
);

function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveData);
  const SENSITIVE_KEYS = new Set([
    'password', 'secret', 'token', 'otp', 'code', 'jwt', 'cookie',
    'authorization', 'hash', 'apikey', 'api_key', 'credential', 'creditcard'
  ]);
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

// ── Enforce Deep Redaction of Secrets, OTPs, Tokens, and Cookies ──
SecurityAuditLog.beforeCreate((instance: SecurityAuditLog) => {
  if (instance.previousState) {
    instance.previousState = redactSensitiveData(instance.previousState);
  }
  if (instance.newState) {
    instance.newState = redactSensitiveData(instance.newState);
  }
  if (instance.details) {
    instance.details = redactSensitiveData(instance.details);
  }
});

// ── Enforce True Audit Immutability: Records Cannot Be Modified or Deleted ──
SecurityAuditLog.beforeUpdate(() => {
  throw new Error('SecurityAuditLog records are strictly append-only and cannot be modified.');
});

SecurityAuditLog.beforeBulkUpdate(() => {
  throw new Error('SecurityAuditLog records are strictly append-only and cannot be modified.');
});

SecurityAuditLog.beforeDestroy(() => {
  throw new Error('SecurityAuditLog records are strictly append-only and cannot be deleted.');
});

SecurityAuditLog.beforeBulkDestroy(() => {
  throw new Error('SecurityAuditLog records are strictly append-only and cannot be deleted.');
});

export default SecurityAuditLog;

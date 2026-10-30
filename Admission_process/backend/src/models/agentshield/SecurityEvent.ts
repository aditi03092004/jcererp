import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export type EventRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EventResponseAction = 'MONITOR' | 'RATE_LIMITED' | 'BLOCKED' | 'HONEYPOT_TRIGGER';

export class SecurityEvent extends Model {
  public id!: string;
  public timestamp!: Date;
  public method!: string;
  public route!: string;
  public statusCode!: number;
  public role!: string;
  public userId!: string | null;
  public clientIp!: string;
  public correlationId!: string;
  public ruleId!: string;
  public category!: string;
  public riskScore!: number;
  public riskLevel!: EventRiskLevel;
  public evidence!: any;
  public responseAction!: EventResponseAction;
  public incidentId!: string | null;
  public userAgent!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SecurityEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    method: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    route: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'ANONYMOUS',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    clientIp: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    correlationId: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    ruleId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'GENERAL',
    },
    riskScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    riskLevel: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'LOW',
    },
    evidence: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    responseAction: {
      type: DataTypes.ENUM('MONITOR', 'RATE_LIMITED', 'BLOCKED', 'HONEYPOT_TRIGGER'),
      allowNull: false,
      defaultValue: 'MONITOR',
    },
    incidentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'security_events',
    timestamps: true,
    indexes: [
      { fields: ['timestamp'] },
      { fields: ['riskLevel'] },
      { fields: ['ruleId'] },
      { fields: ['incidentId'] },
      { fields: ['correlationId'] },
      { fields: ['clientIp'] },
    ],
  }
);

export default SecurityEvent;

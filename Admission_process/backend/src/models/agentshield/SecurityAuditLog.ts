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

export default SecurityAuditLog;

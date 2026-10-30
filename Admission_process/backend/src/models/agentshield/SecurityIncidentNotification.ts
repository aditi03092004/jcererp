import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export class SecurityIncidentNotification extends Model {
  public id!: string;
  public incidentId!: string | null;
  public incidentNumber!: string;
  public severity!: string;
  public recipients!: string[];
  public deliveryStatus!: NotificationDeliveryStatus;
  public attemptCount!: number;
  public lastAttemptAt!: Date;
  public sentAt!: Date | null;
  public failureReason!: string | null;
  public idempotencyKey!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SecurityIncidentNotification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    incidentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    incidentNumber: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    recipients: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    deliveryStatus: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    failureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    idempotencyKey: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
    },
  },
  {
    sequelize,
    tableName: 'security_incident_notifications',
    timestamps: true,
    indexes: [
      { fields: ['incidentId'] },
      { fields: ['deliveryStatus'] },
      { fields: ['idempotencyKey'], unique: true },
    ],
  }
);

export default SecurityIncidentNotification;


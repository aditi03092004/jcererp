import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export type FindingRisk = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type FindingStatus = 'OPEN' | 'IN_REVIEW' | 'ACCEPTED_RISK' | 'REMEDIATED';

export class SecurityFinding extends Model {
  public id!: string;
  public assessmentId!: string;
  public pluginId!: string;
  public alert!: string;
  public risk!: FindingRisk;
  public confidence!: string;
  public url!: string;
  public method!: string;
  public param!: string | null;
  public attack!: string | null;
  public evidence!: string | null;
  public description!: string;
  public solution!: string;
  public reference!: string | null;
  public cweId!: string | null;
  public wascId!: string | null;
  public status!: FindingStatus;
  public remediationNotes!: string | null;
  public updatedBy!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SecurityFinding.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    assessmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'security_assessments',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    pluginId: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '0',
    },
    alert: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    risk: {
      type: DataTypes.ENUM('HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'),
      allowNull: false,
      defaultValue: 'LOW',
    },
    confidence: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'Medium',
    },
    url: {
      type: DataTypes.STRING(1024),
      allowNull: false,
    },
    method: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'GET',
    },
    param: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    attack: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    evidence: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    solution: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    reference: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cweId: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    wascId: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'IN_REVIEW', 'ACCEPTED_RISK', 'REMEDIATED'),
      allowNull: false,
      defaultValue: 'OPEN',
    },
    remediationNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'security_findings',
    timestamps: true,
    indexes: [
      { fields: ['assessmentId'] },
      { fields: ['risk'] },
      { fields: ['status'] },
      { fields: ['cweId'] },
    ],
  }
);

export default SecurityFinding;

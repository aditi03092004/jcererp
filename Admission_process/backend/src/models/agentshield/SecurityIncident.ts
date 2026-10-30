import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'NEW' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';

export interface InvestigationNote {
  id: string;
  author: string;
  authorEmail: string;
  note: string;
  timestamp: string;
}

export class SecurityIncident extends Model {
  public id!: string;
  public incidentNumber!: string;
  public title!: string;
  public category!: string;
  public severity!: IncidentSeverity;
  public status!: IncidentStatus;
  public firstObservedAt!: Date;
  public lastObservedAt!: Date;
  public eventCount!: number;
  public sourceIdentifier!: string;
  public targetResource!: string;
  public evidenceSummary!: string;
  public recommendedSteps!: string[];
  public responseActionTaken!: string;
  public assignedTo!: string | null;
  public investigationNotes!: InvestigationNote[];
  public resolutionSummary!: string | null;
  public resolvedAt!: Date | null;
  public resolvedBy!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SecurityIncident.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    incidentNumber: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    status: {
      type: DataTypes.ENUM('NEW', 'INVESTIGATING', 'MITIGATED', 'RESOLVED'),
      allowNull: false,
      defaultValue: 'NEW',
    },
    firstObservedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    lastObservedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    eventCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    sourceIdentifier: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    targetResource: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    evidenceSummary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    recommendedSteps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    responseActionTaken: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: 'MONITORING',
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    investigationNotes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    resolutionSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolvedBy: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'security_incidents',
    timestamps: true,
    indexes: [
      { fields: ['status'] },
      { fields: ['severity'] },
      { fields: ['category'] },
      { fields: ['lastObservedAt'] },
      { fields: ['sourceIdentifier'] },
      { fields: ['incidentNumber'], unique: true },
    ],
  }
);

export default SecurityIncident;

import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export class SecurityAssessment extends Model {
  public id!: string;
  public title!: string;
  public tool!: string;
  public fileName!: string;
  public scanDate!: Date;
  public targetScope!: string;
  public highCount!: number;
  public mediumCount!: number;
  public lowCount!: number;
  public informationalCount!: number;
  public totalFindings!: number;
  public summary!: string;
  public importedBy!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SecurityAssessment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tool: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'OWASP ZAP',
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    scanDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    targetScope: {
      type: DataTypes.STRING(512),
      allowNull: false,
      defaultValue: 'JCER ERP API & Endpoints',
    },
    highCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    mediumCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lowCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    informationalCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalFindings: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    importedBy: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'security_assessments',
    timestamps: true,
    indexes: [
      { fields: ['scanDate'] },
      { fields: ['tool'] },
    ],
  }
);

export default SecurityAssessment;

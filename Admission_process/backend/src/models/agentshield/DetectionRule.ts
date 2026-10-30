import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database';

export type RuleRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RuleResponsePolicy = 'MONITOR' | 'RATE_LIMIT' | 'BLOCK' | 'CHALLENGE';

export interface DetectionRuleAttributes {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  threshold: number;
  observationWindowSeconds: number;
  riskLevel: RuleRiskLevel;
  responsePolicy: RuleResponsePolicy;
  config: any;
  lastTriggeredAt?: Date | null;
  updatedBy?: string | null;
}

export class DetectionRule extends Model {
  public id!: string;
  public name!: string;
  public description!: string;
  public category!: string;
  public enabled!: boolean;
  public threshold!: number;
  public observationWindowSeconds!: number;
  public riskLevel!: RuleRiskLevel;
  public responsePolicy!: RuleResponsePolicy;
  public config!: any;
  public lastTriggeredAt!: Date | null;
  public updatedBy!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

DetectionRule.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    threshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    observationWindowSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
    riskLevel: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: false,
      defaultValue: 'MEDIUM',
    },
    responsePolicy: {
      type: DataTypes.ENUM('MONITOR', 'RATE_LIMIT', 'BLOCK', 'CHALLENGE'),
      allowNull: false,
      defaultValue: 'MONITOR',
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    lastTriggeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'detection_rules',
    timestamps: true,
    indexes: [
      { fields: ['enabled'] },
      { fields: ['category'] },
      { fields: ['riskLevel'] },
    ],
  }
);

export default DetectionRule;

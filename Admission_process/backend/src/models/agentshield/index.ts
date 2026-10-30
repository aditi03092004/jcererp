import SecurityEvent from './SecurityEvent';
import SecurityIncident from './SecurityIncident';
import DetectionRule from './DetectionRule';
import SecurityAssessment from './SecurityAssessment';
import SecurityFinding from './SecurityFinding';
import SecurityAuditLog from './SecurityAuditLog';

// Set up associations
SecurityIncident.hasMany(SecurityEvent, {
  foreignKey: 'incidentId',
  as: 'events',
  onDelete: 'SET NULL',
});

SecurityEvent.belongsTo(SecurityIncident, {
  foreignKey: 'incidentId',
  as: 'incident',
});

SecurityAssessment.hasMany(SecurityFinding, {
  foreignKey: 'assessmentId',
  as: 'findings',
  onDelete: 'CASCADE',
});

SecurityFinding.belongsTo(SecurityAssessment, {
  foreignKey: 'assessmentId',
  as: 'assessment',
});

export {
  SecurityEvent,
  SecurityIncident,
  DetectionRule,
  SecurityAssessment,
  SecurityFinding,
  SecurityAuditLog,
};

export default {
  SecurityEvent,
  SecurityIncident,
  DetectionRule,
  SecurityAssessment,
  SecurityFinding,
  SecurityAuditLog,
};

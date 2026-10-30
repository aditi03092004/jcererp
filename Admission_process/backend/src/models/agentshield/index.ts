import SecurityEvent from './SecurityEvent';
import SecurityIncident from './SecurityIncident';
import DetectionRule from './DetectionRule';
import SecurityAssessment from './SecurityAssessment';
import SecurityFinding from './SecurityFinding';
import SecurityAuditLog from './SecurityAuditLog';
import SecurityIncidentNotification from './SecurityIncidentNotification';

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

SecurityIncident.hasMany(SecurityIncidentNotification, {
  foreignKey: 'incidentId',
  as: 'notifications',
  onDelete: 'SET NULL',
});

SecurityIncidentNotification.belongsTo(SecurityIncident, {
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
  SecurityIncidentNotification,
};

export default {
  SecurityEvent,
  SecurityIncident,
  DetectionRule,
  SecurityAssessment,
  SecurityFinding,
  SecurityAuditLog,
  SecurityIncidentNotification,
};

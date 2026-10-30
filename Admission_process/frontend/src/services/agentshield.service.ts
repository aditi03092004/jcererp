import API from './api';

export interface SecurityEventItem {
  id: string;
  timestamp: string;
  method: string;
  route: string;
  statusCode: number;
  role: string;
  clientIp: string;
  correlationId: string;
  ruleId: string;
  category: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: any;
  responseAction: 'MONITOR' | 'RATE_LIMITED' | 'BLOCKED' | 'HONEYPOT_TRIGGER';
  incidentId?: string | null;
  userAgent?: string | null;
}

export interface InvestigationNoteItem {
  id: string;
  author: string;
  authorEmail: string;
  note: string;
  timestamp: string;
}

export interface SecurityIncidentItem {
  id: string;
  incidentNumber: string;
  title: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';
  firstObservedAt: string;
  lastObservedAt: string;
  eventCount: number;
  sourceIdentifier: string;
  targetResource: string;
  evidenceSummary: string;
  recommendedSteps: string[];
  responseActionTaken: string;
  investigationNotes: InvestigationNoteItem[];
  resolutionSummary?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  events?: SecurityEventItem[];
}

export interface DetectionRuleItem {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  threshold: number;
  observationWindowSeconds: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  responsePolicy: 'MONITOR' | 'RATE_LIMIT' | 'BLOCK' | 'CHALLENGE';
  config: any;
  lastTriggeredAt?: string | null;
  updatedBy?: string | null;
}

export interface SecurityAssessmentItem {
  id: string;
  title: string;
  tool: string;
  fileName: string;
  scanDate: string;
  targetScope: string;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  informationalCount: number;
  totalFindings: number;
  summary: string;
  importedBy: string;
}

export interface SecurityFindingItem {
  id: string;
  assessmentId: string;
  pluginId: string;
  alert: string;
  risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  confidence: string;
  url: string;
  method: string;
  param?: string | null;
  attack?: string | null;
  evidence?: string | null;
  description: string;
  solution: string;
  reference?: string | null;
  cweId?: string | null;
  wascId?: string | null;
  status: 'OPEN' | 'IN_REVIEW' | 'ACCEPTED_RISK' | 'REMEDIATED';
  remediationNotes?: string | null;
  updatedBy?: string | null;
}

export interface SecurityAuditLogItem {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  ipAddress?: string | null;
  timestamp: string;
  details?: any;
}

export const agentshieldService = {
  // 1. Overview
  async getOverview() {
    const res = await API.get('/agentshield/overview');
    return res.data;
  },

  // 2. Events
  async getEvents(params?: { page?: number; limit?: number; riskLevel?: string; category?: string; search?: string }) {
    const res = await API.get('/agentshield/events', { params });
    return res.data;
  },

  // 3. Incidents
  async getIncidents(params?: { page?: number; limit?: number; status?: string; severity?: string; category?: string; search?: string }) {
    const res = await API.get('/agentshield/incidents', { params });
    return res.data;
  },

  async getIncidentById(id: string) {
    const res = await API.get(`/agentshield/incidents/${id}`);
    return res.data;
  },

  async updateIncidentStatus(id: string, status: string, resolutionSummary?: string) {
    const res = await API.patch(`/agentshield/incidents/${id}/status`, { status, resolutionSummary });
    return res.data;
  },

  async addIncidentNote(id: string, note: string) {
    const res = await API.post(`/agentshield/incidents/${id}/notes`, { note });
    return res.data;
  },

  // 4. Blocked Requests
  async getBlockedRequests() {
    const res = await API.get('/agentshield/blocked-requests');
    return res.data;
  },

  async liftRestriction(clientIp: string) {
    const res = await API.post('/agentshield/lift-restriction', { clientIp });
    return res.data;
  },

  // 5. Rules
  async getRules() {
    const res = await API.get('/agentshield/rules');
    return res.data;
  },

  async updateRule(id: string, updates: Partial<DetectionRuleItem>) {
    const res = await API.put(`/agentshield/rules/${id}`, updates);
    return res.data;
  },

  // 6. Assessments & Findings (OWASP ZAP)
  async getAssessments() {
    const res = await API.get('/agentshield/assessments');
    return res.data;
  },

  async getAssessmentById(id: string) {
    const res = await API.get(`/agentshield/assessments/${id}`);
    return res.data;
  },

  async importZapReport(file: File, title?: string) {
    const formData = new FormData();
    formData.append('report', file);
    if (title) formData.append('title', title);
    const res = await API.post('/agentshield/assessments/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async updateFindingStatus(id: string, status: string, remediationNotes?: string) {
    const res = await API.patch(`/agentshield/findings/${id}/status`, { status, remediationNotes });
    return res.data;
  },

  // 7. Audit Logs
  async getAuditLogs(params?: { page?: number; limit?: number; action?: string; targetType?: string }) {
    const res = await API.get('/agentshield/audit-logs', { params });
    return res.data;
  },

  // 8. Health
  async getHealth() {
    const res = await API.get('/agentshield/health');
    return res.data;
  },
};

export default agentshieldService;


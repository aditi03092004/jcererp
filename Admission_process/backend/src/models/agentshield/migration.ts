import { Sequelize } from 'sequelize';
import logger from '../../utils/logger.util';

export async function ensureAgentShieldTables(sequelize: Sequelize): Promise<void> {
  try {
    // 1. Detection Rules
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "detection_rules" (
        "id" VARCHAR(64) PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT NOT NULL,
        "category" VARCHAR(64) NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "threshold" INTEGER NOT NULL DEFAULT 5,
        "observationWindowSeconds" INTEGER NOT NULL DEFAULT 60,
        "riskLevel" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
        "responsePolicy" VARCHAR(32) NOT NULL DEFAULT 'MONITOR',
        "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "lastTriggeredAt" TIMESTAMP WITH TIME ZONE NULL,
        "updatedBy" VARCHAR(128) NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_detection_rules_enabled" ON "detection_rules" ("enabled");
      CREATE INDEX IF NOT EXISTS "idx_detection_rules_category" ON "detection_rules" ("category");
    `);

    // 2. Security Incidents
    await sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS "agentshield_incident_seq" START 1;
      DO $$
      BEGIN
        BEGIN
          PERFORM setval('agentshield_incident_seq', COALESCE((
            SELECT MAX(CAST(SPLIT_PART("incidentNumber", '-', 3) AS INTEGER))
            FROM "security_incidents"
            WHERE "incidentNumber" ~ '^INC-[0-9]{4}-[0-9]+$'
          ), 0) + 1, false);
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END $$;

      CREATE TABLE IF NOT EXISTS "security_incidents" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "incidentNumber" VARCHAR(32) NOT NULL UNIQUE,
        "title" VARCHAR(255) NOT NULL,
        "category" VARCHAR(64) NOT NULL,
        "severity" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
        "status" VARCHAR(32) NOT NULL DEFAULT 'NEW',
        "firstObservedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "lastObservedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "eventCount" INTEGER NOT NULL DEFAULT 1,
        "sourceIdentifier" VARCHAR(128) NOT NULL,
        "targetResource" VARCHAR(255) NOT NULL,
        "evidenceSummary" TEXT NOT NULL,
        "recommendedSteps" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "responseActionTaken" VARCHAR(128) NOT NULL DEFAULT 'MONITORING',
        "assignedTo" UUID NULL,
        "investigationNotes" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "resolutionSummary" TEXT NULL,
        "resolvedAt" TIMESTAMP WITH TIME ZONE NULL,
        "resolvedBy" VARCHAR(128) NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_security_incidents_status" ON "security_incidents" ("status");
      CREATE INDEX IF NOT EXISTS "idx_security_incidents_severity" ON "security_incidents" ("severity");
      CREATE INDEX IF NOT EXISTS "idx_security_incidents_last_observed" ON "security_incidents" ("lastObservedAt");
    `);

    // 3. Security Events
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "security_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "method" VARCHAR(16) NOT NULL,
        "route" VARCHAR(512) NOT NULL,
        "statusCode" INTEGER NOT NULL,
        "role" VARCHAR(64) NOT NULL DEFAULT 'ANONYMOUS',
        "userId" UUID NULL,
        "clientIp" VARCHAR(64) NOT NULL,
        "correlationId" VARCHAR(128) NOT NULL,
        "ruleId" VARCHAR(64) NOT NULL,
        "category" VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
        "riskScore" INTEGER NOT NULL DEFAULT 10,
        "riskLevel" VARCHAR(32) NOT NULL DEFAULT 'LOW',
        "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "responseAction" VARCHAR(32) NOT NULL DEFAULT 'MONITOR',
        "incidentId" UUID NULL REFERENCES "security_incidents"("id") ON DELETE SET NULL,
        "userAgent" VARCHAR(512) NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_security_events_timestamp" ON "security_events" ("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_security_events_risk_level" ON "security_events" ("riskLevel");
      CREATE INDEX IF NOT EXISTS "idx_security_events_incident_id" ON "security_events" ("incidentId");
      CREATE INDEX IF NOT EXISTS "idx_security_events_client_ip" ON "security_events" ("clientIp");
    `);

    // 4. Security Assessments (OWASP ZAP)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "security_assessments" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" VARCHAR(255) NOT NULL,
        "tool" VARCHAR(64) NOT NULL DEFAULT 'OWASP ZAP',
        "fileName" VARCHAR(255) NOT NULL,
        "scanDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "targetScope" VARCHAR(512) NOT NULL DEFAULT 'JCER ERP API & Endpoints',
        "highCount" INTEGER NOT NULL DEFAULT 0,
        "mediumCount" INTEGER NOT NULL DEFAULT 0,
        "lowCount" INTEGER NOT NULL DEFAULT 0,
        "informationalCount" INTEGER NOT NULL DEFAULT 0,
        "totalFindings" INTEGER NOT NULL DEFAULT 0,
        "summary" TEXT NOT NULL DEFAULT '',
        "importedBy" VARCHAR(128) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_security_assessments_scan_date" ON "security_assessments" ("scanDate");
    `);

    // 5. Security Findings (Individual ZAP findings)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "security_findings" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "assessmentId" UUID NOT NULL REFERENCES "security_assessments"("id") ON DELETE CASCADE,
        "pluginId" VARCHAR(32) NOT NULL DEFAULT '0',
        "alert" VARCHAR(255) NOT NULL,
        "risk" VARCHAR(32) NOT NULL DEFAULT 'LOW',
        "confidence" VARCHAR(32) NOT NULL DEFAULT 'Medium',
        "url" VARCHAR(1024) NOT NULL,
        "method" VARCHAR(16) NOT NULL DEFAULT 'GET',
        "param" VARCHAR(255) NULL,
        "attack" TEXT NULL,
        "evidence" TEXT NULL,
        "description" TEXT NOT NULL DEFAULT '',
        "solution" TEXT NOT NULL DEFAULT '',
        "reference" TEXT NULL,
        "cweId" VARCHAR(32) NULL,
        "wascId" VARCHAR(32) NULL,
        "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        "remediationNotes" TEXT NULL,
        "updatedBy" VARCHAR(128) NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_security_findings_assessment_id" ON "security_findings" ("assessmentId");
      CREATE INDEX IF NOT EXISTS "idx_security_findings_risk" ON "security_findings" ("risk");
      CREATE INDEX IF NOT EXISTS "idx_security_findings_status" ON "security_findings" ("status");
    `);

    // 6. Security Audit Logs
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "security_audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "actorId" VARCHAR(128) NOT NULL,
        "actorEmail" VARCHAR(255) NOT NULL,
        "action" VARCHAR(64) NOT NULL,
        "targetType" VARCHAR(64) NOT NULL,
        "targetId" VARCHAR(128) NOT NULL,
        "previousState" JSONB NULL,
        "newState" JSONB NULL,
        "ipAddress" VARCHAR(64) NULL,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "details" JSONB NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS "idx_security_audit_logs_timestamp" ON "security_audit_logs" ("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_security_audit_logs_actor" ON "security_audit_logs" ("actorEmail");
      CREATE INDEX IF NOT EXISTS "idx_security_audit_logs_action" ON "security_audit_logs" ("action");
    `);

    logger.info('[AgentShield] Database schema verified and migration executed successfully.');
  } catch (err: any) {
    logger.error('[AgentShield] Database migration notice/error:', err);
  }
}

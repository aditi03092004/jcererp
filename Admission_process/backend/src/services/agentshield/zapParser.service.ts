import sequelize from '../../config/database';
import SecurityAssessment from '../../models/agentshield/SecurityAssessment';
import SecurityFinding, { FindingRisk } from '../../models/agentshield/SecurityFinding';
import SecurityAuditLog from '../../models/agentshield/SecurityAuditLog';
import logger from '../../utils/logger.util';

export interface ParsedFinding {
  pluginId: string;
  alert: string;
  risk: FindingRisk;
  confidence: string;
  url: string;
  method: string;
  param?: string;
  attack?: string;
  evidence?: string;
  description: string;
  solution: string;
  reference?: string;
  cweId?: string;
  wascId?: string;
}

export class ZapParserService {
  private readonly MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB limit

  /**
   * Sanitizes untrusted text to prevent XSS / script injection in security reports
   */
  private sanitize(input?: string | null): string {
    if (!input) return '';
    return String(input)
      .trim()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Normalizes ZAP risk codes to enum
   */
  private normalizeRisk(riskVal?: string | number): FindingRisk {
    const str = String(riskVal || '').trim().toUpperCase();
    if (str.includes('HIGH') || str === '3') return 'HIGH';
    if (str.includes('MEDIUM') || str === '2') return 'MEDIUM';
    if (str.includes('LOW') || str === '1') return 'LOW';
    return 'INFORMATIONAL';
  }

  /**
   * Parses JSON formatted OWASP ZAP scan reports
   */
  public parseJsonReport(content: string): { summary: any; findings: ParsedFinding[] } {
    let data: any;
    try {
      data = JSON.parse(content);
    } catch (err: any) {
      throw new Error('Invalid JSON format: Unable to parse OWASP ZAP scan report.');
    }

    const sites = data.site || (Array.isArray(data) ? data : [data]);
    const siteList = Array.isArray(sites) ? sites : [sites];
    const findings: ParsedFinding[] = [];

    for (const site of siteList) {
      const alerts = site.alerts || site.alert || [];
      const alertList = Array.isArray(alerts) ? alerts : [alerts];

      for (const item of alertList) {
        if (!item || !item.alert) continue;

        const risk = this.normalizeRisk(item.riskcode || item.riskdesc || item.risk);
        const instances = item.instances || (item.instance ? [item.instance] : [{ uri: site['@name'] || site.name || 'http://localhost' }]);
        const instanceList = Array.isArray(instances) ? instances : [instances];

        // Process instances or fallback to parent alert
        for (const inst of instanceList.slice(0, 50)) { // bound instances to 50 per alert type
          findings.push({
            pluginId: String(item.pluginid || '0'),
            alert: this.sanitize(item.alert || item.name || 'Unknown Vulnerability'),
            risk,
            confidence: String(item.confidence || 'Medium'),
            url: this.sanitize(inst.uri || inst.url || item.url || site['@name'] || 'http://localhost'),
            method: String(inst.method || item.method || 'GET').toUpperCase(),
            param: this.sanitize(inst.param || item.param || ''),
            attack: this.sanitize(inst.attack || item.attack || ''),
            evidence: this.sanitize(inst.evidence || item.evidence || ''),
            description: this.sanitize(item.desc || item.description || ''),
            solution: this.sanitize(item.solution || ''),
            reference: this.sanitize(item.reference || ''),
            cweId: item.cweid ? String(item.cweid) : undefined,
            wascId: item.wascid ? String(item.wascid) : undefined,
          });
        }
      }
    }

    return {
      summary: {
        generated: data['@generated'] || data.generated || new Date().toISOString(),
        siteCount: siteList.length,
      },
      findings,
    };
  }

  /**
   * Imports an OWASP ZAP report into the database inside an atomic transaction
   */
  public async importZapReport(
    fileBuffer: Buffer,
    fileName: string,
    actor: { id: string; email: string; ipAddress?: string },
    customTitle?: string
  ): Promise<SecurityAssessment> {
    if (fileBuffer.length > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed limit (${this.MAX_FILE_SIZE / (1024 * 1024)}MB).`);
    }

    const content = fileBuffer.toString('utf-8');
    const { summary, findings } = this.parseJsonReport(content);

    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let informationalCount = 0;

    for (const f of findings) {
      if (f.risk === 'HIGH') highCount++;
      else if (f.risk === 'MEDIUM') mediumCount++;
      else if (f.risk === 'LOW') lowCount++;
      else informationalCount++;
    }

    const scanDate = summary.generated ? new Date(summary.generated) : new Date();
    const assessmentTitle = customTitle || `OWASP ZAP Assessment - ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;

    let assessment!: SecurityAssessment;

    await sequelize.transaction(async (t) => {
      assessment = await SecurityAssessment.create(
        {
          title: assessmentTitle,
          tool: 'OWASP ZAP',
          fileName,
          scanDate: isNaN(scanDate.getTime()) ? new Date() : scanDate,
          targetScope: 'JCER ERP API & Endpoints',
          highCount,
          mediumCount,
          lowCount,
          informationalCount,
          totalFindings: findings.length,
          summary: `OWASP ZAP automated dynamic assessment. Detected ${findings.length} findings (${highCount} High, ${mediumCount} Medium, ${lowCount} Low, ${informationalCount} Informational).`,
          importedBy: actor.email,
        },
        { transaction: t }
      );

      // Insert findings in chunks
      const chunkSize = 100;
      for (let i = 0; i < findings.length; i += chunkSize) {
        const chunk = findings.slice(i, i + chunkSize).map((f) => ({
          assessmentId: assessment.id,
          pluginId: f.pluginId,
          alert: f.alert,
          risk: f.risk,
          confidence: f.confidence,
          url: f.url,
          method: f.method,
          param: f.param || null,
          attack: f.attack || null,
          evidence: f.evidence || null,
          description: f.description,
          solution: f.solution,
          reference: f.reference || null,
          cweId: f.cweId || null,
          wascId: f.wascId || null,
          status: 'OPEN' as const,
          remediationNotes: null,
          updatedBy: null,
        }));

        await SecurityFinding.bulkCreate(chunk, { transaction: t });
      }

      await SecurityAuditLog.create(
        {
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'IMPORT_ZAP_ASSESSMENT',
          targetType: 'ASSESSMENT',
          targetId: assessment.id,
          previousState: null,
          newState: assessment.toJSON(),
          ipAddress: actor.ipAddress || null,
          timestamp: new Date(),
          details: { fileName, totalFindings: findings.length, highCount, mediumCount, lowCount },
        },
        { transaction: t }
      );
    });

    logger.info(`[AgentShield] Successfully imported OWASP ZAP report '${fileName}' (${findings.length} findings). Assessment ID: ${assessment.id}`);
    return assessment;
  }
}

export const zapParserService = new ZapParserService();
export default zapParserService;

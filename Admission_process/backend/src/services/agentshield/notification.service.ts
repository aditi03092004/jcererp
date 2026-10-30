import SecurityIncident, { IncidentSeverity } from '../../models/agentshield/SecurityIncident';
import SecurityIncidentNotification from '../../models/agentshield/SecurityIncidentNotification';
import User from '../../models/User';
import emailService, { GLOBAL_JCER_EMAIL_LOGO_URL } from '../email.service';
import realtimeService from './realtime.service';
import logger from '../../utils/logger.util';

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface IncidentAlertPayload {
  incident: SecurityIncident;
  recipients: string[];
  severity: IncidentSeverity;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export class AgentShieldNotificationService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS_MS = [1000, 2000, 4000];

  /**
   * Resolves recipient email addresses for Principal and CyberAdmin.
   * Prioritizes active DB accounts and falls back to configured environment variables.
   * Deduplicates if the same address serves multiple roles.
   */
  public async resolveAlertRecipients(): Promise<string[]> {
    const recipients: string[] = [];

    // 1. Resolve Principal
    try {
      const activePrincipal = await User.findOne({
        where: {
          role: 'PRINCIPAL',
          status: 'ACTIVE',
        },
        order: [['createdAt', 'DESC']],
        attributes: ['email'],
      });

      if (activePrincipal && activePrincipal.email) {
        recipients.push(activePrincipal.email.trim().toLowerCase());
      } else {
        const fallback =
          process.env.SECURITY_ALERT_PRINCIPAL_EMAIL ||
          process.env.INITIAL_PRINCIPAL_EMAIL;
        if (fallback) {
          recipients.push(fallback.trim().toLowerCase());
        } else {
          logger.warn('[AgentShield Notification] Warning: No active Principal email found in DB or environment fallback.');
        }
      }
    } catch (err: any) {
      logger.warn(`[AgentShield Notification] Database error resolving Principal: ${err.message}`);
      const fallback =
        process.env.SECURITY_ALERT_PRINCIPAL_EMAIL ||
        process.env.INITIAL_PRINCIPAL_EMAIL;
      if (fallback) {
        recipients.push(fallback.trim().toLowerCase());
      }
    }

    // 2. Resolve CyberAdmin
    try {
      const activeCyberAdmin = await User.findOne({
        where: {
          role: 'CYBERADMIN',
          status: 'ACTIVE',
        },
        order: [['createdAt', 'DESC']],
        attributes: ['email'],
      });

      if (activeCyberAdmin && activeCyberAdmin.email) {
        recipients.push(activeCyberAdmin.email.trim().toLowerCase());
      } else {
        const fallback =
          process.env.SECURITY_ALERT_CYBERADMIN_EMAIL ||
          process.env.INITIAL_CYBERADMIN_EMAIL;
        if (fallback) {
          recipients.push(fallback.trim().toLowerCase());
        } else {
          logger.warn('[AgentShield Notification] Warning: No active CyberAdmin email found in DB or environment fallback.');
        }
      }
    } catch (err: any) {
      logger.warn(`[AgentShield Notification] Database error resolving CyberAdmin: ${err.message}`);
      const fallback =
        process.env.SECURITY_ALERT_CYBERADMIN_EMAIL ||
        process.env.INITIAL_CYBERADMIN_EMAIL;
      if (fallback) {
        recipients.push(fallback.trim().toLowerCase());
      }
    }

    // Deduplicate and filter non-empty valid strings
    const uniqueRecipients = Array.from(new Set(recipients.filter(Boolean)));
    return uniqueRecipients;
  }

  /**
   * Generates email subject for qualifying security incidents
   */
  public generateSubject(incident: SecurityIncident): string {
    const isCritical = incident.severity === 'CRITICAL';
    const tag = isCritical ? '[JCER ERP][CRITICAL]' : '[JCER ERP][HIGH]';
    const alertLabel = isCritical ? 'Immediate Security Alert' : 'Security Alert';
    return `${tag} ${alertLabel} — ${incident.incidentNumber}`;
  }

  /**
   * Generates responsive HTML email matching JCER ERP design system
   */
  public generateHtmlContent(incident: SecurityIncident): string {
    const isCritical = incident.severity === 'CRITICAL';
    const logoUrl =
      process.env.EMAIL_LOGO_URL ||
      process.env.PUBLIC_LOGO_URL ||
      GLOBAL_JCER_EMAIL_LOGO_URL;
    const frontendUrl =
      process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      'http://localhost:5173';
    const ctaUrl = `${frontendUrl}/cyberadmin/agentshield?tab=incidents`;

    const accentColor = isCritical ? '#dc2626' : '#d97706';
    const badgeBg = isCritical ? '#fee2e2' : '#fef3c7';
    const badgeBorder = isCritical ? '#fca5a5' : '#fde68a';
    const badgeText = isCritical ? '#991b1b' : '#92400e';
    const bannerTitle = isCritical
      ? 'CRITICAL SECURITY THREAT DETECTED'
      : 'HIGH SEVERITY SECURITY ALERT';
    const bannerSubtitle = isCritical
      ? 'Immediate administrative investigation and response required.'
      : 'Suspicious elevated security risk detected on ERP resources.';

    const safeTitle = escapeHtml(incident.title);
    const safeNumber = escapeHtml(incident.incidentNumber);
    const safeCategory = escapeHtml(incident.category);
    const safeTarget = escapeHtml(incident.targetResource);
    const safeSource = escapeHtml(incident.sourceIdentifier);
    const safeAction = escapeHtml(incident.responseActionTaken);
    const safeEvidence = escapeHtml(incident.evidenceSummary || 'No evidence recorded');
    const safeObservedAt = new Date(incident.lastObservedAt || Date.now()).toUTCString();

    const recommendedStepsHtml = (incident.recommendedSteps || [])
      .map(
        (step, index) => `
        <li style="margin-bottom: 8px; color: #334155; font-size: 13px; line-height: 1.5;">
          <strong>Step ${index + 1}:</strong> ${escapeHtml(step)}
        </li>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(this.generateSubject(incident))}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #ffffff; padding: 20px 24px 16px 24px; border-bottom: 2px solid ${accentColor};">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <img src="${logoUrl}" alt="JCER ERP" height="38" style="display: block; max-height: 38px; border: 0;" />
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; padding: 6px 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 6px; background-color: ${badgeBg}; color: ${badgeText}; border: 1px solid ${badgeBorder};">
                      ${incident.severity} SEVERITY
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert Headline -->
          <tr>
            <td style="padding: 24px 24px 16px 24px;">
              <div style="font-size: 12px; font-weight: 800; color: ${accentColor}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">
                ${bannerTitle}
              </div>
              <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                ${safeTitle}
              </h1>
              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.4;">
                ${bannerSubtitle}
              </p>
            </td>
          </tr>

          <!-- Metadata Grid -->
          <tr>
            <td style="padding: 0 24px 16px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: separate; padding: 14px 16px;">
                <tr>
                  <td style="width: 50%; padding-bottom: 10px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Incident ID</div>
                    <div style="font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace;">${safeNumber}</div>
                  </td>
                  <td style="width: 50%; padding-bottom: 10px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Category</div>
                    <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${safeCategory}</div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; padding-bottom: 10px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Target Resource</div>
                    <div style="font-size: 13px; font-weight: 600; color: #0f172a; word-break: break-all;">${safeTarget}</div>
                  </td>
                  <td style="width: 50%; padding-bottom: 10px; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Source Identifier / IP</div>
                    <div style="font-size: 13px; font-weight: 600; color: #0f172a; font-family: monospace;">${safeSource}</div>
                  </td>
                </tr>
                <tr>
                  <td style="width: 50%; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Observed At</div>
                    <div style="font-size: 12px; color: #334155;">${safeObservedAt}</div>
                  </td>
                  <td style="width: 50%; vertical-align: top;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Automated Action</div>
                    <div style="font-size: 13px; font-weight: 700; color: #4338ca;">${safeAction}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Evidence Summary -->
          <tr>
            <td style="padding: 0 24px 16px 24px;">
              <div style="font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; margin-bottom: 6px;">
                Evidence &amp; Detection Telemetry
              </div>
              <div style="background-color: #f8fafc; border-left: 3px solid ${accentColor}; padding: 12px 14px; font-size: 12px; font-family: 'Courier New', Courier, monospace; color: #334155; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
${safeEvidence}
              </div>
            </td>
          </tr>

          <!-- Recommended Response Steps -->
          ${
            recommendedStepsHtml
              ? `<tr>
            <td style="padding: 0 24px 20px 24px;">
              <div style="font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; margin-bottom: 8px;">
                Recommended Mitigation Steps
              </div>
              <ul style="margin: 0; padding-left: 18px;">
                ${recommendedStepsHtml}
              </ul>
            </td>
          </tr>`
              : ''
          }

          <!-- Action Button CTA -->
          <tr>
            <td align="center" style="padding: 4px 24px 28px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #4f46e5;">
                    <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.04em;">
                      Open AgentShield SOC Incident Queue &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 10px;">
                Requires authorized CyberAdmin login credentials.
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
              <div style="font-size: 11px; color: #64748b; line-height: 1.5;">
                <strong>JCER ERP Security Notification Subsystem</strong> &bull; AgentShield Cybersecurity Engine<br />
                This is an automated priority alert sent to college Principal and CyberAdmin.<br />
                Please do not reply directly to this email.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }

  /**
   * Generates clean plain text email fallback
   */
  public generateTextContent(incident: SecurityIncident): string {
    const isCritical = incident.severity === 'CRITICAL';
    const frontendUrl =
      process.env.FRONTEND_URL ||
      process.env.CLIENT_URL ||
      'http://localhost:5173';
    const ctaUrl = `${frontendUrl}/cyberadmin/agentshield?tab=incidents`;

    return `
=============================================================
JCER ERP AGENTSHIELD - ${incident.severity} SECURITY ALERT
=============================================================
Alert: ${incident.title}
Incident ID: ${incident.incidentNumber}
Severity: ${incident.severity}
Category: ${incident.category}
Target Resource: ${incident.targetResource}
Source: ${incident.sourceIdentifier}
Observed At: ${new Date(incident.lastObservedAt || Date.now()).toUTCString()}
Automated Action: ${incident.responseActionTaken}

-------------------------------------------------------------
EVIDENCE TELEMETRY:
-------------------------------------------------------------
${incident.evidenceSummary || 'None recorded'}

-------------------------------------------------------------
RECOMMENDED MITIGATION STEPS:
-------------------------------------------------------------
${(incident.recommendedSteps || []).map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

-------------------------------------------------------------
INVESTIGATE IN SOC:
${ctaUrl}
-------------------------------------------------------------
This is an automated priority alert sent to Principal and CyberAdmin.
`.trim();
  }

  /**
   * Dispatches the alert to all resolved recipients with bounded retries.
   * Runs asynchronously and updates database records idempotently.
   */
  public async notifyIncidentAlert(
    incident: SecurityIncident,
    forceResend = false
  ): Promise<boolean> {
    // 1. Check severity requirement: Only CRITICAL and HIGH
    if (incident.severity !== 'CRITICAL' && incident.severity !== 'HIGH') {
      return false;
    }

    const idempotencyKey = `${incident.id}_${incident.severity}`;

    // 2. Resolve recipients
    const recipients = await this.resolveAlertRecipients();
    if (recipients.length === 0) {
      logger.warn(
        `[AgentShield Notification] No recipient emails resolved for incident ${incident.incidentNumber}. Aborting notification.`
      );
      return false;
    }

    // 3. Idempotency Check
    let notifRecord = await SecurityIncidentNotification.findOne({
      where: { idempotencyKey },
    });

    if (!forceResend && notifRecord && notifRecord.deliveryStatus === 'SENT') {
      logger.info(
        `[AgentShield Notification] Notification for incident ${incident.incidentNumber} [${incident.severity}] was already sent. Skipping duplicate.`
      );
      return true;
    }

    if (!notifRecord) {
      notifRecord = await SecurityIncidentNotification.create({
        incidentId: incident.id,
        incidentNumber: incident.incidentNumber,
        severity: incident.severity,
        recipients,
        deliveryStatus: 'PENDING',
        attemptCount: 0,
        lastAttemptAt: new Date(),
        sentAt: null,
        failureReason: null,
        idempotencyKey,
      });
    } else {
      notifRecord.deliveryStatus = 'PENDING';
      notifRecord.recipients = recipients;
      await notifRecord.save();
    }

    // Update incident status to PENDING
    incident.notificationStatus = 'PENDING';
    await incident.save().catch(() => {});

    const subject = this.generateSubject(incident);
    const htmlContent = this.generateHtmlContent(incident);
    const textContent = this.generateTextContent(incident);

    // Asynchronous dispatch with bounded retries
    const dispatchTask = async () => {
      let success = false;
      let lastErrorMessage = '';

      for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
        notifRecord.attemptCount = attempt;
        notifRecord.lastAttemptAt = new Date();

        logger.info(
          `[AgentShield Notification] Dispatching alert for ${incident.incidentNumber} to [${recipients.join(
            ', '
          )}] (Attempt ${attempt}/${this.MAX_RETRIES})...`
        );

        try {
          // Send to each recipient in parallel
          const sendPromises = recipients.map((to) =>
            emailService.sendAgentShieldAlertEmail(to, subject, htmlContent, textContent)
          );
          const results = await Promise.all(sendPromises);

          if (results.every((res) => res === true)) {
            success = true;
            break;
          } else {
            const failCount = results.filter((r) => !r).length;
            lastErrorMessage = `Partial delivery failure: ${failCount}/${recipients.length} failed`;
          }
        } catch (err: any) {
          lastErrorMessage = err?.message || 'Unknown email service error';
          logger.warn(
            `[AgentShield Notification] Delivery attempt ${attempt} failed: ${lastErrorMessage}`
          );
        }

        if (attempt < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAYS_MS[attempt - 1] || 1000;
          await new Promise((res) => setTimeout(res, delay));
        }
      }

      if (success) {
        notifRecord.deliveryStatus = 'SENT';
        notifRecord.sentAt = new Date();
        notifRecord.failureReason = null;
        await notifRecord.save();

        incident.notificationStatus = 'SENT';
        incident.notificationSentAt = new Date();
        incident.notificationFailureReason = null;
        await incident.save().catch(() => {});

        logger.info(
          `✅ [AgentShield Notification] Alert email sent successfully for ${incident.incidentNumber} [${incident.severity}]`
        );
      } else {
        const sanitizedReason = (lastErrorMessage || 'Service unavailable').slice(0, 500);
        notifRecord.deliveryStatus = 'FAILED';
        notifRecord.failureReason = sanitizedReason;
        await notifRecord.save();

        incident.notificationStatus = 'FAILED';
        incident.notificationFailureReason = sanitizedReason;
        await incident.save().catch(() => {});

        logger.error(
          `❌ [AgentShield Notification] Failed to send alert email for ${incident.incidentNumber} after ${this.MAX_RETRIES} attempts: ${sanitizedReason}`
        );
      }

      // Broadcast updated incident via Socket.IO
      try {
        realtimeService.broadcastIncident(incident.toJSON());
      } catch (err) {
        // Safe catch
      }
    };

    // Non-blocking trigger
    setImmediate(() => {
      dispatchTask().catch((e) => {
        logger.error('[AgentShield Notification] Unexpected background dispatch exception:', e);
      });
    });

    return true;
  }
}

export const notificationService = new AgentShieldNotificationService();
export default notificationService;


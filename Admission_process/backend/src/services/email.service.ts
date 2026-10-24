import nodemailer, { Transporter } from 'nodemailer';
import axios from 'axios';
import logger from '../utils/logger.util';

export interface CommonEmailParams {
  recipientName: string;
  subject: string;
  badgeTitle?: string;
  headingText?: string;
  mainMessage: string;
  otpCode?: string;
  otpExpiryMinutes?: number;
  securityNote?: string;
  details?: Array<{ label: string; value: string }>;
  actionMessage?: string;
  footerText?: string;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const GLOBAL_JCER_EMAIL_LOGO_URL =
  'https://jcererp.pages.dev/emaillogo.png';

/**
 * Generate ONE unified, production-grade, JCER-branded responsive HTML email.
 * Optimized for Gmail Mobile & Desktop, Apple Mail, Outlook, and Dark Mode compatibility.
 */
export function getJcerCommonEmailHtml(params: CommonEmailParams): string {
  const logoUrl =
    process.env.EMAIL_LOGO_URL ||
    process.env.PUBLIC_LOGO_URL ||
    GLOBAL_JCER_EMAIL_LOGO_URL;

  const currentYear = new Date().getFullYear();
  const academicYearStr = `${currentYear}–${currentYear + 1}`;

  const safeRecipientName = escapeHtml(params.recipientName || 'User');
  const safeSubject = escapeHtml(
    params.subject || 'JCER ERP Notification'
  );

  const detailsRows =
    params.details && params.details.length > 0
      ? `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; border-collapse: separate;">
        <tr>
          <td style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; background-color: #f1f5f9;">
            <div style="font-size: 12px; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
              Application Details
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 14px 18px 6px 18px;">
            ${params.details
              .map(
                (d, index) => `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 12px; ${
                index < params.details!.length - 1
                  ? 'border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;'
                  : ''
              }">
                <tr>
                  <td style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">
                    ${escapeHtml(d.label)}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 13px; font-weight: 700; color: #0f172a; overflow-wrap: anywhere; word-break: break-word; line-height: 1.4;">
                    ${escapeHtml(d.value)}
                  </td>
                </tr>
              </table>
            `
              )
              .join('')}
          </td>
        </tr>
      </table>
    `
      : '';

  const otpBlock = params.otpCode
    ? `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0;">
        <tr>
          <td align="center" style="background-color: #f0f7ff; border: 2px dashed #4f46e5; border-radius: 14px; padding: 22px 16px; text-align: center;">
            <div style="font-size: 11px; font-weight: 700; color: #4338ca; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
              One-Time Verification Code (OTP)
            </div>
            <div class="otp-text" style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #3730a3 !important; margin: 0; line-height: 1.2;">
              ${escapeHtml(params.otpCode)}
            </div>
            ${
              params.otpExpiryMinutes
                ? `
              <div style="font-size: 12px; font-weight: 700; color: #4f46e5; margin-top: 10px;">
                ⏱ Valid for ${params.otpExpiryMinutes} minutes
              </div>
            `
                : ''
            }
          </td>
        </tr>
      </table>
    `
    : '';

  const securityBlock = params.securityNote
    ? `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
        <tr>
          <td style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 12px 14px; font-size: 12px; color: #991b1b; line-height: 1.5; font-weight: 500;">
            🔒 <strong>Security Guidance:</strong> ${escapeHtml(params.securityNote)}
          </td>
        </tr>
      </table>
    `
    : '';

  const actionBlock = params.actionMessage
    ? `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
        <tr>
          <td style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #166534; font-weight: 600; line-height: 1.5;">
            💡 ${escapeHtml(params.actionMessage)}
          </td>
        </tr>
      </table>
    `
    : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${safeSubject}</title>
  <style type="text/css">
    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }

    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }

    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      display: block;
    }

    body {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f1f5f9;
    }

    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }

      .fluid-padding {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }

      .header-title {
        font-size: 17px !important;
        line-height: 1.3 !important;
      }

      .otp-text {
        font-size: 26px !important;
        letter-spacing: 6px !important;
      }
    }
  </style>
</head>

<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 20px 8px;">

        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border-collapse: separate;">

          <!-- HEADER -->
          <tr>
            <td style="background: #0f172a; padding: 24px 24px; border-bottom: 3px solid #3b82f6;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="64" valign="middle" style="width: 64px; padding-right: 14px;">
                    <img
                      src="${logoUrl}"
                      alt="Jain College of Engineering &amp; Research"
                      width="56"
                      height="56"
                      style="display: block; width: 56px; height: 56px; border: 0; outline: none; border-radius: 50%; background-color: #ffffff; padding: 2px;"
                    />
                  </td>

                  <td valign="middle" style="text-align: left;">
                    <div class="header-title" style="font-size: 19px; font-weight: 800; color: #ffffff; line-height: 1.25; margin: 0; font-family: Arial, Helvetica, sans-serif; overflow-wrap: break-word; word-break: normal;">
                      Jain College of Engineering &amp; Research
                    </div>

                    <div style="font-size: 11px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px;">
                      OFFICIAL ERP NOTIFICATION
                    </div>

                    <div style="margin-top: 6px;">
                      <span style="display: inline-block; padding: 3px 10px; background-color: rgba(59, 130, 246, 0.2); border: 1px solid rgba(147, 197, 253, 0.4); border-radius: 12px; font-size: 11px; color: #e0e7ff; font-weight: 700;">
                        ${escapeHtml(
                          params.badgeTitle ||
                            `Academic Year ${academicYearStr}`
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BODY CONTENT -->
          <tr>
            <td class="fluid-padding" style="padding: 28px 28px 20px 28px; background-color: #ffffff;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; overflow-wrap: break-word; word-break: normal;">
                Dear ${safeRecipientName},
              </div>

              <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px; overflow-wrap: break-word; word-break: normal;">
                ${params.mainMessage}
              </div>

              ${otpBlock}

              ${securityBlock}

              ${detailsRows}

              ${actionBlock}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">
                Jain College of Engineering &amp; Research
              </div>

              <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">
                JCER Admission ERP &mdash; Belagavi, Karnataka
              </div>

              <div style="font-size: 12px; color: #475569;">
                Website:
                <a href="https://jcer.in" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; font-weight: 700; text-decoration: none;">
                  jcer.in
                </a>
              </div>

              <div style="margin-top: 10px; font-size: 10px; color: #94a3b8; line-height: 1.4;">
                ${escapeHtml(
                  params.footerText ||
                    'This is an automated notification from JCER ERP. Please do not reply directly to this email.'
                )}
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

export interface AdminOtpEmailParams {
  recipientName: string;
  otpCode: string;
  role: string;
  otpExpiryMinutes?: number;
}

/**
 * Generate a dedicated, institutional security authentication HTML email for Admin/Principal OTP.
 * Fully compatible with Gmail, Apple Mail, Outlook, mobile clients, and dark mode.
 */
export function getAdminSecurityOtpEmailHtml(params: AdminOtpEmailParams): string {
  const logoUrl =
    process.env.EMAIL_LOGO_URL ||
    process.env.PUBLIC_LOGO_URL ||
    GLOBAL_JCER_EMAIL_LOGO_URL;

  const safeRecipientName = escapeHtml(params.recipientName || 'Administrator');
  const safeOtp = escapeHtml(params.otpCode || '');
  const expiryMinutes = params.otpExpiryMinutes || 5;

  const roleUpper = (params.role || 'ADMIN').toUpperCase();
  let portalName = 'Admin Portal';
  let badgeRole = 'ADMINISTRATOR';

  if (roleUpper === 'PRINCIPAL') {
    portalName = 'Principal Portal';
    badgeRole = 'PRINCIPAL';
  } else if (roleUpper === 'DEAN') {
    portalName = 'Dean Academic Portal';
    badgeRole = 'DEAN ACADEMIC';
  } else if (roleUpper === 'HOD') {
    portalName = 'HOD Portal';
    badgeRole = 'HOD';
  } else if (roleUpper === 'TEACHER' || roleUpper === 'FACULTY') {
    portalName = 'Faculty Portal';
    badgeRole = 'FACULTY';
  }
  const badgeText = `${badgeRole} SECURITY AUTHENTICATION`;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr =
    now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>JCER ERP — ${portalName} Security Verification Code</title>
  <style type="text/css">
    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      display: block;
    }
    body {
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      background-color: #f1f5f9;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .fluid-padding {
        padding-left: 18px !important;
        padding-right: 18px !important;
      }
      .otp-display {
        font-size: 30px !important;
        letter-spacing: 6px !important;
      }
    }
  </style>
</head>

<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 24px 12px;">

        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05); border-collapse: separate;">

          <!-- 1. HEADER (Dark Navy Institutional Header) -->
          <tr>
            <td style="background-color: #0f172a; padding: 26px 26px 22px 26px; border-bottom: 3px solid #1e40af;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="58" valign="middle" style="width: 58px; padding-right: 16px;">
                    <img
                      src="${logoUrl}"
                      alt="JCER Logo"
                      width="50"
                      height="50"
                      style="display: block; width: 50px; height: 50px; border: 0; outline: none; border-radius: 50%; background-color: #ffffff; padding: 2px;"
                    />
                  </td>
                  <td valign="middle" style="text-align: left;">
                    <div style="font-size: 18px; font-weight: 800; color: #ffffff; line-height: 1.25; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      Jain College of Engineering &amp; Research
                    </div>
                    <div style="font-size: 11px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 3px;">
                      OFFICIAL ERP NOTIFICATION
                    </div>
                    <div style="margin-top: 8px;">
                      <span style="display: inline-block; padding: 3px 10px; background-color: rgba(30, 64, 175, 0.35); border: 1px solid rgba(147, 197, 253, 0.35); border-radius: 4px; font-size: 10px; color: #e0e7ff; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;">
                        [ ${badgeText} ]
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MAIN CONTENT BODY -->
          <tr>
            <td class="fluid-padding" style="padding: 30px 30px 24px 30px; background-color: #ffffff;">

              <!-- 2. GREETING / MESSAGE -->
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px;">
                Dear ${safeRecipientName},
              </div>

              <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 24px;">
                A new login attempt was detected for your JCER ERP ${portalName} account. Please verify your identity using the one-time verification code below.
              </div>

              <!-- 3. OTP SECTION -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td align="center" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 22px 16px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">
                      ONE-TIME VERIFICATION CODE
                    </div>
                    <div class="otp-display" style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f172a !important; margin: 0; line-height: 1.2; text-indent: 10px;">
                      ${safeOtp}
                    </div>
                    <div style="font-size: 12px; font-weight: 700; color: #1d4ed8; margin-top: 12px;">
                      Expires in ${expiryMinutes} minutes
                    </div>
                  </td>
                </tr>
              </table>

              <!-- 4. OTP SECURITY MESSAGE -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 22px;">
                <tr>
                  <td style="background-color: #f1f5f9; border-left: 3px solid #1e40af; border-radius: 0 6px 6px 0; padding: 10px 14px; font-size: 12px; color: #334155; line-height: 1.5; font-weight: 600;">
                    &#128274; <strong>Security Guidance:</strong> Never share this OTP with anyone, including JCER ERP staff.
                  </td>
                </tr>
              </table>

              <!-- 5. LOGIN REQUEST DETAILS -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 22px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: separate;">
                <tr>
                  <td style="padding: 10px 14px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                    <div style="font-size: 11px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.08em; margin: 0;">
                      LOGIN REQUEST
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 14px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="35%" style="font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 5px;">Target Portal:</td>
                        <td style="font-size: 12px; font-weight: 700; color: #0f172a; padding-bottom: 5px;">JCER ERP ${portalName}</td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size: 12px; font-weight: 600; color: #64748b; padding-bottom: 5px;">Date:</td>
                        <td style="font-size: 12px; font-weight: 700; color: #0f172a; padding-bottom: 5px;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size: 12px; font-weight: 600; color: #64748b;">Time:</td>
                        <td style="font-size: 12px; font-weight: 700; color: #0f172a;">${timeStr}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 6. SECURITY WARNING -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 22px;">
                <tr>
                  <td style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px;">
                    <div style="font-size: 11px; font-weight: 800; color: #b91c1c; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;">
                      SECURITY NOTICE
                    </div>
                    <div style="font-size: 12px; color: #991b1b; line-height: 1.5; font-weight: 500;">
                      If you did not initiate this login, do not share the OTP with anyone and contact the JCER ERP administrator immediately.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- 7. POST-VERIFICATION MESSAGE -->
              <div style="font-size: 12px; color: #64748b; line-height: 1.5; padding: 0 2px;">
                After successful verification, additional OTP verification may not be required for subsequent ${portalName} logins according to the current security session policy.
              </div>

            </td>
          </tr>

          <!-- 8. FOOTER -->
          <tr>
            <td style="background-color: #f8fafc; padding: 22px 26px; text-align: center; border-top: 1px solid #e2e8f0;">
              <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 3px;">
                Jain College of Engineering &amp; Research
              </div>
              <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">
                JCER ERP &mdash; Belagavi, Karnataka
              </div>
              <div style="font-size: 12px; color: #475569; margin-bottom: 12px;">
                Official Website:
                <a href="https://jcer.in" target="_blank" rel="noopener noreferrer" style="color: #1d4ed8; font-weight: 700; text-decoration: none;">
                  jcer.in
                </a>
              </div>
              <div style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
                This is an automated security notification.<br />
                Please do not reply to this email.
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

class EmailService {
  private transporter: Transporter | null = null;
  private brevoApiKey: string | null = null;
  private senderEmail: string;
  private senderName: string;

  constructor() {
    this.brevoApiKey = process.env.BREVO_API_KEY || null;
    this.senderEmail =
      process.env.BREVO_SENDER_EMAIL ||
      process.env.EMAIL_USER ||
      'admissions@jcer.in';

    this.senderName =
      process.env.BREVO_SENDER_NAME ||
      'JCER Admission ERP';

    if (this.brevoApiKey) {
      logger.info(
        '✅ Brevo Transactional Email Service configured via REST API'
      );
    } else {
      this.initNodemailer();
    }
  }

  private initNodemailer() {
    if (process.env.EMAIL_OTP_ENABLED !== 'true') {
      logger.info(
        'Nodemailer SMTP email sending is disabled (EMAIL_OTP_ENABLED !== true). Using mock transporter.'
      );

      this.transporter = {
        sendMail: async (options: any) => {
          logger.info(
            `[MOCK EMAIL] To: ${options.to}, Subject: ${options.subject}`
          );

          return {
            messageId: 'mock-id-' + Date.now(),
          };
        },

        verify: async () => true,
      } as any;

      return;
    }

    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 30000,
    });
  }

  /**
   * Internal dispatcher:
   * Tries Brevo REST API first if configured, else Nodemailer.
   *
   * IMPORTANT:
   * This method is used by OTP/security emails as well as
   * normal notifications.
   *
   * DO NOT add LOAD_TEST_MODE logic here.
   */
  private async dispatchEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    try {
      if (this.brevoApiKey) {
        const response = await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            sender: {
              name: this.senderName,
              email: this.senderEmail,
            },

            to: [{ email: to }],

            subject,

            htmlContent: html,
          },
          {
            headers: {
              'api-key': this.brevoApiKey,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },

            timeout: 15000,
          }
        );

        logger.info(
          `✅ Brevo Email sent to ${to} (MessageID: ${
            response.data?.messageId || 'sent'
          })`
        );

        return true;
      }

      if (this.transporter) {
        const from = `${this.senderName} <${this.senderEmail}>`;

        const info = await this.transporter.sendMail({
          from,
          to,
          subject,
          html,
        });

        logger.info(
          `✅ Nodemailer email sent to ${to} (MessageID: ${info.messageId})`
        );

        return true;
      }

      logger.warn(
        `No active email transporter available to send email to ${to}`
      );

      return false;
    } catch (error: any) {
      logger.error(
        `❌ Failed to send email to ${to}: ${
          error.response?.data?.message || error.message
        }`
      );

      // Never throw error to caller
      // Prevent transaction rollbacks.
      return false;
    }
  }

  /**
   * Notification-only dispatcher.
   *
   * During the 150-student load test:
   *
   * LOAD_TEST_MODE=true
   *
   * Normal notification emails are skipped.
   *
   * OTP/security emails DO NOT use this method.
   */
  private async dispatchNotificationEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    if (process.env.LOAD_TEST_MODE === 'true') {
      logger.info(
        `⏭️ LOAD TEST MODE: Notification email skipped to ${to} - ${subject}`
      );

      // Return true so the main application flow is not affected.
      return true;
    }

    return this.dispatchEmail(to, subject, html);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. OTP EMAILS
  // ─────────────────────────────────────────────────────────────────────────

  /** Student Registration OTP */
  public async sendRegistrationOTP(
    email: string,
    name: string,
    otp: string
  ): Promise<boolean> {
    const html = getJcerCommonEmailHtml({
      recipientName: name,

      subject:
        'JCER Admission Portal - Email Verification OTP',

      badgeTitle: 'Email Verification',

      mainMessage:
        'Thank you for registering on the JCER Admission Portal. Please verify your email address using the One-Time Password (OTP) code below to complete your registration.',

      otpCode: otp,

      otpExpiryMinutes: 5,

      securityNote:
        'Do not share this OTP with anyone. Your account registration requires successful OTP verification.',
    });

    // IMPORTANT: Registration OTP remains ENABLED.
    return this.dispatchEmail(
      email,
      'JCER Admission Portal - Email Verification OTP',
      html
    );
  }

  /** Daily Login OTP for Administrator, Principal, Dean Academic, HOD, and Faculty */
  public async sendDailyLoginOTP(
    email: string,
    name: string,
    otp: string,
    role: string
  ): Promise<boolean> {
    const roleUpper = (role || 'ADMIN').toUpperCase();
    let portalName = 'Admin Portal';

    if (roleUpper === 'PRINCIPAL') {
      portalName = 'Principal Portal';
    } else if (roleUpper === 'DEAN') {
      portalName = 'Dean Academic Portal';
    } else if (roleUpper === 'HOD') {
      portalName = 'HOD Portal';
    } else if (roleUpper === 'TEACHER' || roleUpper === 'FACULTY') {
      portalName = 'Faculty Portal';
    }

    const subject = `JCER ERP ${portalName} — Security Verification Code`;

    const html = getAdminSecurityOtpEmailHtml({
      recipientName: name,
      otpCode: otp,
      role,
      otpExpiryMinutes: 5,
    });

    // IMPORTANT: Admin/Principal OTP remains ENABLED.
    return this.dispatchEmail(
      email,
      subject,
      html
    );
  }

  /** Forgot Password OTP for All Roles */
  public async sendForgotPasswordOTP(
    email: string,
    name: string,
    otp: string,
    role?: string
  ): Promise<boolean> {
    const rolePrefix = role
      ? `${role.charAt(0) + role.slice(1).toLowerCase()} `
      : '';

    const subject = `JCER ${rolePrefix}Portal - Password Reset OTP`;

    const html = getJcerCommonEmailHtml({
      recipientName: name,

      subject,

      badgeTitle: 'Password Recovery',

      mainMessage:
        'We received a request to reset your password for your JCER ERP account. Use the verification code below to authorize your password reset.',

      otpCode: otp,

      otpExpiryMinutes: 5,

      securityNote:
        'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.',
    });

    // IMPORTANT: Forgot-password OTP remains ENABLED.
    return this.dispatchEmail(
      email,
      subject,
      html
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. NOTIFICATION EMAILS
  // ─────────────────────────────────────────────────────────────────────────

  /** Registration Successful Email */
  public async sendRegistrationSuccessEmail(
    email: string,
    name: string,
    applicationType:
      | 'FRESH_ADMISSION'
      | 'LATERAL_ENTRY'
      | string
  ): Promise<boolean> {
    const typeLabel =
      applicationType === 'LATERAL_ENTRY'
        ? 'Diploma Lateral Entry (3rd Semester)'
        : 'Fresh Admission (1st Semester)';

    const html = getJcerCommonEmailHtml({
      recipientName: name,

      subject:
        'JCER Admission Portal - Registration Successful',

      badgeTitle: 'Account Created',

      mainMessage:
        'Your JCER Admission Portal account has been successfully created! You can now log into your dashboard and complete your admission application.',

      details: [
        {
          label: 'Registered Email',
          value: email,
        },
        {
          label: 'Application Track',
          value: typeLabel,
        },
      ],

      actionMessage:
        'Log in to your portal to start filling your 7-step admission details.',
    });

    return this.dispatchNotificationEmail(
      email,
      'JCER Admission Portal - Registration Successful',
      html
    );
  }

  /** Application Submitted (Fresh / Lateral) */
  public async sendApplicationSubmittedNotification(
    email: string,
    data: {
      studentName: string;
      applicationNumber: string;
      applicationType:
        | 'FRESH_ADMISSION'
        | 'LATERAL_ENTRY'
        | string;
      semester: string;
      academicYear: string;
      submissionDate: string;
    }
  ): Promise<boolean> {
    const isLateral =
      data.applicationType === 'LATERAL_ENTRY';

    const typeTitle = isLateral
      ? 'Diploma Lateral Entry Application Submitted'
      : 'Admission Application Submitted';

    const subject =
      `JCER Admission Portal - ${typeTitle}`;

    const html = getJcerCommonEmailHtml({
      recipientName: data.studentName,

      subject,

      badgeTitle: 'Application Submitted',

      mainMessage:
        `Your ${
          isLateral
            ? 'Diploma Lateral Entry'
            : 'Fresh Admission'
        } application has been successfully submitted and is under verification by the Admissions Office.`,

      details: [
        {
          label: 'Application No',
          value: data.applicationNumber,
        },
        {
          label: 'Application Type',
          value: isLateral
            ? 'Diploma Lateral Entry'
            : 'Fresh Admission',
        },
        {
          label: 'Entry Semester',
          value: data.semester,
        },
        {
          label: 'Academic Year',
          value: data.academicYear,
        },
        {
          label: 'Submission Date',
          value: data.submissionDate,
        },
        {
          label: 'Status',
          value: 'UNDER_REVIEW',
        },
      ],

      actionMessage:
        'You can log into your student portal anytime to track verification status in real-time.',
    });

    return this.dispatchNotificationEmail(
      email,
      subject,
      html
    );
  }

  /** Provisional Admission Submitted */
  public async sendProvisionalSubmittedNotification(
    email: string,
    data: {
      studentName: string;
      provisionalAdmissionNumber: string;
      semester: string;
      academicYear: string;
      submissionDate: string;
    }
  ): Promise<boolean> {
    const subject =
      'JCER Admission Portal - Provisional Admission Submitted';

    const html = getJcerCommonEmailHtml({
      recipientName: data.studentName,

      subject,

      badgeTitle: 'Provisional Admission',

      mainMessage:
        'Your Provisional Admission request has been submitted successfully.',

      details: [
        {
          label: 'Provisional Admission No',
          value: data.provisionalAdmissionNumber,
        },
        {
          label: 'Application Type',
          value: 'Provisional Admission',
        },
        {
          label: 'Target Semester',
          value: data.semester,
        },
        {
          label: 'Academic Year',
          value: data.academicYear,
        },
        {
          label: 'Submission Date',
          value: data.submissionDate,
        },
        {
          label: 'Status',
          value: 'PENDING_APPROVAL',
        },
      ],

      actionMessage:
        'Your application is awaiting verification by the HOD / Admissions Office.',
    });

    return this.dispatchNotificationEmail(
      email,
      subject,
      html
    );
  }

  /** Correction Required Notification */
  public async sendCorrectionRequiredNotification(
    email: string,
    data: {
      studentName: string;
      applicationNumber: string;
      applicationType: string;
      semester?: string;
      academicYear?: string;
      reason: string;
      remarks?: string;
    }
  ): Promise<boolean> {
    const isLateral =
      data.applicationType === 'LATERAL_ENTRY';

    const isProvisional =
      data.applicationType === 'PROVISIONAL_ADMISSION';

    const typeLabel = isProvisional
      ? 'Provisional Admission'
      : isLateral
      ? 'Lateral Entry'
      : 'Admission';

    const subject =
      `JCER Admission Portal - ${typeLabel} Correction Required`;

    const details: Array<{
      label: string;
      value: string;
    }> = [
      {
        label: 'Application / PA No',
        value: data.applicationNumber,
      },
      {
        label: 'Application Type',
        value: typeLabel,
      },
    ];

    if (data.semester) {
      details.push({
        label: 'Semester',
        value: data.semester,
      });
    }

    if (data.academicYear) {
      details.push({
        label: 'Academic Year',
        value: data.academicYear,
      });
    }

    details.push({
      label: 'Correction Reason',
      value: data.reason,
    });

    if (data.remarks) {
      details.push({
        label: 'Remarks',
        value: data.remarks,
      });
    }

    const html = getJcerCommonEmailHtml({
      recipientName: data.studentName,

      subject,

      badgeTitle: 'Action Required',

      mainMessage:
        `Your ${typeLabel} application requires corrections before it can proceed further. Please review the remarks below and update your details.`,

      details,

      actionMessage:
        'Log into your student portal to update the highlighted sections and resubmit.',
    });

    return this.dispatchNotificationEmail(
      email,
      subject,
      html
    );
  }

  /** Approval Notification (Fresh / Lateral / Provisional) */
  public async sendApprovalNotification(
    email: string,
    data: {
      studentName: string;
      applicationNumber: string;
      applicationType: string;
      semester?: string;
      course?: string;
      branch?: string;
      academicYear?: string;
    }
  ): Promise<boolean> {
    const isLateral =
      data.applicationType === 'LATERAL_ENTRY';

    const isProvisional =
      data.applicationType === 'PROVISIONAL_ADMISSION';

    const typeLabel = isProvisional
      ? 'Provisional Admission'
      : isLateral
      ? 'Lateral Entry'
      : 'Fresh Admission';

    const subject =
      `JCER Admission Portal - ${typeLabel} Approved`;

    const details: Array<{
      label: string;
      value: string;
    }> = [
      {
        label: 'Application / PA No',
        value: data.applicationNumber,
      },
      {
        label: 'Application Type',
        value: typeLabel,
      },
    ];

    if (data.semester) {
      details.push({
        label: 'Semester',
        value: data.semester,
      });
    }

    if (data.course) {
      details.push({
        label: 'Course',
        value: data.course,
      });
    }

    if (data.branch) {
      details.push({
        label: 'Branch / Dept',
        value: data.branch,
      });
    }

    if (data.academicYear) {
      details.push({
        label: 'Academic Year',
        value: data.academicYear,
      });
    }

    details.push({
      label: 'Status',
      value: 'APPROVED',
    });

    const html = getJcerCommonEmailHtml({
      recipientName: data.studentName,

      subject,

      badgeTitle: 'Application Approved',

      mainMessage:
        `Congratulations! Your ${typeLabel} application (${data.applicationNumber}) has been officially approved by the Admissions Committee.`,

      details,

      actionMessage:
        'Please log into your student dashboard for next steps and instructions.',
    });

    return this.dispatchNotificationEmail(
      email,
      subject,
      html
    );
  }

  /** Rejection Notification */
  public async sendRejectionNotification(
    email: string,
    data: {
      studentName: string;
      applicationNumber: string;
      applicationType: string;
      semester?: string;
      academicYear?: string;
      rejectionReason: string;
    }
  ): Promise<boolean> {
    const isLateral =
      data.applicationType === 'LATERAL_ENTRY';

    const isProvisional =
      data.applicationType === 'PROVISIONAL_ADMISSION';

    const typeLabel = isProvisional
      ? 'Provisional Admission'
      : isLateral
      ? 'Lateral Entry'
      : 'Admission';

    const subject =
      `JCER Admission Portal - ${typeLabel} Rejected`;

    const details: Array<{
      label: string;
      value: string;
    }> = [
      {
        label: 'Application / PA No',
        value: data.applicationNumber,
      },
      {
        label: 'Application Type',
        value: typeLabel,
      },
    ];

    if (data.semester) {
      details.push({
        label: 'Semester',
        value: data.semester,
      });
    }

    if (data.academicYear) {
      details.push({
        label: 'Academic Year',
        value: data.academicYear,
      });
    }

    details.push({
      label: 'Rejection Reason',
      value: data.rejectionReason,
    });

    const html = getJcerCommonEmailHtml({
      recipientName: data.studentName,

      subject,

      badgeTitle: 'Application Status Update',

      mainMessage:
        `We regret to inform you that your ${typeLabel} application (${data.applicationNumber}) could not be approved.`,

      details,

      footerText:
        'For further queries regarding this decision, please contact the college admissions office.',
    });

    return this.dispatchNotificationEmail(
      email,
      subject,
      html
    );
  }

  /** Final Confirmation Notification */
  public async sendConfirmationNotification(
    email: string,
    data: {
      studentName: string;
      applicationNumber: string;
      applicationType: string;
      usn?: string;
      semester?: string;
      academicYear?: string;
    }
  ): Promise<boolean> {
    const isLateral =
      data.applicationType === 'LATERAL_ENTRY';

    const isProvisional =
      data.applicationType === 'PROVISIONAL_ADMISSION';

    const typeLabel = isProvisional
      ? 'Provisional Admission'
      : isLateral
      ? 'Lateral Entry'
      : 'Admission';

    const subject =
      `JCER Admission Portal - ${typeLabel} Confirmed`;

    const details: Array<{
      label: string;
      value: string;
    }> = [
      {
        label: 'Application / PA No',
        value: data.applicationNumber,
      },
      {
        label: 'Application Type',
        value: typeLabel,
      },
    ];

    if (data.usn) {
      details.push({
        label: 'Allocated USN',
        value: data.usn,
      });
    }

    if (data.semester) {
      details.push({
        label: 'Semester',
        value: data.semester,
      });
    }

    if (data.academicYear) {
      details.push({
        label: 'Academic Year',
        value: data.academicYear,
      });
    }

    details.push({
      label: 'Final Status',
      value: 'CONFIRMED / ENROLLED',
    });

    const html = getJcerCommonEmailHtml({
      recipientName: data.studentName,

      subject,

      badgeTitle: 'Admission Confirmed 🎉',

      mainMessage:
        `🎉 Congratulations ${data.studentName}! Your ${typeLabel} has been officially confirmed by the Principal. Welcome to Jain College of Engineering & Research!`,

      details,

      actionMessage:
        'You can download your official confirmed admission slip from your Student Dashboard.',
    });

    return this.dispatchNotificationEmail(
      email,
      subject,
      html
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEGACY HELPER METHODS FOR BACKWARD COMPATIBILITY
  // ─────────────────────────────────────────────────────────────────────────

  public async sendApplicationApprovedNotification(
    email: string,
    name: string,
    appNumber: string
  ): Promise<boolean> {
    return this.sendApprovalNotification(email, {
      studentName: name,
      applicationNumber: appNumber,
      applicationType: 'FRESH_ADMISSION',
    });
  }

  public async sendStudentResubmittedNotificationToAdmin(
    data: {
      studentName: string;
      applicationNumber: string;
      correctedSections: string[];
    }
  ): Promise<boolean> {
    const adminEmail =
      process.env.ADMIN_EMAIL || 'admissions@jcer.in';

    const html = getJcerCommonEmailHtml({
      recipientName: 'Administrator',

      subject:
        `Resubmitted: Application #${data.applicationNumber}`,

      badgeTitle: 'Correction Resubmitted',

      mainMessage:
        `Candidate ${data.studentName} has corrected and resubmitted their application (#${data.applicationNumber}).`,

      details: [
        {
          label: 'Application No',
          value: data.applicationNumber,
        },
        {
          label: 'Corrected Sections',
          value: data.correctedSections.join(', '),
        },
      ],

      actionMessage:
        'Please review the updated details in the Admin Review Workspace.',
    });

    return this.dispatchNotificationEmail(
      adminEmail,
      `Resubmitted: Application #${data.applicationNumber}`,
      html
    );
  }

  public async sendFeeReceiptUploadedNotification(
    data: {
      studentName: string;
      applicationNumber: string;
      studentEmail: string;
    }
  ): Promise<boolean> {
    const adminEmail =
      process.env.ADMIN_EMAIL || 'admissions@jcer.in';

    const html = getJcerCommonEmailHtml({
      recipientName: 'Administrator',

      subject:
        `Fee Receipt Uploaded — ${data.applicationNumber}`,

      badgeTitle: 'Fee Receipt Verification',

      mainMessage:
        `Student ${data.studentName} (${data.applicationNumber}) has uploaded their ₹500 Admission Fee Receipt.`,

      details: [
        {
          label: 'Application No',
          value: data.applicationNumber,
        },
        {
          label: 'Student Name',
          value: data.studentName,
        },
      ],

      actionMessage:
        'Log in to Admin Dashboard under Admission Fees queue to verify.',
    });

    return this.dispatchNotificationEmail(
      adminEmail,
      `Fee Receipt Uploaded — ${data.applicationNumber}`,
      html
    );
  }

  public async sendFeeVerifiedNotificationToPrincipal(
    data: {
      studentName: string;
      applicationNumber: string;
    }
  ): Promise<boolean> {
    const principalEmail =
      process.env.PRINCIPAL_EMAIL ||
      'principal@jcer.in';

    const html = getJcerCommonEmailHtml({
      recipientName: 'Principal',

      subject:
        `Admission Pending Sign-off — ${data.applicationNumber}`,

      badgeTitle: 'Final Sign-off Required',

      mainMessage:
        `Application ${data.applicationNumber} for student ${data.studentName} has been fully verified.`,

      details: [
        {
          label: 'Application No',
          value: data.applicationNumber,
        },
        {
          label: 'Student Name',
          value: data.studentName,
        },
      ],

      actionMessage:
        'Please review and confirm the admission in the Principal Portal.',
    });

    return this.dispatchNotificationEmail(
      principalEmail,
      `Admission Pending Sign-off — ${data.applicationNumber}`,
      html
    );
  }

  public async sendAdmissionConfirmedNotification(
    email: string,
    name: string,
    appNumber: string,
    usn: string
  ): Promise<boolean> {
    return this.sendConfirmationNotification(email, {
      studentName: name,
      applicationNumber: appNumber,
      applicationType: 'FRESH_ADMISSION',
      usn,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EMAIL CHANGE NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /** Send 6-digit OTP code to the requested NEW email address */
  public async sendEmailChangeOtp(
    newEmail: string,
    recipientName: string,
    otpCode: string,
    expiryMinutes: number = 10
  ): Promise<boolean> {
    const subject =
      'JCER ERP — Email Address Update Verification';

    const html = getJcerCommonEmailHtml({
      recipientName,

      subject,

      badgeTitle: 'Email Update OTP',

      headingText: 'Verify Your New Email Address',

      mainMessage:
        `You have requested to update your JCER ERP account email address to <strong>${escapeHtml(
          newEmail
        )}</strong>. Please enter the verification code below to authorize this change.`,

      otpCode,

      otpExpiryMinutes: expiryMinutes,

      securityNote:
        'If you did not initiate this email change request, please ignore this message and ensure your account password remains secure.',
    });

    // IMPORTANT:
    // Email-change OTP remains ENABLED.
    return this.dispatchEmail(
      newEmail,
      subject,
      html
    );
  }

  /** Send email change confirmation to the NEW email address */
  public async sendEmailChangeConfirmation(
    newEmail: string,
    recipientName: string
  ): Promise<boolean> {
    const subject =
      'JCER ERP — Email Address Updated Successfully';

    const html = getJcerCommonEmailHtml({
      recipientName,

      subject,

      badgeTitle: 'Email Address Updated',

      mainMessage:
        'Your JCER ERP account email address has been successfully updated.',

      details: [
        {
          label: 'New Email Address',
          value: newEmail,
        },
        {
          label: 'Status',
          value: 'VERIFIED & UPDATED',
        },
      ],

      actionMessage:
        'You can now use this email address to sign in to the JCER ERP portal with your existing password.',

      securityNote:
        'If you did not make this change, please contact the college administration immediately.',
    });

    return this.dispatchNotificationEmail(
      newEmail,
      subject,
      html
    );
  }

  /** Send security advisory notice to the OLD email address */
  public async sendOldEmailChangeNotification(
    oldEmail: string,
    recipientName: string,
    newEmail: string
  ): Promise<boolean> {
    const subject =
      'JCER ERP — Your Email Address Was Changed';

    const html = getJcerCommonEmailHtml({
      recipientName,

      subject,

      badgeTitle: 'Security Alert 🔒',

      mainMessage:
        `The primary email address for your JCER ERP account was recently changed to <strong>${escapeHtml(
          newEmail
        )}</strong>.`,

      actionMessage:
        'This notification was sent to your former email address as a security precaution.',

      securityNote:
        'If you authorized this change, no further action is required. If you did NOT make this change, please contact the college administration immediately to secure your account.',
    });

    return this.dispatchNotificationEmail(
      oldEmail,
      subject,
      html
    );
  }
}

export const emailService = new EmailService();

export default emailService;

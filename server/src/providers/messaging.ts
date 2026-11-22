/**
 * SmsProvider + EmailProvider — interfaces only for now, with log-only sandbox
 * stubs. Real implementations arrive in Phase 3 (SMS needs a DLT-registered sender
 * ID + templates the account owner supplies; email via SES/SMTP). They are 'mock'
 * today, so production refuses to start until real ones are configured.
 */

import { AdapterMode, redact } from './types';

export interface SmsProvider {
  readonly mode: AdapterMode;
  send(to: string, templateId: string, vars: Record<string, string>): Promise<boolean>;
}

export interface EmailProvider {
  readonly mode: AdapterMode;
  send(to: string, subject: string, body: string): Promise<boolean>;
}

export class LogOnlySmsProvider implements SmsProvider {
  readonly mode: AdapterMode = 'mock';
  async send(to: string, templateId: string, vars: Record<string, string>): Promise<boolean> {
    console.log('[SmsProvider:mock] would send', redact({ to, templateId, ...vars }));
    return true;
  }
}

export class LogOnlyEmailProvider implements EmailProvider {
  readonly mode: AdapterMode = 'mock';
  async send(to: string, subject: string): Promise<boolean> {
    console.log('[EmailProvider:mock] would send', redact({ to, subject }));
    return true;
  }
}

// ── Real adapters ────────────────────────────────────────────────────────────

/** Message text per template id. India needs a DLT-registered template for a real SMS sender; keep ids stable. */
const SMS_TEMPLATES: Record<string, (vars: Record<string, string>) => string> = {
  password_reset: (v) => `Your DriveDock password reset code is ${v.code}. It expires in ${v.minutes} minutes. Do not share it with anyone.`
};

export interface TwilioSettings {
  accountSid: string;
  authToken: string;
  from: string;
  timeoutMs?: number;
}

/** Sends SMS through Twilio's REST API (no SDK needed). Never logs the message text or the number. */
export class TwilioSmsProvider implements SmsProvider {
  readonly mode: AdapterMode = 'real';
  constructor(private readonly settings: TwilioSettings) {}

  async send(to: string, templateId: string, vars: Record<string, string>): Promise<boolean> {
    const template = SMS_TEMPLATES[templateId];
    if (!template) return false;
    const { accountSid, authToken, from, timeoutMs = 10000 } = this.settings;
    const body = new URLSearchParams({ To: to, From: from, Body: template(vars) });
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) console.error(`[SmsProvider:twilio] send failed with HTTP ${res.status}`);
      return res.ok;
    } catch (error) {
      console.error('[SmsProvider:twilio] send failed', (error as Error).name);
      return false;
    }
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Sends email over SMTP (Gmail app password, Brevo, Amazon SES SMTP, Mailtrap...). Never logs the body or address. */
export class SmtpEmailProvider implements EmailProvider {
  readonly mode: AdapterMode = 'real';
  private transport: import('nodemailer').Transporter | null = null;
  constructor(private readonly settings: SmtpSettings) {}

  private getTransport() {
    if (!this.transport) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer') as typeof import('nodemailer');
      const { host, port, user, pass } = this.settings;
      this.transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      });
    }
    return this.transport;
  }

  async send(to: string, subject: string, body: string): Promise<boolean> {
    try {
      await this.getTransport().sendMail({ from: this.settings.from, to, subject, text: body });
      return true;
    } catch (error) {
      console.error('[EmailProvider:smtp] send failed', (error as Error).name);
      return false;
    }
  }
}

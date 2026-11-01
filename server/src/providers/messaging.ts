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

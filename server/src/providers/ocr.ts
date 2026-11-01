/**
 * OcrProvider — document text extraction for the owner "scan document" autofill.
 * No OCR engine is wired into the server today, so this is a mock that returns no
 * fields. Note: OCR autofill is an owner-side convenience ONLY — extracted dates
 * are suggestions, never a basis for verified:true (Trust Model, Rule 6).
 */

import { AdapterMode } from './types';

export interface OcrResult {
  rawText: string;
  fields: Partial<{
    registrationNumber: string;
    issueDate: string;
    expiryDate: string;
  }>;
}

export interface OcrProvider {
  readonly mode: AdapterMode;
  extract(fileBuffer: Buffer, mimeType: string): Promise<OcrResult>;
}

export class MockOcrProvider implements OcrProvider {
  readonly mode: AdapterMode = 'mock';
  async extract(): Promise<OcrResult> {
    return { rawText: '', fields: {} };
  }
}

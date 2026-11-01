/**
 * OcrProvider — document text extraction for the owner "scan document" autofill.
 *
 * The real implementation wraps the existing Tesseract.js service (ocrService +
 * ocrParserService); the adapter exists so callers depend on an interface, not the
 * engine. OCR autofill is an owner-side convenience ONLY — extracted dates are
 * suggestions, never a basis for verified:true (Trust Model, Rule 6).
 */

import { AdapterMode } from './types';
import { DocumentType } from '../models/Document';
import { scanDocumentImage } from '../services/ocrService';
import { ParsedDates } from '../services/ocrParserService';

export interface OcrProvider {
  readonly mode: AdapterMode;
  /** Best-effort issue/expiry date suggestions from a document image. */
  scanDates(filePath: string, docType: DocumentType): Promise<ParsedDates>;
}

/** Real engine: delegates to the Tesseract.js service. Runs locally, so mode is 'real'. */
export class TesseractOcrProvider implements OcrProvider {
  readonly mode: AdapterMode = 'real';
  scanDates(filePath: string, docType: DocumentType): Promise<ParsedDates> {
    return scanDocumentImage(filePath, docType);
  }
}

/** No-op OCR for dev/test; returns no suggestions. */
export class MockOcrProvider implements OcrProvider {
  readonly mode: AdapterMode = 'mock';
  async scanDates(): Promise<ParsedDates> {
    return { issueDate: null, expiryDate: null };
  }
}

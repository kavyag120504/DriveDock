import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { DocumentType } from '../models/Document';
import { parseDocumentDates, ParsedDates } from './ocrParserService';
import { parseRcText, RcSuggestions } from './rcParserService';

const OCR_TIMEOUT_MS = 9000;

/** OCR text lines from an image (EXIF-rotated, grayscale, contrast-stretched). Throws on failure or timeout. */
export const recognizeLines = async (filePath: string): Promise<string[]> => {
  const preprocessed = await sharp(filePath)
    .rotate() // auto-orient using EXIF
    .grayscale()
    .normalize() // stretch contrast — helps with glare/low-contrast phone photos
    .resize({ width: 1600, withoutEnlargement: false })
    .toBuffer();

  const worker = await createWorker('eng');
  try {
    const recognition = await Promise.race([
      worker.recognize(preprocessed),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS)
      )
    ]);
    return recognition.data.lines?.map((l) => l.text) ?? recognition.data.text.split('\n');
  } finally {
    await worker.terminate();
  }
};

/**
 * Reads issue/expiry date candidates off a document photo. Best-effort only: on any
 * failure or timeout this throws, and the caller (documentController.scanDocument)
 * degrades to a null-filled response rather than erroring the manual-entry flow.
 */
export const scanDocumentImage = async (filePath: string, docType: DocumentType): Promise<ParsedDates> =>
  parseDocumentDates(await recognizeLines(filePath), docType);

/** Add Vehicle suggestions from an RC photo. Same failure contract as scanDocumentImage. */
export const scanRcImage = async (filePath: string): Promise<RcSuggestions> => parseRcText(await recognizeLines(filePath));

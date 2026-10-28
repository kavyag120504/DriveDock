import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { DocumentType } from '../models/Document';
import { parseDocumentDates, ParsedDates } from './ocrParserService';

const OCR_TIMEOUT_MS = 9000;

/**
 * Reads issue/expiry date candidates off a document photo. Best-effort only: on any
 * failure or timeout this throws, and the caller (documentController.scanDocument)
 * degrades to a null-filled response rather than erroring the manual-entry flow.
 */
export const scanDocumentImage = async (filePath: string, docType: DocumentType): Promise<ParsedDates> => {
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

    const lines = recognition.data.lines?.map((l) => l.text) ?? recognition.data.text.split('\n');
    return parseDocumentDates(lines, docType);
  } finally {
    await worker.terminate();
  }
};

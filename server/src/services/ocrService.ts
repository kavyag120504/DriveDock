import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import os from 'os';
import { ENV } from '../config/env';
import { DocumentType } from '../models/Document';
import { parseDocumentDates, ParsedDates } from './ocrParserService';
import { parseRcText, RcSuggestions } from './rcParserService';


const TARGET_WIDTH = 1600;

/**
 * Width to resize an (already upright) image to before OCR: 1600 px wide as before, but never more than
 * `maxPixels` in total. The old rule scaled everything to 1600 wide, so a 1080x2400 screenshot or a portrait
 * photo became up to three times as many pixels as a landscape camera shot and timed out on small hosted CPUs.
 */
export const ocrTargetWidth = (width: number, height: number, maxPixels: number = ENV.OCR_MAX_PIXELS): number => {
  if (!width || !height) return TARGET_WIDTH;
  let scale = TARGET_WIDTH / width;
  if (width * scale * height * scale > maxPixels) scale = Math.sqrt(maxPixels / (width * height));
  return Math.max(1, Math.round(width * scale));
};

/** OCR text lines from an image (EXIF-rotated, grayscale, contrast-stretched). Throws on failure or timeout. */
export const recognizeLines = async (filePath: string): Promise<string[]> => {
  const meta = await sharp(filePath).metadata();
  const swapped = (meta.orientation ?? 1) >= 5; // EXIF 5-8: stored sideways, displayed rotated
  const width = swapped ? meta.height ?? 0 : meta.width ?? 0;
  const height = swapped ? meta.width ?? 0 : meta.height ?? 0;
  const preprocessed = await sharp(filePath)
    .rotate() // auto-orient using EXIF
    .grayscale()
    .normalize() // stretch contrast — helps with glare/low-contrast phone photos
    .resize({ width: ocrTargetWidth(width, height), withoutEnlargement: false })
    .toBuffer();

  // Cache the language data somewhere writable; the default (current folder) is read-only in the
  // Docker image, which made every scan download it again.
  const worker = await createWorker('eng', undefined, { cachePath: ENV.OCR_CACHE_DIR || os.tmpdir() });
  try {
    const recognition = await Promise.race([
      worker.recognize(preprocessed),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout')), ENV.OCR_TIMEOUT_MS)
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

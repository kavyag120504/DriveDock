import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ENV } from '../config/env';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine - stores in memory temporarily or directly to disk
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();
    if (allowed.test(ext) || allowed.test(mime)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, WEBP) and PDF documents are allowed.'));
    }
  }
});

export interface UploadResult {
  fileUrl: string;
  fileHash: string;
}

/**
 * Computes SHA256 hash and handles either AWS S3 upload or local disk static serving
 */
export const processUploadedFile = async (
  file: Express.Multer.File,
  reqHost: string
): Promise<UploadResult> => {
  const fileBuffer = fs.readFileSync(file.path);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Check if AWS S3 is configured
  if (ENV.AWS_ACCESS_KEY_ID && ENV.AWS_SECRET_ACCESS_KEY && ENV.AWS_S3_BUCKET) {
    try {
      const s3Client = new S3Client({
        region: ENV.AWS_REGION,
        credentials: {
          accessKeyId: ENV.AWS_ACCESS_KEY_ID,
          secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY
        }
      });

      const s3Key = `documents/${file.filename}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: ENV.AWS_S3_BUCKET,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: file.mimetype
        })
      );

      const fileUrl = `https://${ENV.AWS_S3_BUCKET}.s3.${ENV.AWS_REGION}.amazonaws.com/${s3Key}`;
      // Clean up local temp file after S3 upload
      fs.unlinkSync(file.path);
      return { fileUrl, fileHash };
    } catch (s3Error) {
      console.warn('[UploadService] S3 upload failed, falling back to local storage:', s3Error);
      // Fallback to local below
    }
  }

  // Local storage URL
  const fileUrl = `http://${reqHost}/uploads/${file.filename}`;
  return { fileUrl, fileHash };
};

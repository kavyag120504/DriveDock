import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env';

// UPLOAD_STORAGE=gridfs keeps uploaded files in MongoDB (GridFS bucket "uploads") so they survive
// hosts with a temporary disk (e.g. Render free). They are still served from /uploads/<name>.
const GRIDFS_BUCKET = 'uploads';
const gridBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: GRIDFS_BUCKET });

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine - stores in memory temporarily or directly to disk
// Accepted content types, and the extension each is stored under. The app sends `image/${ext}`,
// so `image/jpg` is accepted too. The stored extension comes from this table, never from the
// client's file name, so a file can't be saved as .html/.svg and then served as a web page.
const STORED_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = STORED_EXTENSION[file.mimetype.toLowerCase()] ?? '';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (STORED_EXTENSION[file.mimetype.toLowerCase()]) {
      cb(null, true);
    } else {
      const err: any = new Error('Only images (JPEG, PNG, WEBP) and PDF documents are allowed.');
      err.statusCode = 400;
      cb(err);
    }
  }
});

/**
 * Removes a file multer already wrote to disk when the request is then rejected,
 * so refused uploads are not left behind in the publicly served uploads folder.
 */
export const discardUploadedFile = (file?: Express.Multer.File): void => {
  if (!file) return;
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch {
    // Cleanup is best effort and must never fail a request. On Windows the image library can still hold
    // the file for a moment after OCR (EBUSY/EPERM); the throw used to escape the error handler and
    // crash the server. Retry a few times shortly afterwards instead.
    let attempts = 3;
    const retry = () => {
      fs.unlink(file.path, (err) => {
        if (!err || err.code === 'ENOENT') return;
        if (--attempts > 0) setTimeout(retry, 500).unref();
        else console.warn('[UploadService] could not delete a temporary upload:', err.code);
      });
    };
    setTimeout(retry, 500).unref();
  }
};

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

  if (ENV.UPLOAD_STORAGE === 'gridfs') {
    await new Promise<void>((resolve, reject) => {
      gridBucket()
        .openUploadStream(file.filename, { metadata: { contentType: file.mimetype, sha256: fileHash } })
        .on('finish', () => resolve())
        .on('error', reject)
        .end(fileBuffer);
    });
    fs.unlinkSync(file.path);
  }

  // Local storage URL
  // reqHost may carry the scheme ("https://api.example"); behind a TLS proxy that keeps links https
  const base = /^https?:\/\//.test(reqHost) ? reqHost : `http://${reqHost}`;
  const fileUrl = `${base}/uploads/${file.filename}`;
  return { fileUrl, fileHash };
};

/**
 * Serves /uploads/<name> from GridFS when the file is not on local disk (mounted after express.static).
 * Only names this service generates are accepted, and the stored content type is sent with nosniff.
 */
export const serveStoredUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const name = req.params.name;
  if (ENV.UPLOAD_STORAGE !== 'gridfs' || !/^[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/.test(name)) return next();
  try {
    const [stored] = await gridBucket().find({ filename: name }).sort({ uploadDate: -1 }).limit(1).toArray();
    if (!stored) return next();
    res.setHeader('Content-Type', (stored.metadata as any)?.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(stored.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    gridBucket().openDownloadStream(stored._id).on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
};

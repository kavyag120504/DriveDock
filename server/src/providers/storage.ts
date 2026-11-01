/**
 * StorageProvider — wraps the existing upload service (S3 when configured, else
 * local disk). Behaviour unchanged. Phase 6 adds private buckets + signed URLs.
 */

import { AdapterMode } from './types';
import { hasS3Config } from '../config/env';
import { processUploadedFile, UploadResult } from '../services/uploadService';

export interface StorageProvider {
  readonly mode: AdapterMode;
  store(file: Express.Multer.File, reqHost: string): Promise<UploadResult>;
}

export class FileStorageProvider implements StorageProvider {
  // 'real' once S3 credentials exist; 'sandbox' means local-disk serving.
  readonly mode: AdapterMode = hasS3Config() ? 'real' : 'sandbox';

  store(file: Express.Multer.File, reqHost: string): Promise<UploadResult> {
    return processUploadedFile(file, reqHost);
  }
}

import { Request, Response } from 'express';
import { CONTENT_TYPES, verifyFileSignature } from '../services/fileAccess';
import { sendStoredFile } from '../services/uploadService';

/**
 * GET /api/v1/files/:name?exp=&sig=. The signed, expiring link is the credential (an <Image> cannot send a
 * bearer token), and links are only minted inside responses the caller was already allowed to receive.
 */
export const serveSignedFile = async (req: Request, res: Response): Promise<void> => {
  const name = req.params.name;
  if (!verifyFileSignature(name, req.query.exp, req.query.sig)) {
    res.status(403).json({ success: false, code: 'FILE_LINK_INVALID', message: 'This file link is invalid or has expired.' });
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Type', CONTENT_TYPES[name.split('.').pop() || ''] || 'application/octet-stream');
  try {
    if (!(await sendStoredFile(name, res)) && !res.headersSent) {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  } catch {
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Could not read the file' });
  }
};

import { Request, Response } from 'express';
import { buildBuyerReport, BuyerReportError } from '../services/buyerReport.service';

export const getBuyerReport = async (req: Request, res: Response): Promise<void> => {
  const { token: raw } = req.query;
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ success: false, message: 'token query parameter is required' });
    return;
  }
  // Accept a whole share link (".../public/twin?token=...") as well as the bare code
  const match = raw.trim().match(/[?&]token=([^&#\s]+)/);
  const token = match ? decodeURIComponent(match[1]) : raw.trim();

  try {
    const report = await buildBuyerReport(token);
    res.status(200).json({ success: true, data: report });
  } catch (err: unknown) {
    if (err instanceof BuyerReportError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    console.error('[BuyerReport]', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

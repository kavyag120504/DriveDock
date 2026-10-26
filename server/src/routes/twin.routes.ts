import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middleware/auth';
import {
  createTransfer,
  previewTransfer,
  requestTransfer,
  approveTransfer,
  rejectTransfer,
  cancelTransfer,
  listTransfers,
  getTimeline,
  getScore,
  createShare,
  revokeShare,
  listShares
} from '../controllers/twin.controller';

const router = Router();

// All twin routes require a valid JWT
router.use(authenticate);

// Owner-only: initiate a transfer
router.post('/transfers', authorizeRoles('owner'), createTransfer);

// Any authenticated owner: preview a pending transfer before accepting
router.get('/transfers/preview', authorizeRoles('owner'), previewTransfer);

// Buyer: apply to take ownership (scanned transfer QR). Nothing changes hands yet.
router.post('/transfers/request', authorizeRoles('owner'), requestTransfer);

// Seller: approve the buyer's request (ownership moves now) or decline it
router.post('/transfers/:id/approve', authorizeRoles('owner'), approveTransfer);
router.post('/transfers/:id/reject', authorizeRoles('owner'), rejectTransfer);

// Seller cancels their own pending transfer
router.post('/transfers/:id/cancel', authorizeRoles('owner'), cancelTransfer);

// List my incoming and outgoing transfers
router.get('/transfers', authorizeRoles('owner'), listTransfers);

// Current owner: unified history timeline
router.get('/vehicles/:id/timeline', authorizeRoles('owner'), getTimeline);

// Current owner: Twin Score + ownership chain
router.get('/vehicles/:id/score', authorizeRoles('owner'), getScore);

// Current owner: generate a read-only share link/QR (7 days, revocable)
router.post('/vehicles/:id/share', authorizeRoles('owner'), createShare);

// Current owner: list active share links for a vehicle
router.get('/vehicles/:id/shares', authorizeRoles('owner'), listShares);

// Current owner: revoke a share
router.delete('/shares/:id', authorizeRoles('owner'), revokeShare);

export default router;

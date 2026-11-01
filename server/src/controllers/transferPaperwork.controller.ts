import { Request, Response } from 'express';
import { TransferPaperwork } from '../models/TransferPaperwork';
import { isRealIsoDate, validatePaperworkPatch } from '../services/paperworkValidation';
import { PaperworkKeyError } from '../services/fieldCrypto';
import { audit } from '../services/paperworkAudit';
import {
  applyPatch,
  buildChecklist,
  buildView,
  computeContext,
  confirmSaleDate,
  ensureAcceptedPaperwork,
  findPartyTransfer,
  getOrCreatePaperwork,
  setStepStatus,
  stepParty,
  wipePersonalData,
  Viewer
} from '../services/transferPaperwork.service';
import { registrationStateOf } from '../services/indianStates';
import { Vehicle } from '../models/Vehicle';
import { openDoc } from '../services/paperworkFields';
import { buildWorksheetPdf, WorksheetContext, WorksheetKind, WORKSHEET_KINDS } from '../services/formPdfService';
import { ENV } from '../config/env';

type Found = NonNullable<Awaited<ReturnType<typeof findPartyTransfer>>>;

/** Dotted names of the fields in a patch (for the audit log: names only, never values). */
const fieldNames = (obj: Record<string, any>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value) ? fieldNames(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  );

/** The caller's transfer, or a 404 for anyone who is not a party (the same answer for a bad id). */
const requireParty = async (req: Request, res: Response): Promise<Found | null> => {
  const found = await findPartyTransfer(req.params.id, req.user!.userId);
  if (!found) {
    res.status(404).json({ success: false, message: 'Transfer not found' });
    return null;
  }
  return found;
};

/** Paperwork exists only for a live request or an approved transfer. */
const isOpen = (status: string, expiresAt: Date): boolean =>
  status === 'accepted' || (status === 'requested' && expiresAt > new Date());

const notAvailable = (res: Response): void => {
  res.status(409).json({ success: false, code: 'NOT_AVAILABLE', message: 'Paperwork is not available for this transfer right now' });
};

const keysUnavailable = (res: Response): void => {
  res.status(503).json({
    success: false,
    code: 'PAPERWORK_UNAVAILABLE',
    message: 'Your saved details cannot be read right now. You can delete them and enter them again.'
  });
};

const handleError = async (err: any, req: Request, res: Response, transferId?: string): Promise<void> => {
  if (err instanceof PaperworkKeyError) {
    if (transferId) {
      await audit({ transferId, userId: req.user!.userId, role: 'system', action: 'decrypt_failed', ip: req.ip });
    }
    keysUnavailable(res);
    return;
  }
  console.error('[TransferPaperwork]', err?.message);
  res.status(500).json({ success: false, message: 'Something went wrong' });
};

const viewOf = async (found: Found, req: Request) => {
  const stored = await TransferPaperwork.findOne({ transferId: found.transfer._id });
  return buildView({ transfer: found.transfer, role: found.role, userId: req.user!.userId, stored });
};

// ── GET /twin/transfers/:id/paperwork ────────────────────────────────────────

export const getPaperwork = async (req: Request, res: Response): Promise<void> => {
  const found = await requireParty(req, res);
  if (!found) return;
  const { transfer, role } = found;
  try {
    if (!isOpen(transfer.status, transfer.expiresAt)) return notAvailable(res);

    // Approval prepares this itself; this repairs a transfer whose preparation failed
    if (transfer.status === 'accepted' && !(await TransferPaperwork.exists({ transferId: transfer._id }))) {
      await ensureAcceptedPaperwork(transfer._id);
    }

    const data = await viewOf(found, req);
    await audit({ transferId: transfer._id, userId: req.user!.userId, role, action: 'view', ip: req.ip });
    res.status(200).json({ success: true, data });
  } catch (err) {
    await handleError(err, req, res, transfer._id.toString());
  }
};

// ── PUT /twin/transfers/:id/paperwork ────────────────────────────────────────

export const putPaperwork = async (req: Request, res: Response): Promise<void> => {
  const found = await requireParty(req, res);
  if (!found) return;
  const { transfer, role } = found;
  try {
    if (!isOpen(transfer.status, transfer.expiresAt)) return notAvailable(res);

    const result = validatePaperworkPatch(role, req.body);
    if (result.forbidden.length > 0) {
      res.status(400).json({
        success: false,
        code: 'FIELD_NOT_ALLOWED',
        message: 'You cannot change these details',
        forbidden: result.forbidden,
        errors: result.errors
      });
      return;
    }
    if (!result.ok) {
      res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Some details need fixing', errors: result.errors });
      return;
    }

    const applied = await applyPatch(transfer, role, result.patch);
    if (applied.errors) {
      res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Some details need fixing', errors: applied.errors });
      return;
    }

    const { party, ...otherSections } = result.patch;
    const written = fieldNames(party ? { ...otherSections, [role]: party } : otherSections);
    await audit({ transferId: transfer._id, userId: req.user!.userId, role, action: 'update', fields: written, ip: req.ip });

    const data = await viewOf(found, req);
    res.status(200).json({ success: true, data });
  } catch (err) {
    await handleError(err, req, res, transfer._id.toString());
  }
};

// ── POST /twin/transfers/:id/sale-date/confirm ───────────────────────────────

export const postConfirmSaleDate = async (req: Request, res: Response): Promise<void> => {
  const found = await requireParty(req, res);
  if (!found) return;
  const { transfer, role } = found;
  try {
    if (role !== 'buyer') {
      res.status(403).json({ success: false, message: 'Only the buyer confirms the sale date' });
      return;
    }
    if (!isRealIsoDate(req.body?.date)) {
      res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Send the date you are confirming as YYYY-MM-DD' });
      return;
    }

    const outcome = await confirmSaleDate(transfer, req.body.date);
    if (outcome === 'not_accepted') return notAvailable(res);
    if (outcome === 'no_date') {
      res.status(409).json({ success: false, code: 'NO_DATE', message: 'The seller has not entered a sale date yet' });
      return;
    }
    if (outcome === 'date_changed') {
      res.status(409).json({ success: false, code: 'DATE_CHANGED', message: 'The seller changed the sale date. Check the new date and confirm again.' });
      return;
    }

    await audit({ transferId: transfer._id, userId: req.user!.userId, role, action: 'sale_date_confirm', fields: ['sale.dateConfirmedAt'], ip: req.ip });
    const data = await viewOf(found, req);
    res.status(200).json({ success: true, data });
  } catch (err) {
    await handleError(err, req, res, transfer._id.toString());
  }
};

// ── PUT /twin/transfers/:id/checklist/:key ───────────────────────────────────

export const putChecklistStep = async (req: Request, res: Response): Promise<void> => {
  const found = await requireParty(req, res);
  if (!found) return;
  const { transfer, role } = found;
  try {
    const { key } = req.params;
    // A step that isn't yours, or doesn't exist, looks the same as a missing one
    if (stepParty(key) !== role) {
      res.status(404).json({ success: false, message: 'Step not found' });
      return;
    }
    if (transfer.status !== 'accepted') return notAvailable(res);

    const status = req.body?.status;
    if (status !== 'done' && status !== 'skipped' && status !== null) {
      res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'status must be "done", "skipped" or null' });
      return;
    }

    const pw = await getOrCreatePaperwork(transfer);
    const vehicle = await Vehicle.findById(transfer.vehicleId).select('regNumber');
    const applies = buildChecklist(pw.toObject(), computeContext(pw.toObject(), registrationStateOf(vehicle?.regNumber))).some((s) => s.key === key);
    if (!applies) {
      res.status(404).json({ success: false, message: 'Step not found' });
      return;
    }

    await setStepStatus(transfer._id, key, status);
    await audit({ transferId: transfer._id, userId: req.user!.userId, role, action: 'checklist', fields: [key], ip: req.ip });
    const data = await viewOf(found, req);
    res.status(200).json({ success: true, data });
  } catch (err) {
    await handleError(err, req, res, transfer._id.toString());
  }
};

// ── GET /twin/transfers/:id/forms/:form ──────────────────────────────────────

/**
 * The worksheet PDF. Authenticated on every request: there are no download links or tokens, so a
 * forwarded URL gives nobody anything. Only the two parties of an approved transfer can fetch it.
 */
export const downloadForm = async (req: Request, res: Response): Promise<void> => {
  const found = await requireParty(req, res);
  if (!found) return;
  const { transfer, role } = found;
  try {
    const kind = req.params.form as WorksheetKind;
    if (!WORKSHEET_KINDS.includes(kind)) {
      res.status(404).json({ success: false, message: 'Unknown form' });
      return;
    }
    if (transfer.status !== 'accepted') return notAvailable(res);

    const stored = await getOrCreatePaperwork(transfer);
    const vehicle = await Vehicle.findById(transfer.vehicleId);
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }

    const ctx: WorksheetContext = {
      transferId: transfer._id.toString(),
      generatedAt: new Date(),
      officialFormsUrl: ENV.OFFICIAL_FORMS_URL,
      vehicle: {
        regNumber: vehicle.regNumber,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        fuelType: vehicle.fuelType,
        registrationState: registrationStateOf(vehicle.regNumber)?.name ?? null
      },
      data: openDoc(stored.toObject())
    };
    const { pdf, filename } = await buildWorksheetPdf(kind, ctx);

    await audit({ transferId: transfer._id, userId: req.user!.userId, role, action: 'form_download', form: kind, ip: req.ip });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.status(200).send(pdf);
  } catch (err) {
    await handleError(err, req, res, transfer._id.toString());
  }
};

// ── DELETE /twin/transfers/:id/paperwork/me ──────────────────────────────────

export const deleteMyDetails = async (req: Request, res: Response): Promise<void> => {
  const found = await requireParty(req, res);
  if (!found) return;
  const { transfer, role } = found;
  try {
    if (transfer.status !== 'accepted') return notAvailable(res);
    await wipePersonalData(transfer._id, role as Viewer);
    await audit({ transferId: transfer._id, userId: req.user!.userId, role, action: 'delete_my_details', ip: req.ip });
    res.status(200).json({ success: true, message: 'Your details have been deleted' });
  } catch (err) {
    await handleError(err, req, res, transfer._id.toString());
  }
};

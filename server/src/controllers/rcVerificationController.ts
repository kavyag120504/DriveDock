import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { ENV } from '../config/env';
import { DocumentModel, RcCheckOutcome } from '../models/Document';
import { Vehicle } from '../models/Vehicle';
import { providers } from '../providers';
import { normaliseRegistration, RcVerificationError } from '../providers/aryaRegistry';
import { RegistryVehicle } from '../providers/registry';
import { ownerScope } from '../services/accessService';
import { recordAudit } from '../services/auditLog';
import { scheduleDocumentReminders } from '../services/reminderService';

const CACHE_MS = 5 * 60 * 1000;
const inFlight = new Map<string, Promise<RegistryVehicle>>();
type RcProviderName = 'arya' | 'apiexpress' | 'cashfree' | 'idfy' | 'stampmitra';
const REGISTRY_SOURCES = ['arya', 'apiexpress', 'cashfree', 'idfy', 'stampmitra'];
const providerName = (): RcProviderName => ENV.RC_PROVIDER;
const labelOf = (provider: string): string =>
  provider === 'apiexpress' ? 'API Express' : provider === 'cashfree' ? 'Cashfree' : provider === 'idfy' ? 'IDfy' : provider === 'stampmitra' ? 'StampMitra' : 'Arya';
/** Vendor sandbox: canned data, so the result is shown but never changes the document. */
const testMode = (): boolean => providers.registry.testMode === true;
const TEST_PREFIX = 'TEST RESULT ONLY: this came from the provider\'s sandbox with sample data, not real registry records. Nothing on your document was changed. ';
const messagesFor = (L: string): Record<RcCheckOutcome, string> => ({
  verified: `RC registration and validity were verified through ${L}. This checks registry records, not ownership or the authenticity of the uploaded image.`,
  record_matched: `${L} matched an active RC record, but did not supply explicit RC validity dates. No new document verification was granted; fitness validity is not substituted for RC expiry.`,
  expired: `The RC validity date returned by ${L} has passed. This document is not compliant.`,
  inactive: `The registration returned by ${L} is inactive, suspended or scrapped. No verification was granted.`,
  unconfirmed: 'The RC record could not be confirmed as active with usable validity dates. No new verification was granted.',
  not_found: `${L} did not find a matching RC record. No verification was granted.`
});

const hasCredentials = (): boolean => {
  const p = providerName();
  if (p === 'cashfree') return !!ENV.CASHFREE_CLIENT_ID.trim() && !!ENV.CASHFREE_CLIENT_SECRET.trim();
  if (p === 'idfy') return !!ENV.RAPIDAPI_KEY.trim();
  if (p === 'stampmitra') return !!ENV.STAMPMITRA_API_KEY.trim();
  return !!(p === 'apiexpress' ? ENV.APIEXPRESS_API_KEY : ENV.ARYA_API_TOKEN).trim();
};
const configured = (): boolean => ENV.RC_VERIFICATION_ENABLED && hasCredentials() && providers.registry.mode === 'real';
const endOfDay = (date: string): Date => new Date(`${date}T23:59:59.999+05:30`);
const summary = (doc: any) => {
  const rv = doc?.registryVerification;
  if (!rv) return null;
  const message = messagesFor(labelOf(rv.provider))[rv.outcome as RcCheckOutcome];
  return { ...(rv.toObject?.() ?? rv), message: rv.testMode ? TEST_PREFIX + message : message };
};

async function ownVehicle(req: Request, res: Response) {
  if (!isValidObjectId(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid vehicle id' });
    return null;
  }
  const vehicle = await Vehicle.findOne({ _id: req.params.id, ...ownerScope(req.user!) });
  if (!vehicle) res.status(404).json({ success: false, message: 'Vehicle not found or unauthorized' });
  return vehicle;
}

/** Safe availability/read endpoint. It never contacts Arya or exposes the token. */
export const getRcVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicle = await ownVehicle(req, res);
    if (!vehicle) return;
    const doc = await DocumentModel.findOne({ vehicleId: vehicle._id, type: 'rc' }).sort({ updatedAt: -1 });
    res.json({ success: true, data: {
      enabled: configured(), provider: providerName(), providerLabel: labelOf(providerName()), testMode: testMode(), requiresUploadedRc: true,
      latest: summary(doc), cacheSeconds: CACHE_MS / 1000
    } });
  } catch {
    res.status(500).json({ success: false, message: 'Could not load RC verification status' });
  }
};

/** Explicit owner/admin action only; the plate always comes from the authorised vehicle. */
export const verifyRc = async (req: Request, res: Response): Promise<void> => {
  try {
    const vehicle = await ownVehicle(req, res);
    if (!vehicle) return;
    if (req.body?.consent !== true) {
      res.status(400).json({ success: false, code: 'RC_CONSENT_REQUIRED', message: `Confirm that this registration number may be sent to ${labelOf(providerName())} for verification.` });
      return;
    }
    if (!configured()) {
      res.status(503).json({ success: false, code: 'RC_NOT_CONFIGURED', message: `RC verification is not enabled on this server. Ask the administrator to configure ${labelOf(providerName())}.` });
      return;
    }
    const doc = await DocumentModel.findOne({ vehicleId: vehicle._id, type: 'rc' }).sort({ updatedAt: -1 });
    if (!doc?.fileUrl || !doc.fileHash) {
      res.status(409).json({ success: false, code: 'RC_UPLOAD_REQUIRED', message: 'Upload your RC document before requesting verification.' });
      return;
    }
    const registration = normaliseRegistration(vehicle.regNumber);
    const previous = doc.registryVerification;
    if (previous && previous.registrationNumber === registration && previous.fileHash === doc.fileHash &&
        previous.provider === providerName() && !!previous.testMode === testMode() &&
        Date.now() - previous.checkedAt.getTime() < CACHE_MS &&
        !(previous.outcome === 'verified' && (!previous.rcValidUpto || previous.rcValidUpto.getTime() < Date.now()))) {
      res.json({ success: true, data: { document: doc, result: summary(doc), cached: true } });
      return;
    }
    const key = `${doc._id}:${doc.fileHash}`;
    let lookup = inFlight.get(key);
    if (!lookup) {
      lookup = providers.registry.lookup(registration);
      inFlight.set(key, lookup);
    }
    let record: RegistryVehicle;
    try { record = await lookup; }
    finally { if (inFlight.get(key) === lookup) inFlight.delete(key); }

    const checkedAt = new Date();
    const expires = record.rcValidUpto ? endOfDay(record.rcValidUpto) : null;
    const issued = record.registrationDate ? new Date(`${record.registrationDate}T00:00:00+05:30`) : null;
    let outcome: RcCheckOutcome;
    if (record.found === false) outcome = 'not_found';
    else if (['inactive', 'suspended', 'scrapped'].includes(record.status)) outcome = 'inactive';
    else if (record.status !== 'active') outcome = 'unconfirmed';
    else if (expires && expires.getTime() < checkedAt.getTime()) outcome = 'expired';
    else if (!expires || !issued) outcome = 'record_matched';
    else if (issued > checkedAt || issued >= expires) outcome = 'unconfirmed';
    else outcome = 'verified';

    // The user may re-upload/edit while an external lookup is running. Never certify that new file.
    if (!(await Vehicle.exists({ _id: vehicle._id, ...ownerScope(req.user!) }))) {
      res.status(409).json({ success: false, message: 'Vehicle ownership changed during verification. Refresh the passport.' });
      return;
    }
    const isTest = testMode();
    const set: Record<string, unknown> = { registryVerification: {
      provider: providerName(), testMode: isTest, referenceId: record.referenceId!, registrationNumber: registration,
      checkedAt, outcome, registryStatus: record.status, rcValidUpto: expires, fileHash: doc.fileHash
    } };
    if (isTest) {
      // Sandbox data is canned: record the result for display, never touch verification, dates or status.
    } else if (outcome === 'verified') {
      set.verified = true;
      set.verificationSource = providerName();
      set.issuedByProviderId = null;
      set.lastUpdatedBy = 'registry';
      set.issueDate = issued;
      set.expiryDate = expires;
      set.status = expires!.getTime() - Date.now() <= 30 * 86400000 ? 'expiring_soon' : 'valid';
    } else if (['expired', 'inactive', 'not_found'].includes(outcome) || REGISTRY_SOURCES.includes(doc.verificationSource ?? '')) {
      set.verified = false;
      set.verificationSource = null;
      set.issuedByProviderId = null;
      set.lastUpdatedBy = 'registry';
      if (outcome === 'expired') { set.expiryDate = expires; set.status = 'expired'; }
    }
    const updated = await DocumentModel.findOneAndUpdate(
      { _id: doc._id, fileHash: doc.fileHash, updatedAt: doc.updatedAt }, { $set: set }, { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(409).json({ success: false, code: 'RC_DOCUMENT_CHANGED', message: 'The RC changed during verification. Refresh and check the current document.' });
      return;
    }
    if (set.verified !== undefined) {
      try {
        await scheduleDocumentReminders({ documentId: updated._id, vehicleId: vehicle._id, ownerId: vehicle.ownerId,
          expiryDate: updated.expiryDate, docType: 'rc', verified: updated.verified });
      } catch { console.error('[RCVerification] Could not reschedule RC reminders'); }
    }
    await recordAudit({ actorId: req.user!.userId, actorRole: req.user!.role, action: 'rc_registry_checked',
      entityType: 'document', entityId: updated._id, fields: ['registryVerification', 'verified'],
      metadata: { provider: providerName(), testMode: isTest, outcome, referenceId: record.referenceId! }, ip: req.ip });
    res.json({ success: true, data: { document: updated, result: summary(updated), cached: false } });
  } catch (error) {
    if (error instanceof RcVerificationError) {
      res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
      return;
    }
    // Do not log raw vendor errors/payloads or expose their contents to clients.
    res.status(502).json({ success: false, code: 'RC_CHECK_FAILED', message: 'RC verification could not be completed. No new verification was granted.' });
  }
};

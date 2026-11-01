import mongoose, { Types } from 'mongoose';
import { OwnershipTransfer } from '../models/OwnershipTransfer';
import { TransferPaperwork, ITransferPaperwork, IParty } from '../models/TransferPaperwork';
import { Vehicle } from '../models/Vehicle';
import { User } from '../models/User';
import { Reminder } from '../models/Reminder';
import { ruleFor, Scenario, Duty, DEADLINE_FOOTNOTE } from '../config/transferRules';
import { ENV } from '../config/env';
import { IndianState, normalizeState, registrationStateOf } from './indianStates';
import { openDoc, flattenPatch } from './paperworkFields';
import { todayIST, isRealIsoDate } from './paperworkValidation';
import { audit } from './paperworkAudit';

export type Viewer = 'seller' | 'buyer';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days before a deadline at which a reminder is sent (0 = on the day, at 9 am IST). */
export const REMINDER_LEAD_DAYS = [7, 2, 0];

// ── Dates (the sale date is a calendar date in India) ─────────────────────────

export const addDaysYmd = (ymd: string, days: number): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export const endOfIstDay = (ymd: string): Date => new Date(`${ymd}T23:59:59.999+05:30`);
const istMorning = (ymd: string): Date => new Date(`${ymd}T09:00:00+05:30`);

// ── Form 28 (NOC) and deadline scenario ───────────────────────────────────────

export type NocResult = 'likely' | 'not_indicated' | 'unknown';
export interface NocAssessment {
  result: NocResult;
  reason: string;
}

/**
 * Whether an NOC (Form 28) is probably needed. This is a pointer, never a ruling: the wording says
 * "normally" and always sends the person to their RTO.
 */
export const assessNoc = (registration: IndianState | null, buyer: IndianState | null): NocAssessment => {
  if (!registration) {
    return { result: 'unknown', reason: "We couldn't tell which state this vehicle is registered in. Ask your RTO whether an NOC is needed." };
  }
  if (!buyer) {
    return { result: 'unknown', reason: 'Add your state to check whether an NOC is needed.' };
  }
  if (registration.code !== buyer.code) {
    return {
      result: 'likely',
      reason: `Registered in ${registration.name}; the buyer's address is in ${buyer.name}. An NOC from the registering RTO is normally needed when a vehicle moves to another state. Confirm with your RTO.`
    };
  }
  return {
    result: 'not_indicated',
    reason: `Both are in ${registration.name}, so an NOC is not normally needed, but some RTOs still ask for one. Confirm with your RTO.`
  };
};

export const deriveScenario = (registration: IndianState | null, buyer: IndianState | null): Scenario => {
  if (!registration || !buyer) return 'unknown';
  return registration.code === buyer.code ? 'sameState' : 'otherState';
};

// ── Checklist ─────────────────────────────────────────────────────────────────

type StepPaperwork = Pick<ITransferPaperwork, 'sale' | 'loan' | 'insurance' | 'steps'> & { buyer?: IParty };

export interface ChecklistContext {
  scenario: Scenario;
  noc: NocAssessment;
  date?: string;
  dateState: 'missing' | 'unconfirmed' | 'confirmed';
  registration: IndianState | null;
}

export const computeContext = (pw: StepPaperwork, registration: IndianState | null): ChecklistContext => {
  const buyerState = normalizeState(pw.buyer?.address?.state);
  const date = pw.sale?.date;
  const dateState = !date ? 'missing' : pw.sale?.dateConfirmedAt ? 'confirmed' : 'unconfirmed';
  return { scenario: deriveScenario(registration, buyerState), noc: assessNoc(registration, buyerState), date, dateState, registration };
};

export interface ChecklistStep {
  key: string;
  party: Viewer;
  title: string;
  why: string;
  optional: boolean;
  status: 'open' | 'done' | 'skipped';
  dueAt: Date | null;
  dueNote: string;
  overdue: boolean;
}

interface StepDef {
  key: string;
  party: Viewer;
  duty?: Duty;
  applies?: (pw: StepPaperwork) => boolean;
  optional?: (ctx: ChecklistContext) => boolean;
  title: (pw: StepPaperwork) => string;
  why: (ctx: ChecklistContext) => string;
}

const STEP_DEFS: StepDef[] = [
  {
    key: 'seller_loan_noc',
    party: 'seller',
    duty: 'sellerForm29',
    applies: (pw) => pw.loan?.hypothecated === true,
    title: () => "Get your lender's NOC (and Form 35) before the RTO records the new owner",
    why: () => 'You said the vehicle is under a loan. The lender normally has to release it before the RTO can record the buyer as owner.'
  },
  {
    key: 'seller_form29_submit',
    party: 'seller',
    duty: 'sellerForm29',
    title: () => 'Submit Form 29 (notice of transfer) to your RTO',
    why: () => 'The seller reports the sale to the RTO. Keep the receipt: it is your proof that you are no longer the owner.'
  },
  {
    key: 'seller_insurance_ncb',
    party: 'seller',
    duty: 'buyerInsurance',
    title: () => 'Tell your insurer about the sale and ask for your NCB certificate',
    why: () => 'The buyer asks the insurer to move the policy. Ask your insurer for a no-claim-bonus (NCB) certificate so you keep that discount, and whether to cancel the old policy for a refund.'
  },
  {
    key: 'seller_handover_docs',
    party: 'seller',
    title: () => 'Hand over the RC, keys, signed forms and service records',
    why: () => 'The buyer needs the original RC and your signed forms to apply for the transfer.'
  },
  {
    key: 'buyer_noc_form28',
    party: 'buyer',
    duty: 'buyerForm30',
    optional: (ctx) => ctx.noc.result !== 'likely',
    title: () => 'Check whether you need an NOC (Form 28)',
    why: (ctx) => ctx.noc.reason
  },
  {
    key: 'buyer_form30_submit',
    party: 'buyer',
    duty: 'buyerForm30',
    title: () => 'Apply to your RTO to record the transfer (Form 30)',
    why: () => 'The buyer applies to the RTO where they live, with the RC, the seller\'s Form 29 copy, ID and address proof, insurance and PUC.'
  },
  {
    key: 'buyer_insurance_transfer',
    party: 'buyer',
    duty: 'buyerInsurance',
    title: (pw) => (pw.insurance?.buyerPlan === 'new' ? 'Buy an insurance policy in your name' : 'Ask the insurer to move the policy to your name'),
    why: () => "Cover under the old policy may not continue for you until the insurer records you as the owner. Apply within the time limit shown, with the RC (or Forms 29 and 30), the old policy and your ID."
  },
  {
    key: 'buyer_rc_received',
    party: 'buyer',
    title: () => 'Collect your updated RC and check the details',
    why: () => 'Once the RTO records you as the owner you receive an RC in your name. Keep it with the vehicle.'
  }
];

export const STEP_KEYS: readonly string[] = STEP_DEFS.map((d) => d.key);
export const stepParty = (key: string): Viewer | null => STEP_DEFS.find((d) => d.key === key)?.party ?? null;

const hasAnyNumber = (duty: Duty): boolean =>
  ruleFor(duty, 'sameState')?.days != null || ruleFor(duty, 'otherState')?.days != null;

/** Due date for a duty, or the reason there isn't one. Never falls back to an assumed date. */
const dueFor = (duty: Duty | undefined, ctx: ChecklistContext, viewer: Viewer): { dueAt: Date | null; note: string } => {
  if (!duty) return { dueAt: null, note: '' };
  if (ctx.dateState === 'missing') return { dueAt: null, note: 'Sale date required' };
  if (ctx.dateState === 'unconfirmed') {
    return { dueAt: null, note: viewer === 'seller' ? 'Waiting for the buyer to confirm the date' : 'Confirm the sale date to see this deadline' };
  }
  if (duty !== 'buyerInsurance' && ctx.scenario === 'unknown' && hasAnyNumber(duty)) {
    return { dueAt: null, note: viewer === 'buyer' ? 'Add your state to see your deadline' : "This deadline can't be worked out yet" };
  }
  const rule = ruleFor(duty, ctx.scenario);
  if (!rule || rule.days == null) return { dueAt: null, note: 'Complete this as soon as possible' };
  return { dueAt: endOfIstDay(addDaysYmd(ctx.date!, rule.days)), note: '' };
};

/** Every applicable step for both parties; callers keep the viewer's own. */
export const buildChecklist = (pw: StepPaperwork, ctx: ChecklistContext, now: number = Date.now()): ChecklistStep[] =>
  STEP_DEFS.filter((d) => !d.applies || d.applies(pw)).map((d) => {
    const status = pw.steps?.find((s) => s.key === d.key)?.status ?? 'open';
    const { dueAt, note } = dueFor(d.duty, ctx, d.party);
    return {
      key: d.key,
      party: d.party,
      title: d.title(pw),
      why: d.why(ctx),
      optional: d.optional ? d.optional(ctx) : false,
      status,
      dueAt,
      dueNote: note,
      overdue: !!dueAt && dueAt.getTime() < now && status === 'open'
    };
  });

// ── Reminders ─────────────────────────────────────────────────────────────────

const when = (dueAt: Date, now: number): string => {
  const days = Math.ceil((dueAt.getTime() - now) / DAY_MS);
  if (dueAt.getTime() < now) return `overdue since ${todayIST(dueAt.getTime())}`;
  if (days <= 1) return 'today or tomorrow';
  return `in ${days} days`;
};

/**
 * Replaces a transfer's unsent reminders. With no confirmed sale date there are no due-date reminders at
 * all, only a nudge to whoever must act. Called after every change that could alter a deadline.
 */
export const scheduleTransferReminders = async (transferId: Types.ObjectId | string, now: number = Date.now()): Promise<number> => {
  await Reminder.deleteMany({ transferId, kind: 'transfer', sent: false });

  const transfer = await OwnershipTransfer.findById(transferId);
  if (!transfer || transfer.status !== 'accepted') return 0;
  const pw = await TransferPaperwork.findOne({ transferId }).lean();
  if (!pw) return 0;
  const vehicle = await Vehicle.findById(transfer.vehicleId).select('regNumber');
  const ctx = computeContext(pw, registrationStateOf(vehicle?.regNumber));
  const owners: Record<Viewer, Types.ObjectId | null | undefined> = { seller: pw.sellerId, buyer: pw.buyerId };
  const rows: any[] = [];

  const base = (party: Viewer, taskKey: string, scheduledFor: Date, thresholdDays: number, message: string) => ({
    kind: 'transfer' as const,
    transferId,
    taskKey,
    anchorDate: ctx.date,
    vehicleId: transfer.vehicleId,
    ownerId: owners[party],
    scheduledFor,
    thresholdDays,
    channel: 'push' as const,
    message,
    sent: false
  });

  if (ctx.dateState !== 'confirmed') {
    const actor: Viewer = ctx.dateState === 'missing' ? 'seller' : 'buyer';
    const message = actor === 'seller'
      ? 'Enter the sale date for your vehicle transfer so your paperwork deadlines can be shown.'
      : 'Please confirm the sale date for your vehicle transfer to see your paperwork deadlines.';
    if (owners[actor]) rows.push(base(actor, 'confirm_sale_date', new Date(now), 0, message));
  } else {
    for (const step of buildChecklist(pw, ctx, now)) {
      if (step.status !== 'open' || !step.dueAt || !owners[step.party]) continue;
      const dueYmd = todayIST(step.dueAt.getTime());

      if (step.dueAt.getTime() < now) {
        rows.push(base(step.party, step.key, new Date(now), 0, `"${step.title}" is ${when(step.dueAt, now)}.`));
        continue;
      }
      const missed: number[] = [];
      for (const lead of REMINDER_LEAD_DAYS) {
        const fireAt = istMorning(addDaysYmd(dueYmd, -lead));
        if (fireAt.getTime() > now) {
          rows.push(base(step.party, step.key, fireAt, lead, `"${step.title}" is due ${lead === 0 ? 'today' : `in ${lead} days`}.`));
        } else {
          missed.push(lead);
        }
      }
      // Thresholds that have already passed are collapsed into one catch-up reminder, not a burst
      if (missed.length > 0) {
        rows.push(base(step.party, step.key, new Date(now), Math.min(...missed), `"${step.title}" is due ${when(step.dueAt, now)}.`));
      }
    }
  }

  if (rows.length > 0) await Reminder.insertMany(rows);
  return rows.length;
};

/**
 * The reminder job calls this just before sending. A transfer reminder is stale (and must be dropped)
 * if the paperwork is gone, the sale date is no longer confirmed, the date it was worked out from has
 * changed, or its step has been done. This closes the race between a date edit and the cleanup.
 */
export const isTransferReminderStillValid = async (rem: {
  transferId?: Types.ObjectId | null;
  taskKey?: string;
  anchorDate?: string;
}): Promise<boolean> => {
  if (!rem.transferId) return false;
  const pw = await TransferPaperwork.findOne({ transferId: rem.transferId }).lean();
  if (!pw) return false;
  const confirmed = !!(pw.sale?.date && pw.sale?.dateConfirmedAt);
  if (rem.taskKey === 'confirm_sale_date') return !confirmed;
  if (!confirmed || pw.sale?.date !== rem.anchorDate) return false;
  return !pw.steps?.some((s) => s.key === rem.taskKey);
};

// ── Access ────────────────────────────────────────────────────────────────────

/** The transfer and the caller's role in it, or null for anyone who is not a party (including bad ids). */
export const findPartyTransfer = async (transferId: string, userId: string) => {
  if (!mongoose.isValidObjectId(transferId) || !mongoose.isValidObjectId(userId)) return null;
  const transfer = await OwnershipTransfer.findOne({
    _id: transferId,
    $or: [{ fromOwnerId: userId }, { toOwnerId: userId }]
  });
  if (!transfer) return null;
  const role: Viewer = transfer.fromOwnerId.toString() === userId ? 'seller' : 'buyer';
  return { transfer, role };
};

// ── Storage ───────────────────────────────────────────────────────────────────

/** The paperwork document for a transfer, created on first use. Safe if both parties arrive at once. */
export const getOrCreatePaperwork = async (transfer: {
  _id: Types.ObjectId;
  vehicleId: Types.ObjectId;
  fromOwnerId: Types.ObjectId;
  toOwnerId?: Types.ObjectId | null;
}) => {
  const attempt = () =>
    TransferPaperwork.findOneAndUpdate(
      { transferId: transfer._id },
      {
        $setOnInsert: { transferId: transfer._id, vehicleId: transfer.vehicleId, sellerId: transfer.fromOwnerId },
        ...(transfer.toOwnerId ? { $set: { buyerId: transfer.toOwnerId } } : {})
      },
      { upsert: true, new: true }
    );
  try {
    return await attempt();
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    return await attempt();
  }
};

/** Called after approval. Never throws: approval must not depend on it. */
export const ensureAcceptedPaperwork = async (transferId: Types.ObjectId | string): Promise<void> => {
  try {
    const transfer = await OwnershipTransfer.findById(transferId);
    if (!transfer || transfer.status !== 'accepted') return;
    await getOrCreatePaperwork(transfer);
    await scheduleTransferReminders(transfer._id);
  } catch (err: any) {
    console.error('[TransferPaperwork] could not prepare paperwork after approval:', err?.message);
  }
};

export interface ApplyResult {
  errors?: Record<string, string>;
  paperwork?: ITransferPaperwork;
}

/** Writes a validated patch. A changed sale date drops its confirmation and every due-date reminder before returning. */
export const applyPatch = async (
  transfer: { _id: Types.ObjectId; vehicleId: Types.ObjectId; fromOwnerId: Types.ObjectId; toOwnerId?: Types.ObjectId | null; status: string },
  role: Viewer,
  patch: Record<string, any>
): Promise<ApplyResult> => {
  const doc = await getOrCreatePaperwork(transfer);
  const current = openDoc(doc.toObject());

  // Cross-field rule: the sale can't be dated before the vehicle was registered
  const saleDate = patch.sale?.date ?? current.sale?.date;
  const regDate = patch.vehicle?.registrationDate ?? current.vehicle?.registrationDate;
  if (saleDate && regDate && isRealIsoDate(saleDate) && saleDate < regDate) {
    return { errors: { 'sale.date': 'The sale date cannot be before the registration date' } };
  }

  const { party, ...rest } = patch;
  const nested: Record<string, any> = { ...rest };
  if (party) nested[role] = party;

  const set = flattenPatch(nested);
  const dateChanged = patch.sale?.date !== undefined && patch.sale.date !== current.sale?.date;
  if (dateChanged) set['sale.dateConfirmedAt'] = null;
  if (transfer.toOwnerId) set.buyerId = transfer.toOwnerId;

  const updated = await TransferPaperwork.findOneAndUpdate({ transferId: transfer._id }, { $set: set }, { new: true });
  if (!updated) return { errors: { transfer: 'Paperwork not found' } };

  // Anything that can move a deadline needs the reminders rebuilt, before the response goes out
  const stateChanged = role === 'buyer' && patch.party?.address?.state !== undefined &&
    patch.party.address.state !== current.buyer?.address?.state;
  if ((dateChanged || stateChanged) && transfer.status === 'accepted') {
    await scheduleTransferReminders(transfer._id);
  }
  return { paperwork: updated.toObject() };
};

export type ConfirmOutcome = 'confirmed' | 'no_date' | 'date_changed' | 'not_accepted';

export const confirmSaleDate = async (
  transfer: { _id: Types.ObjectId; status: string },
  date: string
): Promise<ConfirmOutcome> => {
  if (transfer.status !== 'accepted') return 'not_accepted';
  const pw = await TransferPaperwork.findOne({ transferId: transfer._id }).select('sale.date');
  if (!pw?.sale?.date) return 'no_date';
  // Conditional on the date still being the one the buyer saw
  const res = await TransferPaperwork.updateOne(
    { transferId: transfer._id, 'sale.date': date },
    { $set: { 'sale.dateConfirmedAt': new Date() } }
  );
  if (res.matchedCount === 0) return 'date_changed';
  await scheduleTransferReminders(transfer._id);
  return 'confirmed';
};

export const setStepStatus = async (
  transferId: Types.ObjectId,
  key: string,
  status: 'done' | 'skipped' | null
): Promise<void> => {
  await TransferPaperwork.updateOne({ transferId }, { $pull: { steps: { key } } });
  if (status) {
    await TransferPaperwork.updateOne({ transferId }, { $push: { steps: { key, status, at: new Date() } } });
  }
  await scheduleTransferReminders(transferId);
};

// ── Deleting personal data ────────────────────────────────────────────────────

const WIPE_SELLER: Record<string, ''> = {
  seller: '',
  'vehicle.chassisNo': '',
  'vehicle.engineNo': '',
  'loan.bankName': '',
  'insurance.policyNumber': ''
};
const WIPE_BUYER: Record<string, ''> = { buyer: '' };

/** Removes one party's (or everyone's) personal details. Steps, the sale date and audit rows stay. */
export const wipePersonalData = async (transferId: Types.ObjectId | string, who: Viewer | 'all'): Promise<void> => {
  const unset = who === 'seller' ? WIPE_SELLER : who === 'buyer' ? WIPE_BUYER : { ...WIPE_SELLER, ...WIPE_BUYER };
  await TransferPaperwork.updateOne(
    { transferId },
    { $unset: unset, ...(who === 'all' ? { $set: { personalDataClearedAt: new Date() } } : {}) }
  );
};

/** Deletes the paperwork (and its reminders) for transfers that will never complete. */
export const purgePaperworkFor = async (transferIds: Array<Types.ObjectId | string>): Promise<number> => {
  if (transferIds.length === 0) return 0;
  const res = await TransferPaperwork.deleteMany({ transferId: { $in: transferIds } });
  await Reminder.deleteMany({ transferId: { $in: transferIds }, kind: 'transfer' });
  for (const id of transferIds) await audit({ transferId: id, role: 'system', action: 'purge' });
  return res.deletedCount ?? 0;
};

/**
 * Daily retention job: paperwork whose transfer was rejected, cancelled or never approved before its
 * window closed is deleted; personal details on an approved transfer are wiped after the retention period.
 */
export const runPaperworkRetention = async (now: number = Date.now()): Promise<{ deleted: number; wiped: number }> => {
  const dead = await OwnershipTransfer.find({
    $or: [
      { status: { $in: ['rejected', 'cancelled', 'expired'] } },
      { status: { $in: ['pending', 'requested'] }, expiresAt: { $lt: new Date(now) } }
    ]
  }).select('_id');
  const withPaperwork = await TransferPaperwork.find({ transferId: { $in: dead.map((t) => t._id) } }).select('transferId');
  const deleted = await purgePaperworkFor(withPaperwork.map((p) => p.transferId));

  const cutoff = new Date(now - ENV.PAPERWORK_RETENTION_DAYS * DAY_MS);
  const old = await OwnershipTransfer.find({ status: 'accepted', acceptedAt: { $lt: cutoff } }).select('_id');
  const toWipe = await TransferPaperwork.find({ transferId: { $in: old.map((t) => t._id) }, personalDataClearedAt: null }).select('transferId');
  for (const p of toWipe) {
    await wipePersonalData(p.transferId, 'all');
    await audit({ transferId: p.transferId, role: 'system', action: 'purge', fields: ['retention'] });
  }
  return { deleted, wiped: toWipe.length };
};

// ── What each person gets to see ──────────────────────────────────────────────

const maskReg = (reg: string): string => (reg.length <= 6 ? '••••••' : reg.slice(0, 4) + '••••' + reg.slice(-2));

const has = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== '';

const partyMissing = (p: IParty | undefined, label: string, opts: { id?: boolean } = {}): string[] => {
  const out: string[] = [];
  const need: Array<[string, unknown]> = [
    ['full name', p?.fullName],
    ["father's / spouse's name", p?.guardianName],
    ['address', p?.address?.line1],
    ['city', p?.address?.city],
    ['state', p?.address?.state],
    ['pincode', p?.address?.pincode],
    ['mobile number', p?.mobile]
  ];
  if (opts.id) need.push(['ID type', p?.idType], ['ID last 4', p?.idLast4]);
  for (const [name, value] of need) if (!has(value)) out.push(`${label}: ${name}`);
  return out;
};

/** Which details each worksheet still lacks. Names the gaps only, never values. */
export const missingForForms = (pw: Partial<ITransferPaperwork>) => {
  const gap = (label: string, value: unknown) => (has(value) ? [] : [label]);
  const sale = gap('Sale date', pw.sale?.date);
  const form29 = [
    ...partyMissing(pw.seller, 'Seller'),
    ...partyMissing(pw.buyer, 'Buyer'),
    ...gap('Chassis number', pw.vehicle?.chassisNo),
    ...gap('Engine number', pw.vehicle?.engineNo),
    ...sale
  ];
  const form30 = [
    ...partyMissing(pw.buyer, 'Buyer', { id: true }),
    ...partyMissing(pw.seller, 'Seller'),
    ...gap('Chassis number', pw.vehicle?.chassisNo),
    ...gap('Engine number', pw.vehicle?.engineNo),
    ...gap('Registration date', pw.vehicle?.registrationDate),
    ...(pw.loan?.hypothecated ? gap('Lender name', pw.loan?.bankName) : []),
    ...sale
  ];
  const insurerLetter = [
    ...gap('Insurer name', pw.insurance?.insurerName),
    ...gap('Policy number', pw.insurance?.policyNumber),
    ...partyMissing(pw.buyer, 'Buyer'),
    ...gap('Seller name', pw.seller?.fullName),
    ...sale
  ];
  return { form29, form30, insurerLetter };
};

/** The viewer's own required details that are still blank (used to guide the forms). */
const ownMissing = (pw: Partial<ITransferPaperwork>, role: Viewer): string[] =>
  role === 'buyer'
    ? partyMissing(pw.buyer, 'You', { id: true })
    : [
        ...partyMissing(pw.seller, 'You'),
        ...(has(pw.vehicle?.chassisNo) ? [] : ['Chassis number']),
        ...(has(pw.vehicle?.engineNo) ? [] : ['Engine number']),
        ...(has(pw.sale?.date) ? [] : ['Sale date'])
      ];

/**
 * Builds what a party may see, following the access rules: nothing about the other person before the
 * transfer is approved, and only name, mobile and city/state after. `stored` is the raw document;
 * decryption happens here (it throws PaperworkKeyError if a key is missing).
 */
export const buildView = async (params: {
  transfer: { _id: Types.ObjectId; vehicleId: Types.ObjectId; status: string };
  role: Viewer;
  userId: string;
  stored: ITransferPaperwork | null;
  now?: number;
}) => {
  const { transfer, role, userId, stored } = params;
  const now = params.now ?? Date.now();
  const accepted = transfer.status === 'accepted';
  const raw: any = stored;
  const pw: any = raw ? openDoc(typeof raw.toObject === 'function' ? raw.toObject() : raw) : { steps: [] };

  const vehicle = await Vehicle.findById(transfer.vehicleId);
  const registration = registrationStateOf(vehicle?.regNumber);
  const ctx = computeContext(pw, registration);
  const user = await User.findById(userId).select('name phone address');
  const userState = normalizeState(user?.address?.state);

  const me: IParty = pw[role] ?? {};
  const other: Viewer = role === 'seller' ? 'buyer' : 'seller';
  const counter: IParty = pw[other] ?? {};

  const view: Record<string, any> = {
    transferId: transfer._id,
    status: transfer.status,
    role,
    vehicle: vehicle && {
      regNumber: role === 'seller' || accepted ? vehicle.regNumber : maskReg(vehicle.regNumber),
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      fuelType: vehicle.fuelType,
      registrationState: registration?.name ?? null
    },
    me,
    prefill: {
      fullName: user?.name ?? '',
      mobile: (user?.phone ?? '').replace(/\D/g, '').slice(-10),
      address: { city: user?.address?.city ?? '', state: userState?.name ?? user?.address?.state ?? '', pincode: user?.address?.pincode ?? '' }
    },
    ownMissing: ownMissing(pw, role),
    footnote: DEADLINE_FOOTNOTE,
    officialFormsUrl: ENV.OFFICIAL_FORMS_URL
  };

  // The seller owns the vehicle, sale, loan and insurer details; the buyer sees them only once approved
  if (role === 'seller' || accepted) {
    view.shared = { vehicle: pw.vehicle ?? {}, sale: pw.sale ?? {}, loan: pw.loan ?? {}, insurance: pw.insurance ?? {} };
    view.saleDate = { value: pw.sale?.date ?? null, confirmed: ctx.dateState === 'confirmed', confirmedAt: pw.sale?.dateConfirmedAt ?? null };
  } else {
    view.shared = { insurance: { buyerPlan: pw.insurance?.buyerPlan } };
  }
  if (role === 'buyer') view.noc = ctx.noc;

  if (accepted) {
    view.counterparty = {
      fullName: counter.fullName ?? null,
      mobile: counter.mobile ?? null,
      city: counter.address?.city ?? null,
      state: counter.address?.state ?? null
    };
    view.scenario = ctx.scenario;
    view.checklist = buildChecklist(pw, ctx, now)
      .filter((s) => s.party === role)
      .map((s) => ({ ...s, dueAt: s.dueAt ? s.dueAt.toISOString() : null }));
    view.missing = missingForForms(pw);
  }
  return view;
};

// ── Summary for the transfers list (no decryption needed) ─────────────────────

/** Open-task counts and the next due date for the viewer, for each accepted transfer. */
export const taskSummaries = async (
  transfers: Array<{ _id: Types.ObjectId; vehicleId: Types.ObjectId; status: string; fromOwnerId: Types.ObjectId }>,
  userId: string
): Promise<Map<string, { openTasks: number; nextDue: string | null }>> => {
  const out = new Map<string, { openTasks: number; nextDue: string | null }>();
  const accepted = transfers.filter((t) => t.status === 'accepted');
  if (accepted.length === 0) return out;

  const docs = await TransferPaperwork.find({ transferId: { $in: accepted.map((t) => t._id) } }).lean();
  const vehicles = await Vehicle.find({ _id: { $in: accepted.map((t) => t.vehicleId) } }).select('regNumber').lean();
  const regOf = new Map(vehicles.map((v) => [v._id.toString(), registrationStateOf(v.regNumber)]));

  for (const t of accepted) {
    const pw = docs.find((d) => d.transferId.toString() === t._id.toString());
    if (!pw) continue;
    const role: Viewer = t.fromOwnerId.toString() === userId ? 'seller' : 'buyer';
    const steps = buildChecklist(pw, computeContext(pw, regOf.get(t.vehicleId.toString()) ?? null)).filter((s) => s.party === role && s.status === 'open' && !s.optional);
    const dues = steps.map((s) => s.dueAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    out.set(t._id.toString(), { openTasks: steps.length, nextDue: dues[0] ? dues[0].toISOString() : null });
  }
  return out;
};

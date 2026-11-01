/**
 * Pure logic for transfer paperwork: encryption and key rotation, validation, Form 28 assessment,
 * deadlines and the checklist. No database.
 */

import crypto from 'crypto';
import {
  parseKeyring,
  setKeyring,
  encryptValue,
  decryptValue,
  isEncrypted,
  keyIdOf,
  PaperworkKeyError
} from '../services/fieldCrypto';
import { flattenPatch, openDoc, ENCRYPTED_PATHS, keyUsage } from '../services/paperworkFields';
import { validatePaperworkPatch, todayIST } from '../services/paperworkValidation';
import {
  assessNoc,
  deriveScenario,
  buildChecklist,
  computeContext,
  addDaysYmd,
  endOfIstDay
} from '../services/transferPaperwork.service';
import { normalizeState } from '../services/indianStates';

const b64 = (seed: string) => crypto.createHash('sha256').update(seed).digest('base64');
const MH = normalizeState('MH');
const DL = normalizeState('DL');

afterEach(() => setKeyring(null));

describe('field encryption', () => {
  it('round-trips and never reuses an IV', () => {
    setKeyring(parseKeyring(`a:${b64('a')}`, 'a', 'test'));
    const one = encryptValue('Asha Verma');
    const two = encryptValue('Asha Verma');
    expect(one).not.toBe(two);
    expect(one).not.toContain('Asha');
    expect(isEncrypted(one)).toBe(true);
    expect(keyIdOf(one)).toBe('a');
    expect(decryptValue(one)).toBe('Asha Verma');
    expect(decryptValue(two)).toBe('Asha Verma');
  });

  it('detects tampering', () => {
    setKeyring(parseKeyring(`a:${b64('a')}`, 'a', 'test'));
    const parts = encryptValue('secret').split(':');
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptValue(parts.join(':'))).toThrow(PaperworkKeyError);
  });

  it('rotates: old values still decrypt once a new key is active, and fail loudly once the old key is gone', () => {
    setKeyring(parseKeyring(`a:${b64('a')}`, 'a', 'test'));
    const writtenUnderA = encryptValue('9876543210');

    setKeyring(parseKeyring(`a:${b64('a')},b:${b64('b')}`, 'b', 'test'));
    expect(decryptValue(writtenUnderA)).toBe('9876543210');
    const writtenUnderB = encryptValue('9876543210');
    expect(keyIdOf(writtenUnderB)).toBe('b');

    setKeyring(parseKeyring(`b:${b64('b')}`, 'b', 'test'));
    expect(decryptValue(writtenUnderB)).toBe('9876543210');
    expect(() => decryptValue(writtenUnderA)).toThrow(PaperworkKeyError);
  });

  it('has a development fallback only outside production', () => {
    expect(parseKeyring('', '', 'development').activeId).toBe('dev');
    expect(() => parseKeyring('', '', 'production')).toThrow(/required in production/);
  });

  it.each([
    ['a key that is not 32 bytes', `a:${Buffer.from('short').toString('base64')}`, 'a'],
    ['an active id that is not listed', `a:${b64('a')}`, 'zzz'],
    ['no active id in production', `a:${b64('a')}`, ''],
    ['a duplicate key id', `a:${b64('a')},a:${b64('b')}`, 'a'],
    ['an entry with no id', b64('a'), 'a']
  ])('refuses %s', (_label, keys, active) => {
    expect(() => parseKeyring(keys, active, 'production')).toThrow();
  });
});

describe('paperwork fields', () => {
  it('encrypts personal fields and leaves the rest readable', () => {
    setKeyring(parseKeyring(`a:${b64('a')}`, 'a', 'test'));
    const flat = flattenPatch({
      seller: { fullName: 'Asha Verma', relation: 'W/o', address: { line1: '12 Park Road', state: 'Delhi', city: 'New Delhi' } },
      vehicle: { chassisNo: 'MA3ABC123456789' },
      sale: { price: 450000 },
      loan: { hypothecated: true, bankName: 'HDFC Bank' }
    });

    expect(isEncrypted(flat['seller.fullName'])).toBe(true);
    expect(isEncrypted(flat['seller.address.line1'])).toBe(true);
    expect(isEncrypted(flat['vehicle.chassisNo'])).toBe(true);
    expect(isEncrypted(flat['loan.bankName'])).toBe(true);
    expect(flat['seller.relation']).toBe('W/o');
    expect(flat['seller.address.state']).toBe('Delhi'); // needed for the NOC and deadline checks
    expect(flat['sale.price']).toBe(450000);
    expect(flat['loan.hypothecated']).toBe(true);
  });

  it('opens a stored document back to plain values', () => {
    setKeyring(parseKeyring(`a:${b64('a')}`, 'a', 'test'));
    const flat = flattenPatch({ buyer: { fullName: 'Ravi Kumar', mobile: '9876543210' }, insurance: { policyNumber: 'POL-1234' } });
    const stored: any = { buyer: { fullName: flat['buyer.fullName'], mobile: flat['buyer.mobile'] }, insurance: { policyNumber: flat['insurance.policyNumber'] } };
    const opened = openDoc(stored);
    expect(opened.buyer.fullName).toBe('Ravi Kumar');
    expect(opened.buyer.mobile).toBe('9876543210');
    expect(opened.insurance.policyNumber).toBe('POL-1234');
    expect(JSON.stringify(stored)).not.toContain('Ravi');
  });

  it('counts values per key id without decrypting', () => {
    setKeyring(parseKeyring(`a:${b64('a')},b:${b64('b')}`, 'a', 'test'));
    const underA = flattenPatch({ seller: { fullName: 'A', mobile: '9876543210' } });
    setKeyring(parseKeyring(`a:${b64('a')},b:${b64('b')}`, 'b', 'test'));
    const underB = flattenPatch({ buyer: { fullName: 'B' } });
    const stored: any = {
      seller: { fullName: underA['seller.fullName'], mobile: underA['seller.mobile'] },
      buyer: { fullName: underB['buyer.fullName'] }
    };
    expect(keyUsage(stored)).toEqual({ a: 2, b: 1 });
  });

  it('lists every personal field for both parties', () => {
    expect(ENCRYPTED_PATHS).toEqual(expect.arrayContaining(['seller.mobile', 'buyer.mobile', 'buyer.idLast4', 'insurance.policyNumber']));
    expect(ENCRYPTED_PATHS).not.toContain('seller.address.state');
  });
});

describe('validatePaperworkPatch', () => {
  const validParty = {
    fullName: 'Asha Verma',
    guardianName: 'Mohan Verma',
    relation: 'D/o',
    mobile: '+91 98765-43210',
    idType: 'aadhaar',
    idLast4: '4321',
    address: { line1: '12, Park Road', city: 'New Delhi', state: 'delhi', pincode: '110001' }
  };

  it('accepts a full party and cleans it', () => {
    const r = validatePaperworkPatch('seller', { party: validParty });
    expect(r.errors).toEqual({});
    expect(r.ok).toBe(true);
    expect(r.patch.party.mobile).toBe('9876543210');
    expect(r.patch.party.address.state).toBe('Delhi');
  });

  it('accepts a partial update', () => {
    const r = validatePaperworkPatch('buyer', { party: { fullName: 'Ravi Kumar' } });
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ party: { fullName: 'Ravi Kumar' } });
  });

  it.each([
    ['a full Aadhaar number', { idType: 'aadhaar', idLast4: '123456789012' }, 'party.idLast4'],
    ['letters in an Aadhaar tail', { idType: 'aadhaar', idLast4: 'AB12' }, 'party.idLast4'],
    ['a non-Latin name', { fullName: 'आशा वर्मा' }, 'party.fullName'],
    ['a short mobile', { mobile: '12345' }, 'party.mobile'],
    ['a mobile starting with 5', { mobile: '5876543210' }, 'party.mobile'],
    ['a bad pincode', { address: { pincode: '012345' } }, 'party.address.pincode'],
    ['an unknown state', { address: { state: 'Narnia' } }, 'party.address.state'],
    ['an unknown party field', { shoeSize: 9 }, 'party.shoeSize']
  ])('rejects %s', (_label, party, path) => {
    const r = validatePaperworkPatch('seller', { party });
    expect(r.ok).toBe(false);
    expect(r.errors[path]).toBeDefined();
    expect(r.patch).toEqual({}); // nothing is written when anything is invalid
  });

  it('keeps ID last 4 to exactly four characters for other ID types', () => {
    expect(validatePaperworkPatch('seller', { party: { idType: 'pan', idLast4: '234f' } }).patch.party.idLast4).toBe('234F');
    expect(validatePaperworkPatch('seller', { party: { idType: 'pan', idLast4: 'ABCDE1234F' } }).ok).toBe(false);
  });

  it('stops the buyer writing seller-only sections and the seller writing the buyer plan', () => {
    const buyer = validatePaperworkPatch('buyer', { sale: { price: 1 }, vehicle: { chassisNo: 'ABC123456' }, loan: { hypothecated: true } });
    expect(buyer.ok).toBe(false);
    expect(buyer.forbidden.sort()).toEqual(['loan', 'sale', 'vehicle']);

    const buyerInsurer = validatePaperworkPatch('buyer', { insurance: { insurerName: 'ICICI Lombard' } });
    expect(buyerInsurer.forbidden).toContain('insurance.insurerName');

    const seller = validatePaperworkPatch('seller', { insurance: { buyerPlan: 'new' } });
    expect(seller.forbidden).toContain('insurance.buyerPlan');
  });

  it('allows the buyer to choose a plan and the seller to give insurer details', () => {
    expect(validatePaperworkPatch('buyer', { insurance: { buyerPlan: 'transfer' } }).ok).toBe(true);
    expect(validatePaperworkPatch('seller', { insurance: { insurerName: 'ICICI Lombard', policyNumber: 'pol/2024/1234', sellerConsent: true } }).patch.insurance.policyNumber).toBe('POL/2024/1234');
  });

  describe('sale, vehicle and loan', () => {
    const now = Date.parse('2026-11-10T10:00:00+05:30');

    it('accepts today and earlier, refuses the future and impossible dates', () => {
      expect(validatePaperworkPatch('seller', { sale: { date: '2026-11-10' } }, now).ok).toBe(true);
      expect(validatePaperworkPatch('seller', { sale: { date: '2026-11-11' } }, now).ok).toBe(false);
      expect(validatePaperworkPatch('seller', { sale: { date: '2026-02-31' } }, now).ok).toBe(false);
      expect(validatePaperworkPatch('seller', { sale: { date: '10/11/2026' } }, now).ok).toBe(false);
    });

    it('judges "today" in India, not UTC', () => {
      // 00:30 IST on the 11th is still the 10th in UTC
      const earlyIst = Date.parse('2026-11-11T00:30:00+05:30');
      expect(todayIST(earlyIst)).toBe('2026-11-11');
      expect(validatePaperworkPatch('seller', { sale: { date: '2026-11-11' } }, earlyIst).ok).toBe(true);
    });

    it.each([
      [0, false],
      [-5, false],
      [450000, true],
      [450000.5, true],
      [450000.555, false],
      [200_000_000, false]
    ])('price %p ok=%p', (price, ok) => {
      expect(validatePaperworkPatch('seller', { sale: { price } }, now).ok).toBe(ok);
    });

    it.each([
      [0, true],
      [48500, true],
      [-1, false],
      [12.5, false],
      [3_000_000, false]
    ])('odometer %p ok=%p', (odometerKm, ok) => {
      expect(validatePaperworkPatch('seller', { sale: { odometerKm } }, now).ok).toBe(ok);
    });

    it('checks chassis, engine and registration date', () => {
      expect(validatePaperworkPatch('seller', { vehicle: { chassisNo: 'ma3 abc', engineNo: 'k12-m 1234' } }).ok).toBe(false);
      const ok = validatePaperworkPatch('seller', { vehicle: { chassisNo: 'ma3abc123456789', engineNo: 'k12m-1234567', registrationDate: '2019-06-12' } }, now);
      expect(ok.patch.vehicle).toEqual({ chassisNo: 'MA3ABC123456789', engineNo: 'K12M-1234567', registrationDate: '2019-06-12' });
      expect(validatePaperworkPatch('seller', { vehicle: { registrationDate: '2030-01-01' } }, now).ok).toBe(false);
    });

    it('clears the bank name when there is no loan', () => {
      expect(validatePaperworkPatch('seller', { loan: { hypothecated: false, bankName: 'HDFC Bank' } }).patch.loan).toEqual({ hypothecated: false, bankName: '' });
      expect(validatePaperworkPatch('seller', { loan: { hypothecated: true, bankName: 'HDFC Bank' } }).patch.loan).toEqual({ hypothecated: true, bankName: 'HDFC Bank' });
    });
  });

  it('rejects a body that is not an object', () => {
    expect(validatePaperworkPatch('seller', 'nope' as any).ok).toBe(false);
    expect(validatePaperworkPatch('seller', [] as any).ok).toBe(false);
    expect(validatePaperworkPatch('seller', { surprise: {} }).errors.surprise).toBeDefined();
  });
});

describe('Form 28 (NOC) assessment', () => {
  it('points to an NOC for a different state, with both states named, and never calls it required', () => {
    const a = assessNoc(MH, DL);
    expect(a.result).toBe('likely');
    expect(a.reason).toContain('Maharashtra');
    expect(a.reason).toContain('Delhi');
    expect(a.reason).toMatch(/normally needed/);
    expect(a.reason).toMatch(/Confirm with your RTO/);
    expect(a.reason.toLowerCase()).not.toContain('required');
  });

  it('says an NOC is not normally needed within a state, but some RTOs still ask', () => {
    const a = assessNoc(MH, MH);
    expect(a.result).toBe('not_indicated');
    expect(a.reason).toMatch(/some RTOs still ask/);
  });

  it('is unknown when either state is unknown', () => {
    expect(assessNoc(MH, null).result).toBe('unknown');
    expect(assessNoc(null, DL).result).toBe('unknown');
    expect(deriveScenario(MH, null)).toBe('unknown');
    expect(deriveScenario(null, null)).toBe('unknown');
    expect(deriveScenario(MH, DL)).toBe('otherState');
    expect(deriveScenario(MH, MH)).toBe('sameState');
  });
});

describe('deadlines and checklist', () => {
  const now = Date.parse('2026-11-10T10:00:00+05:30');
  const base = (over: any = {}) => ({
    sale: {},
    loan: {},
    insurance: {},
    steps: [],
    buyer: { address: { state: 'Delhi' } },
    ...over
  });
  const steps = (pw: any, reg = MH) => buildChecklist(pw, computeContext(pw, reg), now);
  const get = (list: ReturnType<typeof steps>, key: string) => list.find((s) => s.key === key)!;

  it('shows no date at all until a sale date exists, and does not invent one', () => {
    const list = steps(base());
    for (const key of ['seller_form29_submit', 'seller_insurance_ncb', 'buyer_form30_submit', 'buyer_insurance_transfer']) {
      expect(get(list, key).dueAt).toBeNull();
      expect(get(list, key).dueNote).toBe('Sale date required');
    }
  });

  it('shows no date while the buyer has not confirmed the sale date', () => {
    const list = steps(base({ sale: { date: '2026-11-01' } }));
    expect(get(list, 'seller_insurance_ncb').dueNote).toBe('Waiting for the buyer to confirm the date');
    expect(get(list, 'buyer_insurance_transfer').dueNote).toBe('Confirm the sale date to see this deadline');
    expect(get(list, 'buyer_insurance_transfer').dueAt).toBeNull();
  });

  it('dates the insurance steps 14 days after the confirmed sale date, to the end of that Indian day', () => {
    const list = steps(base({ sale: { date: '2026-11-01', dateConfirmedAt: new Date() } }));
    const due = get(list, 'buyer_insurance_transfer').dueAt!;
    expect(due.toISOString()).toBe(endOfIstDay('2026-11-15').toISOString());
    expect(addDaysYmd('2026-11-01', 14)).toBe('2026-11-15');
    expect(get(list, 'seller_insurance_ncb').dueAt!.toISOString()).toBe(due.toISOString());
  });

  it('gives no date for the RTO forms while their rules are unresolved, whatever the states are', () => {
    for (const buyerState of ['Delhi', 'Maharashtra', undefined]) {
      const pw = base({ sale: { date: '2026-11-01', dateConfirmedAt: new Date() }, buyer: { address: { state: buyerState } } });
      const list = steps(pw);
      expect(get(list, 'buyer_form30_submit').dueAt).toBeNull();
      expect(get(list, 'buyer_form30_submit').dueNote).toBe('Complete this as soon as possible');
      expect(get(list, 'seller_form29_submit').dueAt).toBeNull();
    }
  });

  it('flags an overdue step only when it is still open', () => {
    const pw = base({ sale: { date: '2026-10-01', dateConfirmedAt: new Date() } });
    expect(get(steps(pw), 'buyer_insurance_transfer').overdue).toBe(true);
    const done = base({ sale: { date: '2026-10-01', dateConfirmedAt: new Date() }, steps: [{ key: 'buyer_insurance_transfer', status: 'done', at: new Date() }] });
    expect(get(steps(done), 'buyer_insurance_transfer').overdue).toBe(false);
    expect(get(steps(done), 'buyer_insurance_transfer').status).toBe('done');
  });

  it('only includes the lender step when there is a loan', () => {
    expect(steps(base()).some((s) => s.key === 'seller_loan_noc')).toBe(false);
    expect(steps(base({ loan: { hypothecated: false } })).some((s) => s.key === 'seller_loan_noc')).toBe(false);
    expect(steps(base({ loan: { hypothecated: true } })).some((s) => s.key === 'seller_loan_noc')).toBe(true);
  });

  it('always lists the NOC step with its reason, optional unless one is likely', () => {
    const different = get(steps(base({ buyer: { address: { state: 'Delhi' } } })), 'buyer_noc_form28');
    expect(different.optional).toBe(false);
    expect(different.why).toContain('Maharashtra');
    expect(different.why.toLowerCase()).not.toContain('required');

    const same = get(steps(base({ buyer: { address: { state: 'Maharashtra' } } })), 'buyer_noc_form28');
    expect(same.optional).toBe(true);
    expect(same.why).toMatch(/some RTOs still ask/);

    const unknown = get(steps(base({ buyer: {} })), 'buyer_noc_form28');
    expect(unknown.optional).toBe(true);
    expect(unknown.why).toMatch(/Add your state/);
  });

  it('can mark a step skipped', () => {
    const pw = base({ steps: [{ key: 'buyer_noc_form28', status: 'skipped', at: new Date() }] });
    expect(get(steps(pw), 'buyer_noc_form28').status).toBe('skipped');
  });

  it('words the buyer insurance step by their plan', () => {
    expect(get(steps(base({ insurance: { buyerPlan: 'new' } })), 'buyer_insurance_transfer').title).toMatch(/Buy an insurance policy/);
    expect(get(steps(base({ insurance: { buyerPlan: 'transfer' } })), 'buyer_insurance_transfer').title).toMatch(/move the policy/);
  });
});

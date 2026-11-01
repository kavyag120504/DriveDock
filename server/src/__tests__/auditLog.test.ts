/**
 * App-wide AuditLog (C4): the reusable recordAudit helper persists append-only rows
 * with field names / ids only (never PII values), and the admin provider-approval
 * handler writes one. Paperwork auditing (PaperworkAudit) is unchanged and untouched.
 */

import { AuditLog } from '../models/AuditLog';
import { recordAudit } from '../services/auditLog';
import { updateProviderStatus } from '../controllers/adminController';
import { setupTestDB, teardownTestDB, clearDB, makeProvider } from './helpers';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
afterEach(clearDB);

describe('recordAudit', () => {
  test('persists an append-only row with names/ids only', async () => {
    await recordAudit({
      actorRole: 'admin',
      action: 'provider_status_change',
      entityType: 'provider',
      entityId: '507f1f77bcf86cd799439011',
      metadata: { status: 'approved' },
      ip: '10.0.0.1'
    });

    const rows = await AuditLog.find({});
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('provider_status_change');
    expect(rows[0].metadata).toMatchObject({ status: 'approved' });
    expect(rows[0].at).toBeInstanceOf(Date);
  });

  test('a logging failure never throws to the caller', async () => {
    // entityType is required; omitting it makes the write fail, but recordAudit swallows it.
    await expect(recordAudit({ actorRole: 'system', action: 'x', entityType: undefined as any })).resolves.toBeUndefined();
  });
});

describe('admin approval writes an audit entry', () => {
  const mockRes = () => {
    const res: any = { statusCode: 0, body: null };
    res.status = (c: number) => {
      res.statusCode = c;
      return res;
    };
    res.json = (b: any) => {
      res.body = b;
      return res;
    };
    return res;
  };

  test('updateProviderStatus records provider_status_change', async () => {
    const { provider } = await makeProvider('pending');
    const req: any = { params: { id: provider._id.toString() }, body: { status: 'approved' }, user: { userId: '507f1f77bcf86cd799439011', role: 'admin' }, ip: '10.0.0.2' };

    await updateProviderStatus(req, mockRes());

    const rows = await AuditLog.find({ action: 'provider_status_change' });
    expect(rows).toHaveLength(1);
    expect(rows[0].entityType).toBe('provider');
    expect(String(rows[0].entityId)).toBe(provider._id.toString());
    expect(rows[0].metadata).toMatchObject({ status: 'approved' });
  });
});

/**
 * Contract + resilience tests for the adapter layer.
 * No network: exercises sandbox/mock impls and the resilience primitives.
 */

import {
  withResilience,
  CircuitBreaker,
  UsageMeter,
  BudgetExceededError,
  CircuitOpenError,
  AdapterError,
  redact
} from '../providers/types';
import { SandboxRegistryProvider } from '../providers/registry';
import { RazorpayPaymentProvider } from '../providers/payment';
import { MockPushProvider } from '../providers/push';
import { getAdapterStatus } from '../providers';

describe('RegistryProvider (sandbox) — contract', () => {
  const reg = new SandboxRegistryProvider();

  test('returns the normalised, PII-free shape only', async () => {
    const r = await reg.lookup('MH01AB1234');
    expect(Object.keys(r).sort()).toEqual(
      [
        'challansPending',
        'fitnessValidUpto',
        'fuelType',
        'insuranceValidUpto',
        'makeModel',
        'pucValidUpto',
        'rcValidUpto',
        'registrationDate',
        'registrationNumber',
        'status'
      ].sort()
    );
    // No personal-data keys must ever appear
    const json = JSON.stringify(r).toLowerCase();
    for (const banned of ['owner', 'name', 'father', 'address', 'mobile', 'phone', 'chassis', 'engine']) {
      expect(json).not.toContain(`"${banned}"`);
    }
  });

  test('is deterministic for the same registration number', async () => {
    const a = await reg.lookup('MH02CD5678');
    const b = await reg.lookup('mh02cd5678');
    expect(a).toEqual(b);
  });

  test('rejects a malformed registration number', async () => {
    await expect(reg.lookup('!!!')).rejects.toBeInstanceOf(AdapterError);
  });

  test('ownership verification matches the expected chassis last-5, case-insensitive', async () => {
    const expected = reg.expectedChassisLast5('MH01AB1234');
    await expect(reg.verifyOwnership('MH01AB1234', expected.toLowerCase())).resolves.toBe(true);
    await expect(reg.verifyOwnership('MH01AB1234', 'ZZZZZ')).resolves.toBe(false);
  });
});

describe('PaymentProvider — sandbox behaviour', () => {
  const pay = new RazorpayPaymentProvider();

  test('mode is sandbox with placeholder keys and exposes a test signature', () => {
    expect(pay.mode).toBe('sandbox');
    const order = 'order_abc';
    const sig = pay.testSignature(order, 'pay_1');
    expect(sig).toBeTruthy();
    expect(pay.verifySignature(order, 'pay_1', sig!)).toBe(true);
  });

  test('rejects a tampered signature', () => {
    expect(pay.verifySignature('order_abc', 'pay_1', 'bad')).toBe(false);
  });
});

describe('PushProvider (mock)', () => {
  test('records sends and reports delivery by token shape', async () => {
    const push = new MockPushProvider();
    expect(await push.send({ to: 'ExponentPushToken[xyz]', title: 't', body: 'b' })).toBe(true);
    expect(await push.send({ to: 'garbage', title: 't', body: 'b' })).toBe(false);
    expect(push.sent).toHaveLength(2);
  });
});

describe('redact()', () => {
  test('masks personal-data keys, keeps the rest', () => {
    const out = redact({ name: 'Asha', phone: '9800000000', registrationNumber: 'MH01AB1234', status: 'active' });
    expect(out.name).toBe('[redacted]');
    expect(out.phone).toBe('[redacted]');
    expect(out.registrationNumber).toBe('MH01AB1234');
    expect(out.status).toBe('active');
  });
});

describe('withResilience', () => {
  const noJitter = () => 0;

  test('retries a transient failure then succeeds', async () => {
    let calls = 0;
    const result = await withResilience(
      async () => {
        calls++;
        if (calls < 2) throw new AdapterError('x', 'transient', undefined, true);
        return 'ok';
      },
      { provider: 'x', retries: 3, jitter: noJitter }
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  test('does not retry a non-retryable error', async () => {
    let calls = 0;
    await expect(
      withResilience(
        async () => {
          calls++;
          throw new AdapterError('x', 'permanent', undefined, false);
        },
        { provider: 'x', retries: 3, jitter: noJitter }
      )
    ).rejects.toBeInstanceOf(AdapterError);
    expect(calls).toBe(1);
  });

  test('enforces the usage budget', async () => {
    const meter = new UsageMeter('x', 1);
    const call = () => withResilience(async () => 'ok', { provider: 'x', meter, jitter: noJitter });
    await expect(call()).resolves.toBe('ok');
    await expect(call()).rejects.toBeInstanceOf(BudgetExceededError);
  });

  test('opens the circuit after repeated failures', async () => {
    const breaker = new CircuitBreaker('x', 2, 30_000);
    const failing = () =>
      withResilience(async () => {
        throw new AdapterError('x', 'boom', undefined, false);
      }, { provider: 'x', retries: 0, breaker, jitter: noJitter });

    await expect(failing()).rejects.toBeInstanceOf(AdapterError); // failure 1
    await expect(failing()).rejects.toBeInstanceOf(AdapterError); // failure 2 -> opens
    await expect(failing()).rejects.toBeInstanceOf(CircuitOpenError); // short-circuited
  });
});

describe('getAdapterStatus', () => {
  test('reports a mode for every adapter', () => {
    const status = getAdapterStatus();
    const adapters = status.map((s) => s.adapter).sort();
    expect(adapters).toEqual(['email', 'geocoding', 'ocr', 'payment', 'push', 'registry', 'sms', 'storage']);
    for (const s of status) expect(['real', 'sandbox', 'mock']).toContain(s.mode);
  });
});

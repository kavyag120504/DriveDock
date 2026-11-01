/**
 * Tests the env config contract: valid config in dev/test, and the strict
 * production fail-fast gate (Ground Rule 3 / Phase 1 decision).
 *
 * Uses jest.isolateModules so each case re-evaluates config/env.ts with a fresh
 * process.env. ts-jest sets NODE_ENV=test by default; we override per-case.
 */

const SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'QR_SECRET',
  'INTERNAL_JOB_SECRET',
  'TRANSFER_SECRET',
  'TWIN_SHARE_SECRET'
];

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('ENV config', () => {
  test('loads with built-in defaults in test environment', () => {
    jest.isolateModules(() => {
      const { ENV } = require('../config/env');
      expect(ENV.PORT).toBeDefined();
      expect(ENV.MONGO_URI).toContain('mongodb');
      expect(ENV.JWT_ACCESS_SECRET.length).toBeGreaterThan(0);
    });
  });

  test('coerces TRUST_PROXY to a number and empty string falls back to 0', () => {
    process.env.TRUST_PROXY = '';
    jest.isolateModules(() => {
      const { ENV } = require('../config/env');
      expect(ENV.TRUST_PROXY).toBe(0);
    });
    process.env.TRUST_PROXY = '2';
    jest.isolateModules(() => {
      const { ENV } = require('../config/env');
      expect(ENV.TRUST_PROXY).toBe(2);
    });
  });

  test('validateProductionSecrets is a no-op outside production', () => {
    jest.isolateModules(() => {
      const { validateProductionSecrets } = require('../config/env');
      expect(() => validateProductionSecrets()).not.toThrow();
    });
  });
});

describe('production fail-fast gate', () => {
  test('throws when secrets are missing / still default in production', () => {
    process.env.NODE_ENV = 'production';
    for (const k of SECRET_KEYS) delete process.env[k];
    delete process.env.MONGO_URI;

    jest.isolateModules(() => {
      const { validateProductionSecrets } = require('../config/env');
      expect(() => validateProductionSecrets()).toThrow(/Refusing to start in production/);
    });
  });

  test('throws when a secret equals the built-in insecure default', () => {
    process.env.NODE_ENV = 'production';
    for (const k of SECRET_KEYS) process.env[k] = 'a-real-unique-secret-value-32chars-long';
    process.env.MONGO_URI = 'mongodb+srv://real-atlas-cluster/drivedock';
    // Leave one as the known insecure default
    process.env.QR_SECRET = 'drivedock_rotating_qr_compliance_secret_key_2026';

    jest.isolateModules(() => {
      const { validateProductionSecrets } = require('../config/env');
      expect(() => validateProductionSecrets()).toThrow(/QR_SECRET/);
    });
  });

  test('passes when all secrets are real and non-default in production', () => {
    process.env.NODE_ENV = 'production';
    for (const k of SECRET_KEYS) process.env[k] = `real-${k.toLowerCase()}-value-32chars-minimum`;
    process.env.MONGO_URI = 'mongodb+srv://real-atlas-cluster/drivedock';
    // Merged from the friends' branch: a paperwork encryption keyring is also
    // required in production, so the happy-path case must provide one.
    process.env.PAPERWORK_ENCRYPTION_KEYS = 'k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    process.env.PAPERWORK_ENCRYPTION_ACTIVE_KEY_ID = 'k1';

    jest.isolateModules(() => {
      const { validateProductionSecrets } = require('../config/env');
      expect(() => validateProductionSecrets()).not.toThrow();
    });
  });
});

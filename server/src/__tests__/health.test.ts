/**
 * Health endpoints: /healthz (liveness) and /readyz (readiness).
 * Importing ../index is safe — it only auto-starts when run directly (require.main).
 */

import request from 'supertest';
import { app } from '../index';
import { setupTestDB, teardownTestDB } from './helpers';

describe('health endpoints', () => {
  test('/healthz is 200 even before the DB connects (liveness)', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  describe('when connected', () => {
    beforeAll(setupTestDB);
    afterAll(teardownTestDB);

    test('/readyz is 200 once Mongo is connected', async () => {
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    test('/api/health stays available for backwards compatibility', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.app).toBe('DriveDock API');
    });
  });
});

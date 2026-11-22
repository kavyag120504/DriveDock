import express from 'express';
import request from 'supertest';
import vehicleRoutes from '../routes/vehicleRoutes';
import bookingRoutes from '../routes/bookingRoutes';
import documentRoutes from '../routes/documentRoutes';
import { errorHandler } from '../middleware/errorHandler';
import { setupTestDB, teardownTestDB, clearDB, makeOwner, makeUser, authHeader } from './helpers';

const app = express();
app.use(express.json());
app.use('/vehicles', vehicleRoutes);
app.use('/bookings', bookingRoutes);
app.use('/documents', documentRoutes);
app.use(errorHandler);

beforeAll(setupTestDB);
afterEach(clearDB);
afterAll(teardownTestDB);

describe('URL ids that cannot be MongoDB ids', () => {
  test('GET /vehicles/scan-rc (a POST-only route) is a 404, not a 500', async () => {
    const owner = await makeOwner();
    const res = await request(app).get('/vehicles/scan-rc').set('Authorization', authHeader(owner));
    expect(res.status).toBe(404);
  });

  test.each(['/vehicles/not-an-id', '/vehicles/not-an-id/documents', '/bookings/xyz', '/documents/abc'])('GET %s is a 404', async (path) => {
    const owner = await makeOwner();
    const res = await request(app).get(path).set('Authorization', authHeader(owner));
    expect(res.status).toBe(404);
  });

  test('a well-formed id that does not exist is still the normal 404', async () => {
    const owner = await makeOwner();
    const res = await request(app).get('/vehicles/000000000000000000000000').set('Authorization', authHeader(owner));
    expect(res.status).toBe(404);
  });
});

describe('officer and government accounts (decided rule: no vehicle or booking lists)', () => {
  // Product decision, 23 Nov 2026: officers reach a vehicle only through the owner's QR code and government users
  // see aggregates only, so the owner-scoped lists stay empty for both (privacy; Trust Rule 8).
  test.each(['officer', 'government'] as const)('%s gets empty vehicle and booking lists', async (role) => {
    const owner = await makeOwner();
    const staff = await makeUser(role);
    const vehicles = await request(app).get('/vehicles').set('Authorization', authHeader(staff));
    expect(vehicles.status).toBe(200);
    expect(vehicles.body.data).toEqual([]);
    const bookings = await request(app).get('/bookings').set('Authorization', authHeader(staff));
    expect(bookings.status).toBe(200);
    expect(bookings.body.data).toEqual([]);
    void owner;
  });
});

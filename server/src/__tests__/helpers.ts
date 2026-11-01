/**
 * Shared test helpers for API characterization tests.
 *
 * NOTE: this file is intentionally NOT a *.test.ts file, so Jest does not run it
 * as a test suite (testMatch is **\/src/__tests__/**\/*.test.ts).
 *
 * These helpers spin up an in-memory MongoDB and provide small factories so each
 * suite reads like the existing twin.api.test.ts.
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';

import { User, UserRole } from '../models/User';
import { Provider, ProviderStatus } from '../models/Provider';
import { Vehicle } from '../models/Vehicle';
import { Slot } from '../models/Slot';
import { generateAccessToken } from '../services/tokenService';

let mongod: MongoMemoryServer;

/** Start an in-memory Mongo and connect mongoose. Call in beforeAll. */
export const setupTestDB = async (): Promise<void> => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
};

/** Disconnect and stop the in-memory Mongo. Call in afterAll. */
export const teardownTestDB = async (): Promise<void> => {
  await mongoose.disconnect();
  await mongod.stop();
};

/** Drop every collection. Call in afterEach to keep suites isolated. */
export const clearDB = async (): Promise<void> => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

// bcrypt cost 4 keeps tests fast; the app uses 10 for real signups.
const hash = (p: string) => bcrypt.hashSync(p, 4);

let counter = 0;
/** A process-unique suffix so regNumber / qrCodeId / email collisions never happen. */
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export const makeUser = async (role: UserRole, overrides: Record<string, any> = {}) =>
  User.create({
    name: overrides.name || 'Test User',
    email: overrides.email || `${role}.${uniq()}@test.com`,
    phone: overrides.phone || '9999999999',
    passwordHash: hash(overrides.password || 'password1'),
    role,
    address: overrides.address || { city: '', state: '', pincode: '' },
    ...('expoPushToken' in overrides ? { expoPushToken: overrides.expoPushToken } : {})
  });

export const makeOwner = (overrides: Record<string, any> = {}) => makeUser('owner', overrides);

/** Creates a provider User + Provider record (approved by default). Returns both. */
export const makeProvider = async (
  status: ProviderStatus = 'approved',
  overrides: Record<string, any> = {}
) => {
  const user = await makeUser('provider', overrides);
  const provider = await Provider.create({
    userId: user._id,
    businessName: overrides.businessName || 'Test Auto Care',
    serviceTypes: ['puc', 'fitness', 'insurance'],
    location: { type: 'Point', coordinates: [72.8777, 19.076] },
    address: 'Mumbai, Maharashtra',
    workingHours: '09:00 AM - 07:00 PM',
    status
  });
  return { user, provider };
};

export const makeVehicle = (ownerId: string, overrides: Record<string, any> = {}) =>
  Vehicle.create({
    ownerId,
    regNumber: overrides.regNumber || `MH01${uniq().slice(-6).toUpperCase()}`,
    type: 'car',
    fuelType: 'petrol',
    make: 'Honda',
    model: 'City',
    year: 2020,
    qrCodeId: overrides.qrCodeId || `DD-${uniq().toUpperCase()}`,
    region: { state: 'MH', district: 'Mumbai' }
  });

export const makeSlot = (providerId: string, overrides: Record<string, any> = {}) =>
  Slot.create({
    providerId,
    date: overrides.date || '2099-01-01',
    startTime: overrides.startTime || '10:00',
    endTime: overrides.endTime || '11:00',
    isBooked: overrides.isBooked ?? false,
    // Bay capacity (friends' branch); default 1 keeps existing single-seat behaviour.
    ...(overrides.capacity ? { capacity: overrides.capacity } : {})
  });

/** Build an "Authorization: Bearer <jwt>" header value for a user document. */
export const authHeader = (user: any): string =>
  `Bearer ${generateAccessToken({ userId: user._id.toString(), email: user.email, role: user.role })}`;

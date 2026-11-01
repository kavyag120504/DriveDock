/**
 * NCR SAMPLE DATASET (synthetic) — for demos and presentations.
 *
 * Wipes the database (like `npm run seed`) and fills it with a realistic but SIMULATED
 * dataset for the Delhi NCR region: ~250 vehicles, 10 testing stations, six months of
 * bookings, payments, violations, e-challans and reminders.
 *
 * Every owner, plate number, booking and challan here is generated. Station names are
 * fictional (placed in real localities). Proportions below are illustrative assumptions;
 * replace them with figures from the Vahan dashboard / data.gov.in and cite the source
 * if you present them. Present this as "sample data", never as real usage.
 *
 * Run against a throwaway database only:  npm run seed:demo
 * The data is reproducible: the same random seed gives the same dataset every time.
 */
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { DocumentModel, DocumentType } from '../src/models/Document';
import { Provider } from '../src/models/Provider';
import { Slot } from '../src/models/Slot';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { Reminder } from '../src/models/Reminder';
import { Violation } from '../src/models/Violation';
import { Challan } from '../src/models/Challan';
import { OwnershipTransfer } from '../src/models/OwnershipTransfer';
import { TwinShare } from '../src/models/TwinShare';
import { SERVICE_FEES_INR } from '../src/services/paymentService';
import { computeHash, computeSnapshotHash } from '../src/services/transfer.service';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/drivedock';
const VEHICLE_COUNT = 250;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

// ---------- Deterministic random numbers (mulberry32) ----------
let rngState = 20261022;
const rand = (): number => {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const weighted = <T>(items: [T, number][]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) { if ((r -= w) <= 0) return item; }
  return items[items.length - 1][0];
};
const hex = (n: number) => Array.from({ length: n }, () => int(0, 15).toString(16)).join('');
const daysAgo = (d: number) => new Date(NOW - d * DAY);
const daysFromNow = (d: number) => new Date(NOW + d * DAY);
const isoDate = (d: Date) => d.toISOString().split('T')[0];

// ---------- NCR geography (illustrative weights; plate series approximate) ----------
type Area = { state: string; district: string; plates: string[]; weight: number };
const AREAS: Area[] = [
  { state: 'Delhi', district: 'South Delhi', plates: ['DL3C', 'DL3S'], weight: 11 },
  { state: 'Delhi', district: 'West Delhi', plates: ['DL4C', 'DL4S'], weight: 9 },
  { state: 'Delhi', district: 'North West Delhi', plates: ['DL8C', 'DL8S'], weight: 9 },
  { state: 'Delhi', district: 'East Delhi', plates: ['DL7C', 'DL7S'], weight: 8 },
  { state: 'Delhi', district: 'South West Delhi', plates: ['DL9C', 'DL9S'], weight: 7 },
  { state: 'Delhi', district: 'North Delhi', plates: ['DL1C', 'DL1S'], weight: 6 },
  { state: 'Delhi', district: 'New Delhi', plates: ['DL2C', 'DL2S'], weight: 5 },
  { state: 'Haryana', district: 'Gurugram', plates: ['HR26'], weight: 10 },
  { state: 'Haryana', district: 'Faridabad', plates: ['HR51', 'HR29'], weight: 7 },
  { state: 'Haryana', district: 'Sonipat', plates: ['HR10'], weight: 3 },
  { state: 'Uttar Pradesh', district: 'Gautam Buddh Nagar', plates: ['UP16'], weight: 9 },
  { state: 'Uttar Pradesh', district: 'Ghaziabad', plates: ['UP14'], weight: 9 },
  { state: 'Uttar Pradesh', district: 'Meerut', plates: ['UP15'], weight: 4 },
  { state: 'Rajasthan', district: 'Alwar', plates: ['RJ02'], weight: 3 }
];

// ---------- Vehicle mix (illustrative) ----------
type ModelDef = { make: string; model: string; type: 'car' | 'bike' | 'other'; fuel: 'petrol' | 'diesel' | 'ev'; weight: number };
const MODELS: ModelDef[] = [
  { make: 'Maruti Suzuki', model: 'Swift', type: 'car', fuel: 'petrol', weight: 8 },
  { make: 'Maruti Suzuki', model: 'WagonR', type: 'car', fuel: 'petrol', weight: 7 },
  { make: 'Maruti Suzuki', model: 'Baleno', type: 'car', fuel: 'petrol', weight: 6 },
  { make: 'Hyundai', model: 'Creta', type: 'car', fuel: 'diesel', weight: 5 },
  { make: 'Hyundai', model: 'i20', type: 'car', fuel: 'petrol', weight: 4 },
  { make: 'Tata', model: 'Punch', type: 'car', fuel: 'petrol', weight: 4 },
  { make: 'Tata', model: 'Nexon', type: 'car', fuel: 'diesel', weight: 3 },
  { make: 'Mahindra', model: 'Scorpio-N', type: 'car', fuel: 'diesel', weight: 3 },
  { make: 'Mahindra', model: 'XUV700', type: 'car', fuel: 'diesel', weight: 2 },
  { make: 'Kia', model: 'Seltos', type: 'car', fuel: 'petrol', weight: 3 },
  { make: 'Honda', model: 'City', type: 'car', fuel: 'petrol', weight: 3 },
  { make: 'Toyota', model: 'Innova Crysta', type: 'car', fuel: 'diesel', weight: 2 },
  { make: 'Tata', model: 'Nexon EV', type: 'car', fuel: 'ev', weight: 3 },
  { make: 'Tata', model: 'Tiago EV', type: 'car', fuel: 'ev', weight: 2 },
  { make: 'MG', model: 'Comet EV', type: 'car', fuel: 'ev', weight: 1 },
  { make: 'Hero', model: 'Splendor Plus', type: 'bike', fuel: 'petrol', weight: 10 },
  { make: 'Honda', model: 'Activa 6G', type: 'bike', fuel: 'petrol', weight: 10 },
  { make: 'Bajaj', model: 'Pulsar 150', type: 'bike', fuel: 'petrol', weight: 5 },
  { make: 'TVS', model: 'Jupiter', type: 'bike', fuel: 'petrol', weight: 5 },
  { make: 'Royal Enfield', model: 'Classic 350', type: 'bike', fuel: 'petrol', weight: 4 },
  { make: 'Ather', model: '450X', type: 'bike', fuel: 'ev', weight: 2 },
  { make: 'Ola Electric', model: 'S1 Pro', type: 'bike', fuel: 'ev', weight: 2 },
  { make: 'TVS', model: 'iQube', type: 'bike', fuel: 'ev', weight: 2 },
  { make: 'Mahindra', model: 'Bolero Pik-Up', type: 'other', fuel: 'diesel', weight: 2 },
  { make: 'Tata', model: 'Ace Gold', type: 'other', fuel: 'diesel', weight: 2 }
];

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Kabir', 'Ishaan', 'Rahul', 'Karan', 'Siddharth', 'Nikhil', 'Varun', 'Amit', 'Rajesh', 'Sanjay', 'Deepak', 'Manish', 'Gaurav', 'Ananya', 'Diya', 'Priya', 'Neha', 'Pooja', 'Kavya', 'Riya', 'Shreya', 'Meera', 'Sneha', 'Aisha', 'Simran', 'Tanvi', 'Nidhi', 'Harpreet', 'Gurpreet', 'Mohit', 'Yash'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Agarwal', 'Malhotra', 'Kapoor', 'Chopra', 'Bansal', 'Mehta', 'Arora', 'Khanna', 'Jain', 'Saxena', 'Yadav', 'Chauhan', 'Rawat', 'Bhatia', 'Sethi', 'Tyagi', 'Gill', 'Kohli', 'Ahuja', 'Mittal'];

// Fictional station names in real NCR localities ([lng, lat])
const STATIONS = [
  { name: 'Capital Auto Emission & Fitness Centre', address: 'Pusa Road, Karol Bagh, New Delhi 110005', coords: [77.1909, 28.6519], services: ['puc', 'fitness', 'insurance', 'rc'], rating: 4.8, state: 'Delhi', district: 'Central Delhi' },
  { name: 'Southside PUC & Insurance Point', address: 'Ring Road, Lajpat Nagar IV, New Delhi 110024', coords: [77.2433, 28.5677], services: ['puc', 'insurance'], rating: 4.6, state: 'Delhi', district: 'South Delhi' },
  { name: 'Dwarka Vehicle Care & Certification', address: 'Sector 10, Dwarka, New Delhi 110075', coords: [77.046, 28.5921], services: ['puc', 'fitness', 'insurance'], rating: 4.7, state: 'Delhi', district: 'South West Delhi' },
  { name: 'Rohini Smart PUC Hub', address: 'Sector 7, Rohini, New Delhi 110085', coords: [77.0565, 28.7495], services: ['puc', 'insurance'], rating: 4.4, state: 'Delhi', district: 'North West Delhi' },
  { name: 'Cyber City Motor Compliance', address: 'Sector 29, Gurugram, Haryana 122001', coords: [77.0655, 28.4675], services: ['puc', 'fitness', 'insurance', 'rc'], rating: 4.9, state: 'Haryana', district: 'Gurugram' },
  { name: 'Udyog Vihar Fitness Testing Station', address: 'Phase IV, Udyog Vihar, Gurugram, Haryana 122015', coords: [77.0858, 28.5036], services: ['fitness', 'puc'], rating: 4.5, state: 'Haryana', district: 'Gurugram' },
  { name: 'Noida Green Emission Centre', address: 'Sector 18, Noida, Uttar Pradesh 201301', coords: [77.326, 28.5708], services: ['puc', 'insurance'], rating: 4.7, state: 'Uttar Pradesh', district: 'Gautam Buddh Nagar' },
  { name: 'Indirapuram Auto Certifications', address: 'Shakti Khand, Indirapuram, Ghaziabad, Uttar Pradesh 201014', coords: [77.3695, 28.646], services: ['puc', 'fitness', 'insurance'], rating: 4.3, state: 'Uttar Pradesh', district: 'Ghaziabad' },
  { name: 'Faridabad NIT PUC & RC Services', address: 'NIT 5, Faridabad, Haryana 121001', coords: [77.2995, 28.3893], services: ['puc', 'rc', 'insurance'], rating: 4.2, state: 'Haryana', district: 'Faridabad' }
];
const PENDING_STATION = { name: 'Raj Nagar Quick PUC', address: 'Raj Nagar, Ghaziabad, Uttar Pradesh 201002', coords: [77.4485, 28.6772], services: ['puc'], state: 'Uttar Pradesh', district: 'Ghaziabad' };

const CHECKPOINTS = ['ITO Crossing, Delhi', 'Dhaula Kuan, Delhi', 'AIIMS Flyover, Delhi', 'Kashmere Gate ISBT, Delhi', 'Rajiv Chowk, Gurugram', 'IFFCO Chowk, Gurugram', 'Sector 18 Market, Noida', 'DND Flyway, Noida', 'Kalindi Kunj, Delhi', 'Badarpur Border, Delhi', 'Hindon Elevated Road, Ghaziabad', 'Bata Chowk, Faridabad', 'Mukarba Chowk, Delhi', 'Anand Vihar ISBT, Delhi'];

const DOC_TYPES: DocumentType[] = ['rc', 'insurance', 'puc', 'license', 'fitness'];
const PENALTY: Record<DocumentType, number> = { puc: 1000, insurance: 2000, rc: 5000, fitness: 3000, license: 1500 };
const SAMPLE_FILE = 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';
const SLOT_TIMES: [string, string][] = [['09:00 AM', '10:00 AM'], ['10:30 AM', '11:30 AM'], ['12:00 PM', '01:00 PM'], ['02:00 PM', '03:00 PM'], ['03:30 PM', '04:30 PM'], ['05:00 PM', '06:00 PM']];

const usedPlates = new Set<string>();
const plateFor = (area: Area): string => {
  for (;;) {
    const letters = String.fromCharCode(65 + int(0, 25)) + String.fromCharCode(65 + int(0, 25));
    const plate = `${pick(area.plates)}${letters}${int(1000, 9999)}`;
    if (!usedPlates.has(plate)) { usedPlates.add(plate); return plate; }
  }
};

const run = async () => {
  console.log('[SeedDemo] Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('[SeedDemo] Clearing collections...');
  await Promise.all([User, Vehicle, DocumentModel, Provider, Slot, Booking, Payment, Reminder, Violation, Challan, OwnershipTransfer, TwinShare].map((m: any) => m.deleteMany({})));

  const passwordHash = await bcrypt.hash('password123', 10);
  const user = (name: string, email: string, role: string, city: string, state: string, createdAt: Date) => ({
    _id: new Types.ObjectId(), name, email, phone: `+91${int(70000, 99999)}${int(10000, 99999)}`, passwordHash, role,
    address: { city, state, pincode: String(int(110001, 110099)) }, expoPushToken: '', createdAt, updatedAt: createdAt
  });

  // ---------- Staff and demo login accounts (same emails as `npm run seed`) ----------
  const owner = user('Aarav Sharma', 'owner@drivedock.com', 'owner', 'New Delhi', 'Delhi', daysAgo(170));
  // Second owner for the Buy a Car demo: a new user with no vehicles (log in with the form, not a demo button)
  const buyer = user('Riya Malhotra', 'buyer@drivedock.com', 'owner', 'Noida', 'Uttar Pradesh', daysAgo(120));
  const officers = [
    user('Inspector Vikram Rathi', 'officer@drivedock.com', 'officer', 'New Delhi', 'Delhi', daysAgo(200)),
    user('SI Neha Tomar', 'officer2@drivedock.demo', 'officer', 'Gurugram', 'Haryana', daysAgo(190)),
    user('ASI Rakesh Bhati', 'officer3@drivedock.demo', 'officer', 'Noida', 'Uttar Pradesh', daysAgo(185))
  ];
  const gov = user('NCR Transport Analytics Desk', 'gov@drivedock.com', 'government', 'New Delhi', 'Delhi', daysAgo(200));
  const admin = user('DriveDock Head Admin', 'admin@drivedock.com', 'admin', 'New Delhi', 'Delhi', daysAgo(210));

  // ---------- Stations ----------
  const providerUsers: any[] = [];
  const providers: any[] = [];
  STATIONS.forEach((s, i) => {
    const email = i === 0 ? 'provider@drivedock.com' : `station${i + 1}@drivedock.demo`;
    const u = user(`${s.name} (Manager)`, email, 'provider', s.district, s.state, daysAgo(200 - i * 5));
    providerUsers.push(u);
    providers.push({ _id: new Types.ObjectId(), userId: u._id, businessName: s.name, serviceTypes: s.services, location: { type: 'Point', coordinates: s.coords }, address: s.address, workingHours: '09:00 AM - 07:00 PM', rating: s.rating, status: 'approved', createdAt: u.createdAt, updatedAt: u.createdAt });
  });
  const pendingUser = user(`${PENDING_STATION.name} (Owner)`, 'pending.provider@drivedock.com', 'provider', PENDING_STATION.district, PENDING_STATION.state, daysAgo(4));
  providerUsers.push(pendingUser);
  providers.push({ _id: new Types.ObjectId(), userId: pendingUser._id, businessName: PENDING_STATION.name, serviceTypes: PENDING_STATION.services, location: { type: 'Point', coordinates: PENDING_STATION.coords }, address: PENDING_STATION.address, workingHours: '10:00 AM - 06:00 PM', rating: 4.8, status: 'pending', createdAt: pendingUser.createdAt, updatedAt: pendingUser.createdAt });
  const approved = providers.filter((p) => p.status === 'approved');
  const nearestStation = (area: Area) => {
    const local = approved.filter((p) => STATIONS.find((s) => s.name === p.businessName)!.state === area.state);
    return chance(0.8) && local.length ? pick(local) : pick(approved);
  };

  // ---------- Vehicle owners ----------
  const owners: any[] = [owner];
  const ownerCount = Math.round(VEHICLE_COUNT * 0.62);
  for (let i = 0; i < ownerCount; i++) {
    const area = weighted(AREAS.map((a) => [a, a.weight] as [Area, number]));
    const first = pick(FIRST); const last = pick(LAST);
    owners.push({ ...user(`${first} ${last}`, `${first}.${last}.${i + 1}@example.com`.toLowerCase(), 'owner', area.district, area.state, daysAgo(int(5, 180))), _area: area });
  }

  const vehicles: any[] = [];
  const documents: any[] = [];
  const slots: any[] = [];
  const bookings: any[] = [];
  const payments: any[] = [];
  const reminders: any[] = [];
  const violations: any[] = [];
  const challans: any[] = [];

  const addCompletedBooking = (vehicle: any, ownerId: Types.ObjectId, provider: any, docType: DocumentType, when: Date, certUrl: string) => {
    const slot = { _id: new Types.ObjectId(), providerId: provider._id, date: isoDate(when), startTime: pick(SLOT_TIMES)[0], endTime: '', isBooked: true, createdAt: new Date(when.getTime() - int(2, 10) * DAY), updatedAt: when };
    slot.endTime = SLOT_TIMES.find(([s]) => s === slot.startTime)![1];
    const bookingId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const amount = SERVICE_FEES_INR[docType];
    payments.push({ _id: paymentId, bookingId, amount, currency: 'INR', razorpayOrderId: `order_demo_${hex(14)}`, razorpayPaymentId: `pay_demo_${hex(14)}`, razorpaySignature: hex(64), status: 'paid', createdAt: slot.createdAt, updatedAt: slot.createdAt });
    bookings.push({ _id: bookingId, ownerId, vehicleId: vehicle._id, providerId: provider._id, slotId: slot._id, documentType: docType, status: 'completed', paymentId, certificateUrl: certUrl, notes: '', cancellationReason: null, createdAt: slot.createdAt, updatedAt: when });
    slots.push(slot);
  };

  const buildVehicle = (ownerDoc: any, area: Area, m: ModelDef, opts: { plate?: string; profile?: 'compliant' | 'non' | 'expiring' | 'empty' } = {}) => {
    // Random vehicles get a compliance profile (illustrative mix): fully compliant, compliant with
    // something expiring within 30 days, or failing on 1-3 documents (missing / unverified / expired)
    const profile = opts.profile || weighted<'compliant' | 'expiring' | 'failing'>([['compliant', 42], ['expiring', 13], ['failing', 45]]);
    const failures = new Map<DocumentType, 'missing' | 'unverified' | 'expired'>();
    if (profile === 'failing') {
      const n = weighted<number>([[1, 60], [2, 30], [3, 10]]);
      const order = [...DOC_TYPES].sort(() => rand() - 0.5);
      for (const t of order.slice(0, n)) {
        failures.set(t, weighted<'missing' | 'unverified' | 'expired'>([['missing', 25], ['unverified', 40], ['expired', 35]]));
      }
    }
    const expiringType = profile === 'expiring' ? pick(DOC_TYPES.filter((t) => t !== 'rc')) : null;
    const createdAt = new Date(Math.max(ownerDoc.createdAt.getTime(), NOW - int(3, 170) * DAY));
    const v = { _id: new Types.ObjectId(), ownerId: ownerDoc._id, regNumber: opts.plate || plateFor(area), type: m.type, fuelType: m.fuel, make: m.make, model: m.model, year: int(2014, 2025), qrCodeId: `DD-${hex(12).toUpperCase()}`, region: { state: area.state, district: area.district }, createdAt, updatedAt: createdAt };
    vehicles.push(v);
    if (opts.profile === 'empty') return v; // just registered: no documents uploaded yet

    for (const type of DOC_TYPES) {
      let present = true;
      let expiry: Date;
      let verified: boolean;
      if (opts.profile === 'compliant') { present = true; verified = true; expiry = daysFromNow(int(60, 600)); }
      else if (opts.profile === 'expiring') { present = true; verified = true; expiry = type === 'puc' ? daysFromNow(5) : daysFromNow(int(90, 600)); }
      else if (opts.profile === 'non') { present = type !== 'fitness'; verified = type === 'rc'; expiry = type === 'insurance' ? daysAgo(35) : daysFromNow(int(60, 300)); }
      else {
        const failure = failures.get(type);
        present = failure !== 'missing';
        verified = failure !== 'unverified';
        expiry = failure === 'expired' ? daysAgo(int(1, 150)) : type === expiringType ? daysFromNow(int(1, 30)) : daysFromNow(int(31, 700));
      }
      if (!present) continue;

      const termDays = type === 'puc' ? 365 : type === 'insurance' ? 365 : type === 'fitness' ? 730 : 3650;
      const issueDate = new Date(Math.min(expiry.getTime() - termDays * DAY, NOW - DAY));
      const status = expiry.getTime() < NOW ? 'expired' : expiry.getTime() - NOW <= 30 * DAY ? 'expiring_soon' : 'valid';
      const docId = new Types.ObjectId();
      let provider: any = null;
      if (verified) {
        provider = nearestStation(area);
        if (provider.serviceTypes.includes(type) && issueDate.getTime() > NOW - 180 * DAY && issueDate.getTime() > createdAt.getTime()) {
          addCompletedBooking(v, ownerDoc._id, provider, type, issueDate, SAMPLE_FILE);
        }
      }
      documents.push({ _id: docId, vehicleId: v._id, type, fileUrl: SAMPLE_FILE, fileHash: crypto.createHash('sha256').update(`${docId}`).digest('hex'), issueDate, expiryDate: expiry, status, lastUpdatedBy: verified ? 'provider' : 'owner', verified, issuedByProviderId: provider ? provider._id : null, createdAt: issueDate, updatedAt: issueDate });

      if (status !== 'expired') {
        for (const days of [30, 7, 1]) {
          const scheduledFor = new Date(expiry.getTime() - days * DAY);
          if (scheduledFor.getTime() < NOW - 60 * DAY) continue;
          const sent = scheduledFor.getTime() <= NOW;
          reminders.push({ _id: new Types.ObjectId(), documentId: docId, vehicleId: v._id, ownerId: ownerDoc._id, scheduledFor, channel: 'push', thresholdDays: days, message: `Your vehicle ${v.regNumber} ${type.toUpperCase()} document is expiring in ${days} day(s). Tap to book a renewal slot.`, sent, sentAt: sent ? scheduledFor : undefined, createdAt: issueDate, updatedAt: sent ? scheduledFor : issueDate });
        }
      }
    }
    return v;
  };

  // ---------- Demo owner's three walkthrough vehicles ----------
  const delhiSouth = AREAS.find((a) => a.district === 'South Delhi')!;
  const delhiNW = AREAS.find((a) => a.district === 'North West Delhi')!;
  const gurugram = AREAS.find((a) => a.district === 'Gurugram')!;
  buildVehicle(owner, delhiSouth, { make: 'Tata', model: 'Nexon EV', type: 'car', fuel: 'ev', weight: 0 }, { plate: 'DL3CAB1234', profile: 'compliant' });
  buildVehicle(owner, delhiNW, { make: 'Hyundai', model: 'Creta', type: 'car', fuel: 'petrol', weight: 0 }, { plate: 'DL8CAF5678', profile: 'non' });
  buildVehicle(owner, gurugram, { make: 'Royal Enfield', model: 'Classic 350', type: 'bike', fuel: 'petrol', weight: 0 }, { plate: 'HR26DK9012', profile: 'expiring' });
  const noida = AREAS.find((a) => a.district === 'Gautam Buddh Nagar')!;
  const delhiWest = AREAS.find((a) => a.district === 'West Delhi')!;
  // PUC expires in 5 days and its renewal is already booked and paid at Capital Auto for tomorrow
  const swift = buildVehicle(owner, noida, { make: 'Maruti Suzuki', model: 'Swift', type: 'car', fuel: 'petrol', weight: 0 }, { plate: 'UP16KB4321', profile: 'expiring' });
  // Just registered, no papers yet
  buildVehicle(owner, delhiWest, { make: 'Honda', model: 'City', type: 'car', fuel: 'petrol', weight: 0 }, { plate: 'DL4CXY7788', profile: 'empty' });
  ['DL3CAB1234', 'DL8CAF5678', 'HR26DK9012', 'UP16KB4321', 'DL4CXY7788'].forEach((p) => usedPlates.add(p));
  const HERO_COUNT = vehicles.length;

  // Swift's PUC renewal: booked and paid two hours ago at Capital Auto (shows as NEW on that station's screen)
  {
    const capital = approved[0];
    const bookedAt = new Date(NOW - 2 * 60 * 60 * 1000);
    const slot = { _id: new Types.ObjectId(), providerId: capital._id, date: isoDate(daysFromNow(1)), startTime: '11:00 AM', endTime: '12:00 PM', isBooked: true, createdAt: daysAgo(3), updatedAt: bookedAt };
    const bookingId = new Types.ObjectId(); const paymentId = new Types.ObjectId();
    slots.push(slot);
    payments.push({ _id: paymentId, bookingId, amount: SERVICE_FEES_INR.puc, currency: 'INR', razorpayOrderId: `order_demo_${hex(14)}`, razorpayPaymentId: `pay_demo_${hex(14)}`, razorpaySignature: hex(64), status: 'paid', createdAt: bookedAt, updatedAt: bookedAt });
    bookings.push({ _id: bookingId, ownerId: owner._id, vehicleId: swift._id, providerId: capital._id, slotId: slot._id, documentType: 'puc', status: 'confirmed', paymentId, certificateUrl: '', notes: '', cancellationReason: null, createdAt: bookedAt, updatedAt: bookedAt });
  }

  // Royal Enfield's ownership history: bought from a previous owner five months ago (Vehicle Twin ledger)
  const transfers: any[] = [];
  {
    const bike = vehicles.find((v) => v.regNumber === 'HR26DK9012');
    const prevOwner = owners[1];
    const acceptedAt = daysAgo(150);
    const snapshot = { score: 82, verifiedDocTypes: ['rc', 'insurance', 'puc', 'license'], completedServiceCount: 2, violationCount: 0, ownershipIndex: 1 };
    const snapshotHash = computeSnapshotHash(snapshot);
    transfers.push({
      _id: new Types.ObjectId(), vehicleId: bike._id, fromOwnerId: prevOwner._id, toOwnerId: owner._id, status: 'accepted',
      expiresAt: new Date(acceptedAt.getTime() + 10 * 60 * 1000), snapshot, snapshotHash, prevHash: 'GENESIS',
      hash: computeHash('GENESIS', String(bike._id), String(prevOwner._id), String(owner._id), acceptedAt, snapshotHash),
      acceptedAt, createdAt: new Date(acceptedAt.getTime() - 5 * 60 * 1000), updatedAt: acceptedAt
    });
  }

  // ---------- Everyone else's vehicles ----------
  for (let i = vehicles.length; i < VEHICLE_COUNT; i++) {
    const o = i - HERO_COUNT < ownerCount ? owners[1 + ((i - HERO_COUNT) % ownerCount)] : pick(owners.slice(1));
    buildVehicle(o, o._area, weighted(MODELS.map((m) => [m, m.weight] as [ModelDef, number])));
  }

  // ---------- Upcoming and cancelled bookings (open slots too) ----------
  const activeBookingKeys = new Set<string>();
  for (const p of approved) {
    for (let d = 1; d <= 7; d++) {
      for (const [start, end] of SLOT_TIMES) {
        if (!chance(0.7)) continue;
        const slot = { _id: new Types.ObjectId(), providerId: p._id, date: isoDate(daysFromNow(d)), startTime: start, endTime: end, isBooked: false, createdAt: daysAgo(int(1, 6)), updatedAt: daysAgo(1) };
        slots.push(slot);
        if (chance(0.25)) {
          const v = pick(vehicles.slice(HERO_COUNT)); const type = pick(p.serviceTypes as DocumentType[]);
          // One active booking per vehicle and document (matches the server's unique index)
          const key = `${v._id}:${type}`;
          if (activeBookingKeys.has(key)) continue;
          activeBookingKeys.add(key);
          slot.isBooked = true;
          const bookingId = new Types.ObjectId(); const paymentId = new Types.ObjectId();
          payments.push({ _id: paymentId, bookingId, amount: SERVICE_FEES_INR[type], currency: 'INR', razorpayOrderId: `order_demo_${hex(14)}`, razorpayPaymentId: `pay_demo_${hex(14)}`, razorpaySignature: hex(64), status: 'paid', createdAt: slot.createdAt, updatedAt: slot.createdAt });
          bookings.push({ _id: bookingId, ownerId: v.ownerId, vehicleId: v._id, providerId: p._id, slotId: slot._id, documentType: type, status: 'confirmed', paymentId, certificateUrl: '', notes: '', cancellationReason: null, createdAt: slot.createdAt, updatedAt: slot.createdAt });
        }
      }
    }
  }
  for (let i = 0; i < 18; i++) {
    const p = pick(approved); const v = pick(vehicles.slice(HERO_COUNT)); const when = daysAgo(int(2, 150));
    const slot = { _id: new Types.ObjectId(), providerId: p._id, date: isoDate(when), startTime: '11:00 AM', endTime: '12:00 PM', isBooked: false, createdAt: when, updatedAt: when };
    slots.push(slot);
    bookings.push({ _id: new Types.ObjectId(), ownerId: v.ownerId, vehicleId: v._id, providerId: p._id, slotId: slot._id, documentType: pick(p.serviceTypes as DocumentType[]), status: 'cancelled', paymentId: null, certificateUrl: '', notes: '', cancellationReason: chance(0.7) ? 'payment_timeout' : 'cancelled', createdAt: when, updatedAt: new Date(when.getTime() + DAY / 48) });
  }

  // ---------- Roadside checks: violations and e-challans on non-compliant vehicles ----------
  const docsByVehicle = new Map<string, any[]>();
  for (const d of documents) { const k = String(d.vehicleId); if (!docsByVehicle.has(k)) docsByVehicle.set(k, []); docsByVehicle.get(k)!.push(d); }
  const failingTypes = (v: any): DocumentType[] => {
    const docs = docsByVehicle.get(String(v._id)) || [];
    return DOC_TYPES.filter((t) => { const d = docs.find((x) => x.type === t); return !d || !d.verified || d.status === 'expired'; });
  };
  // Walkthrough vehicles stay predictable: only DL8CAF5678 among them gets violations
  const nonCompliant = vehicles.slice(HERO_COUNT).filter((v) => failingTypes(v).length > 0);
  const violationCount = Math.min(140, nonCompliant.length * 2);
  for (let i = 0; i < violationCount; i++) {
    const v = i === 0 ? vehicles.find((x) => x.regNumber === 'DL8CAF5678') : pick(nonCompliant);
    const failing = failingTypes(v);
    const flagged = failing.filter((t) => t !== 'license').slice(0, int(1, 2));
    if (!flagged.length) continue;
    const issuedAt = i === 0 ? daysAgo(3) : daysAgo(int(1, 180));
    const paid = i !== 0 && chance(issuedAt.getTime() < NOW - 20 * DAY ? 0.7 : 0.3);
    const challanId = new Types.ObjectId();
    challans.push({ _id: challanId, vehicleId: v._id, amount: flagged.reduce((s, t) => s + PENALTY[t], 0), reason: `Non-compliance violation: ${flagged.map((t) => t.toUpperCase()).join(', ')} invalid or unverified`, status: paid ? 'paid' : 'pending', issuedAt, paidAt: paid ? new Date(issuedAt.getTime() + int(1, 15) * DAY) : undefined, createdAt: issuedAt, updatedAt: issuedAt });
    violations.push({ _id: new Types.ObjectId(), vehicleId: v._id, officerId: pick(officers)._id, documentTypeExpired: flagged, location: pick(CHECKPOINTS), notes: '', challanId, createdAt: issuedAt, updatedAt: issuedAt });
  }

  // ---------- Write everything (timestamps: false keeps the historical createdAt values) ----------
  const strip = (o: any) => { const { _area, ...rest } = o; return rest; };
  const opts = { timestamps: false } as any;
  await User.insertMany([...owners.map(strip), buyer, ...officers, gov, admin, ...providerUsers], opts);
  await Provider.insertMany(providers, opts);
  await Vehicle.insertMany(vehicles, opts);
  await DocumentModel.insertMany(documents, opts);
  await Slot.insertMany(slots, opts);
  await Payment.insertMany(payments, opts);
  await Booking.insertMany(bookings, opts);
  await Reminder.insertMany(reminders, opts);
  await Challan.insertMany(challans, opts);
  await Violation.insertMany(violations, opts);
  await OwnershipTransfer.insertMany(transfers, opts);

  const compliant = vehicles.filter((v) => failingTypes(v).length === 0).length;
  console.log('========================================================================');
  console.log('NCR SAMPLE DATASET loaded (synthetic data for demos; label it as such)');
  console.log('------------------------------------------------------------------------');
  console.log(`Owners: ${owners.length}  Vehicles: ${vehicles.length}  Fully compliant: ${compliant} (${Math.round((compliant / vehicles.length) * 100)}%)`);
  console.log(`Stations: ${approved.length} approved + 1 pending  Documents: ${documents.length}  Slots: ${slots.length}`);
  console.log(`Bookings: ${bookings.length}  Payments: ${payments.length}  Violations: ${violations.length}  Challans: ${challans.length}  Reminders: ${reminders.length}`);
  console.log('Logins (password123): owner@ / provider@ / officer@ / gov@ / admin@drivedock.com, pending.provider@drivedock.com,');
  console.log('                      buyer@drivedock.com (second owner), station2..9@drivedock.demo (other stations)');
  console.log('------------------------------------------------------------------------');
  console.log('DEMO SCENARIOS (owner@drivedock.com unless noted)');
  console.log(' 1. QR GREEN ............ DL3CAB1234 Show QR Code -> officer scans -> GREEN');
  console.log(' 2. QR RED .............. DL8CAF5678 -> RED: PUC + licence unverified, insurance expired, fitness missing; e-challan');
  console.log(' 3. Renewal not due ..... Renewals > DL3CAB1234 > PUC -> "No renewal needed yet", opens 30 days before expiry');
  console.log(' 4. Book + pay .......... Renewals > HR26DK9012 > PUC (expires in 5 days) -> pick a station -> Book & Pay');
  console.log(' 5. Already booked ...... Renewals > UP16KB4321 > PUC -> booked and paid at Capital Auto for tomorrow 11:00 AM');
  console.log(' 6. Station sees it ..... Approved Provider > Capital Auto -> UP16KB4321 at the top (NEW) -> Certify & Complete');
  console.log(' 7. Fix a RED car ....... Renewals > DL8CAF5678 > INSURANCE (expired) or PUC (unverified) -> Book & Pay');
  console.log(' 8. Upload papers ....... DL4CXY7788 (no documents) > Manage Papers -> upload -> stays UNVERIFIED until a station certifies');
  console.log(' 9. Vehicle Twin ........ HR26DK9012 > Manage Papers > Twin -> ownership history (bought 5 months ago)');
  console.log('10. Buy a Car ........... owner: DL3CAB1234 Twin > Transfer; buyer@drivedock.com: Add Vehicle > Scan QR > Apply;')
  console.log('                         owner approves on the QR screen (or Twin page / dashboard banner) -> car moves to buyer');
  console.log('11. Officer ............. officer@drivedock.com -> scan QR, log a violation -> fee-table e-challan');
  console.log('12. Admin ............... admin@drivedock.com -> approve Raj Nagar Quick PUC (pending) / add staff');
  console.log('13. Government .......... gov@drivedock.com -> compliance index, districts, trends');
  console.log('========================================================================');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('[SeedDemo] Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});

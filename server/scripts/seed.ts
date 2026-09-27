import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { DocumentModel } from '../src/models/Document';
import { Provider } from '../src/models/Provider';
import { Slot } from '../src/models/Slot';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { Reminder } from '../src/models/Reminder';
import { Violation } from '../src/models/Violation';
import { Challan } from '../src/models/Challan';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/drivedock';

const seedDatabase = async () => {
  try {
    console.log('[Seed] Connecting to MongoDB at', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('[Seed] Connected. Clearing previous seed collections...');

    await Promise.all([
      User.deleteMany({}),
      Vehicle.deleteMany({}),
      DocumentModel.deleteMany({}),
      Provider.deleteMany({}),
      Slot.deleteMany({}),
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Reminder.deleteMany({}),
      Violation.deleteMany({}),
      Challan.deleteMany({})
    ]);

    const passwordHash = await bcrypt.hash('password123', 10);

    console.log('[Seed] Creating 5-role users...');
    // 1. Owner User
    const ownerUser = await User.create({
      name: 'Aarav Sharma',
      email: 'owner@drivedock.com',
      phone: '+919876543210',
      passwordHash,
      role: 'owner',
      address: { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }
    });

    // 2. Approved Provider User
    const approvedProviderUser = await User.create({
      name: 'Rajesh Verma (Apex Auto)',
      email: 'provider@drivedock.com',
      phone: '+919811122233',
      passwordHash,
      role: 'provider',
      address: { city: 'Mumbai', state: 'Maharashtra', pincode: '400050' }
    });

    // 3. Pending Provider User (Demonstrates Trust Rule 3: Gatekeeping)
    const pendingProviderUser = await User.create({
      name: 'Suresh Kumar (QuickFix)',
      email: 'pending.provider@drivedock.com',
      phone: '+919822233344',
      passwordHash,
      role: 'provider',
      address: { city: 'Thane', state: 'Maharashtra', pincode: '400601' }
    });

    // 4. Officer User
    const officerUser = await User.create({
      name: 'Inspector Vikram Patil',
      email: 'officer@drivedock.com',
      phone: '+919833344455',
      passwordHash,
      role: 'officer',
      address: { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }
    });

    // 5. Government User
    const govUser = await User.create({
      name: 'RTO Ministry Analytics Desk',
      email: 'gov@drivedock.com',
      phone: '+919844455566',
      passwordHash,
      role: 'government',
      address: { city: 'New Delhi', state: 'Delhi', pincode: '110001' }
    });

    // 6. Admin User
    const adminUser = await User.create({
      name: 'DriveDock Head Admin',
      email: 'admin@drivedock.com',
      phone: '+919855566677',
      passwordHash,
      role: 'admin',
      address: { city: 'Mumbai', state: 'Maharashtra', pincode: '400051' }
    });

    console.log('[Seed] Creating Provider profiles...');
    // Approved Provider
    const approvedProvider = await Provider.create({
      userId: approvedProviderUser._id,
      businessName: 'Apex Auto Certifications & PUC Hub',
      serviceTypes: ['puc', 'fitness', 'insurance', 'rc'],
      location: {
        type: 'Point',
        coordinates: [72.8777, 19.0760] // Mumbai BKC
      },
      address: 'Shop 14, BKC Complex, Bandra East, Mumbai, Maharashtra 400051',
      workingHours: '08:30 AM - 08:00 PM',
      rating: 4.9,
      status: 'approved'
    });

    // Pending Provider (Must NOT appear in search per Trust Rule 3)
    const pendingProvider = await Provider.create({
      userId: pendingProviderUser._id,
      businessName: 'QuickFix Smog & Inspection Workshop',
      serviceTypes: ['puc', 'fitness'],
      location: {
        type: 'Point',
        coordinates: [72.9781, 19.2183] // Thane
      },
      address: 'Station Road, Thane West, Maharashtra 400601',
      workingHours: '09:00 AM - 06:00 PM',
      rating: 4.2,
      status: 'pending' // Admin must approve
    });

    console.log('[Seed] Creating Slots for Approved Provider...');
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const slot1 = await Slot.create({
      providerId: approvedProvider._id,
      date: today,
      startTime: '10:00 AM',
      endTime: '11:00 AM',
      isBooked: false
    });

    const slot2 = await Slot.create({
      providerId: approvedProvider._id,
      date: today,
      startTime: '11:30 AM',
      endTime: '12:30 PM',
      isBooked: false
    });

    const slot3 = await Slot.create({
      providerId: approvedProvider._id,
      date: tomorrow,
      startTime: '02:00 PM',
      endTime: '03:00 PM',
      isBooked: false
    });

    console.log('[Seed] Creating Vehicles with diverse compliance states...');
    // Vehicle 1: 100% Compliant (All 5 documents verified: true + valid) -> QR will be GREEN!
    const v1 = await Vehicle.create({
      ownerId: ownerUser._id,
      regNumber: 'MH01AB1234',
      type: 'car',
      fuelType: 'ev',
      make: 'Tata',
      model: 'Nexon EV Empowered',
      year: 2023,
      qrCodeId: 'DD-QR-COMPLIANT-001',
      region: { state: 'Maharashtra', district: 'Mumbai' }
    });

    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const lastYear = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const docTypes: Array<'rc' | 'insurance' | 'puc' | 'license' | 'fitness'> = [
      'rc',
      'insurance',
      'puc',
      'license',
      'fitness'
    ];

    for (const dt of docTypes) {
      await DocumentModel.create({
        vehicleId: v1._id,
        type: dt,
        fileUrl: `https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80`,
        fileHash: `sha256-verified-genuine-cert-${dt}`,
        issueDate: lastYear,
        expiryDate: nextYear,
        status: 'valid',
        lastUpdatedBy: 'provider',
        verified: true, // VERIFIED GENUINE
        issuedByProviderId: approvedProvider._id
      });
    }

    // Vehicle 2: Non-compliant demo (Trust Rule 1 & 2 Demo)
    // Has unverified documents (owner uploaded photo only) AND expired insurance -> QR MUST BE RED!
    const v2 = await Vehicle.create({
      ownerId: ownerUser._id,
      regNumber: 'MH02CD5678',
      type: 'car',
      fuelType: 'petrol',
      make: 'Hyundai',
      model: 'Creta SX',
      year: 2021,
      qrCodeId: 'DD-QR-NONCOMPLIANT-002',
      region: { state: 'Maharashtra', district: 'Mumbai' }
    });

    // RC is verified
    await DocumentModel.create({
      vehicleId: v2._id,
      type: 'rc',
      fileUrl: `https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80`,
      fileHash: 'sha256-v2-rc',
      issueDate: lastYear,
      expiryDate: nextYear,
      status: 'valid',
      lastUpdatedBy: 'provider',
      verified: true,
      issuedByProviderId: approvedProvider._id
    });

    // Insurance is EXPIRED
    await DocumentModel.create({
      vehicleId: v2._id,
      type: 'insurance',
      fileUrl: `https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80`,
      fileHash: 'sha256-v2-insurance',
      issueDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
      status: 'expired',
      lastUpdatedBy: 'owner',
      verified: false
    });

    // PUC was uploaded by owner for personal tracking: verified is FALSE! (Trust Rule 1)
    await DocumentModel.create({
      vehicleId: v2._id,
      type: 'puc',
      fileUrl: `https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80`,
      fileHash: 'sha256-v2-puc',
      issueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      status: 'valid',
      lastUpdatedBy: 'owner',
      verified: false // Unverified: owner uploaded photo only!
    });

    // Vehicle 3: Expiring soon (Reminders active)
    const v3 = await Vehicle.create({
      ownerId: ownerUser._id,
      regNumber: 'MH04EF9012',
      type: 'bike',
      fuelType: 'petrol',
      make: 'Royal Enfield',
      model: 'Classic 350 Dark',
      year: 2022,
      qrCodeId: 'DD-QR-EXPIRING-003',
      region: { state: 'Maharashtra', district: 'Thane' }
    });

    const soonExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
    const docPuc3 = await DocumentModel.create({
      vehicleId: v3._id,
      type: 'puc',
      fileUrl: `https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80`,
      fileHash: 'sha256-v3-puc',
      issueDate: lastYear,
      expiryDate: soonExpiry,
      status: 'expiring_soon',
      lastUpdatedBy: 'provider',
      verified: true,
      issuedByProviderId: approvedProvider._id
    });

    // Active Reminder due right now (Trust Rule 7)
    await Reminder.create({
      documentId: docPuc3._id,
      vehicleId: v3._id,
      ownerId: ownerUser._id,
      scheduledFor: new Date(Date.now() - 3600000), // scheduled 1 hour ago
      channel: 'push',
      thresholdDays: 7,
      message: "Your vehicle MH04EF9012 PUC document is expiring in 5 days. Tap to book with Apex Auto.",
      sent: false
    });

    console.log('[Seed] Creating Sample Challans & Violations...');
    const challan1 = await Challan.create({
      vehicleId: v2._id,
      amount: 2000,
      reason: 'Non-compliance violation: INSURANCE expired & PUC unverified',
      status: 'pending',
      issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    });

    await Violation.create({
      vehicleId: v2._id,
      officerId: officerUser._id,
      documentTypeExpired: ['insurance', 'puc'],
      location: 'Marine Drive Traffic Checkpoint, Mumbai',
      notes: 'Driver failed compliance check. Insurance certificate expired 35 days ago.',
      challanId: challan1._id
    });

    const challanPaid = await Challan.create({
      vehicleId: v1._id,
      amount: 500,
      reason: 'Over-speeding at Bandra-Worli Sea Link',
      status: 'paid',
      issuedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      paidAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000)
    });

    console.log('========================================================================');
    console.log('✅ DriveDock Database Seeded Successfully!');
    console.log('------------------------------------------------------------------------');
    console.log('Demo Credentials (All passwords: "password123"):');
    console.log('1. Owner:           owner@drivedock.com');
    console.log('2. Approved Provider: provider@drivedock.com');
    console.log('3. Pending Provider:  pending.provider@drivedock.com (Invisible in search)');
    console.log('4. Officer:          officer@drivedock.com');
    console.log('5. Government:       gov@drivedock.com');
    console.log('6. Admin:            admin@drivedock.com');
    console.log('------------------------------------------------------------------------');
    console.log('Demo Vehicles:');
    console.log(`- MH01AB1234: 100% Compliant (All 5 verified docs) -> Officer QR: GREEN`);
    console.log(`- MH02CD5678: Non-compliant (Expired insurance & unverified PUC) -> QR: RED`);
    console.log(`- MH04EF9012: Expiring Soon (PUC in 5 days) + active pending reminder`);
    console.log('========================================================================');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Seed] Error seeding database:', err);
    process.exit(1);
  }
};

seedDatabase();

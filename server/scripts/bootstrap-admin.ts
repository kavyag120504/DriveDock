import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import { User } from '../src/models/User';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/drivedock';

const run = async () => {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL;
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !phone || !password) {
    console.error('[Bootstrap] Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, and ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  console.log('[Bootstrap] Connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    console.log(`[Bootstrap] Admin already exists: ${existing.email} (role: ${existing.role}). Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const admin = await User.create({
    name,
    email: email.toLowerCase().trim(),
    phone,
    passwordHash,
    role: 'admin',
    address: { city: '', state: '', pincode: '' }
  });

  console.log(`[Bootstrap] Admin created: ${admin.email} (id: ${admin._id})`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('[Bootstrap] Failed:', err);
  process.exit(1);
});

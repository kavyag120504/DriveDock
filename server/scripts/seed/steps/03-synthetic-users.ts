import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, IUser } from '../../../src/models/User';
import { SEED_CONFIG } from '../config';
import { registerMany } from '../lib/registry';

const FIRST_NAMES = [
  'Arjun', 'Priya', 'Rohan', 'Anjali', 'Vikram',
  'Deepika', 'Rahul', 'Sneha', 'Amit', 'Kavita',
];

export interface UserSeedResult {
  owners:     (IUser & { _id: mongoose.Types.ObjectId })[];
  officer:    IUser & { _id: mongoose.Types.ObjectId };
  government: IUser & { _id: mongoose.Types.ObjectId };
  admin:      IUser & { _id: mongoose.Types.ObjectId };
  userIds:    mongoose.Types.ObjectId[];
}

export async function seedSyntheticUsers(runId: string, dryRun: boolean): Promise<UserSeedResult> {
  const { SEED_STATE, SEED_AREA_NAME, SEED_DEMO_PASSWORD } = SEED_CONFIG;

  if (dryRun) {
    console.log('[DRY-RUN] Would create 10 owner users + officer + government + admin');
    // Return dummy result for dry-run
    const dummy = { _id: new mongoose.Types.ObjectId(), name: 'DRY-RUN', email: '', phone: '', passwordHash: '', role: 'owner' as const, address: { city: '', state: '', pincode: '' } };
    return { owners: Array(10).fill(dummy), officer: dummy as any, government: dummy as any, admin: dummy as any, userIds: [] };
  }

  const passwordHash = await bcrypt.hash(SEED_DEMO_PASSWORD, 10);
  const userIds: mongoose.Types.ObjectId[] = [];

  // 10 owners
  const owners: (IUser & { _id: mongoose.Types.ObjectId })[] = [];
  for (let i = 0; i < 10; i++) {
    const n = i + 1;
    const user = await User.create({
      name:         `${FIRST_NAMES[i]} Demo`,
      email:        `owner${String(n).padStart(2, '0')}@demo.drivedock.test`,
      phone:        `800000${String(n).padStart(4, '0')}`,
      passwordHash,
      role:         'owner',
      address:      { city: SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
    });
    owners.push(user as IUser & { _id: mongoose.Types.ObjectId });
    userIds.push(user._id as mongoose.Types.ObjectId);
  }

  const officer = await User.create({
    name:         'Demo Officer',
    email:        'officer01@demo.drivedock.test',
    phone:        '800000' + '0011',
    passwordHash,
    role:         'officer',
    address:      { city: SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
  });
  userIds.push(officer._id as mongoose.Types.ObjectId);

  const government = await User.create({
    name:         'Demo Government Analyst',
    email:        'gov01@demo.drivedock.test',
    phone:        '800000' + '0012',
    passwordHash,
    role:         'government',
    address:      { city: SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
  });
  userIds.push(government._id as mongoose.Types.ObjectId);

  const admin = await User.create({
    name:         'Demo Admin',
    email:        'admin01@demo.drivedock.test',
    phone:        '800000' + '0013',
    passwordHash,
    role:         'admin',
    address:      { city: SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
  });
  userIds.push(admin._id as mongoose.Types.ObjectId);

  await registerMany(runId, 'users', userIds);

  console.log(`[Users] Created 10 owners + officer + government + admin (password: ${SEED_DEMO_PASSWORD})`);

  return {
    owners:     owners,
    officer:    officer as IUser & { _id: mongoose.Types.ObjectId },
    government: government as IUser & { _id: mongoose.Types.ObjectId },
    admin:      admin as IUser & { _id: mongoose.Types.ObjectId },
    userIds,
  };
}

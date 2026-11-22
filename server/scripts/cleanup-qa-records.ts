/**
 * Removes the records created by the hosted QA pass of 23 Nov 2026 (the scripted end-to-end check of the pilot):
 * a test station, its slots, three test vehicles and everything attached to them (bookings, payments, documents and
 * their uploaded files, reminders, violations, e-challans, the ownership transfer and its paperwork).
 *
 *   MONGO_URI="<pilot database uri ending in /drivedock_pilot_YYYYMMDD>" npx ts-node scripts/cleanup-qa-records.ts
 *       -> DRY RUN: only counts what it would delete.
 *   MONGO_URI=... npx ts-node scripts/cleanup-qa-records.ts --confirm=drivedock_pilot_YYYYMMDD
 *       -> deletes.
 *
 * Guards: the database must be named drivedock_pilot_YYYYMMDD, deleting needs --confirm=<that name>, and it only
 * touches records tied to the QA markers below (the test station user and three test plates); the seeded demo
 * data is never matched. Audit logs (AuditLog, PaperworkAudit) are append-only by design and are left alone.
 */
import mongoose from 'mongoose';

const PILOT_DB = /^drivedock_pilot_\d{8}$/;
const STATION_EMAIL = 'qa.station.231123@drivedock.test';
const STATION_NAME = 'QA Test PUC Centre (TEST)';
const PLATES = ['MH05QA2311', 'MH05QA2312', 'MH05QA2313'];

const fail = (msg: string): never => { console.error(`[CleanupQA] REFUSED: ${msg}`); process.exit(1); };
const oid = (ids: any[]) => ids.map((i) => new mongoose.Types.ObjectId(String(i)));
const base = (url?: string) => (url ? String(url).split('?')[0].split('/').pop() || '' : '');

const main = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) fail('MONGO_URI is not set.');
  let dbName = '';
  try { dbName = new URL(uri!.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.replace(/^\//, '').split('?')[0]; } catch { fail('MONGO_URI is not a valid URL.'); }
  if (!PILOT_DB.test(dbName)) fail(`database "${dbName}" is not named drivedock_pilot_YYYYMMDD.`);
  const confirm = process.argv.find((a) => a.startsWith('--confirm='))?.split('=')[1];
  const doDelete = confirm === dbName;
  if (confirm && !doDelete) fail(`--confirm must equal the database name (${dbName}).`);

  await mongoose.connect(uri!);
  const db = mongoose.connection.db!;
  const col = (n: string) => db.collection(n);

  const user = await col('users').findOne({ email: STATION_EMAIL });
  const userIds = user ? [user._id] : [];
  const providers = await col('providers').find({ $or: [{ userId: { $in: userIds } }, { businessName: STATION_NAME }] }).toArray();
  const providerIds = providers.map((p) => p._id);
  const vehicles = await col('vehicles').find({ regNumber: { $in: PLATES } }).toArray();
  const vehicleIds = vehicles.map((v) => v._id);
  const bookings = await col('bookings').find({ $or: [{ vehicleId: { $in: vehicleIds } }, { providerId: { $in: providerIds } }] }).toArray();
  const bookingIds = bookings.map((b) => b._id);
  const documents = await col('documents').find({ vehicleId: { $in: vehicleIds } }).toArray();
  const transfers = await col('ownershiptransfers').find({ vehicleId: { $in: vehicleIds } }).toArray();
  const transferIds = transfers.map((t) => t._id);
  const fileNames = [...documents.map((d) => base(d.fileUrl)), ...bookings.map((b) => base(b.certificateUrl))].filter(Boolean);

  const plan: Array<[string, any]> = [
    ['payments', { bookingId: { $in: bookingIds } }],
    ['bookings', { _id: { $in: bookingIds } }],
    ['slots', { providerId: { $in: providerIds } }],
    ['documents', { vehicleId: { $in: vehicleIds } }],
    ['reminders', { $or: [{ vehicleId: { $in: vehicleIds } }, { transferId: { $in: transferIds } }] }],
    ['violations', { vehicleId: { $in: vehicleIds } }],
    ['challans', { vehicleId: { $in: vehicleIds } }],
    ['transferpaperworks', { transferId: { $in: transferIds } }],
    ['ownershiptransfers', { _id: { $in: transferIds } }],
    ['twinshares', { vehicleId: { $in: vehicleIds } }],
    ['vehicles', { _id: { $in: vehicleIds } }],
    ['providers', { _id: { $in: providerIds } }],
    ['refreshtokens', { userId: { $in: userIds } }],
    ['users', { _id: { $in: userIds } }]
  ];

  console.log(`[CleanupQA] Database: ${dbName} | mode: ${doDelete ? 'DELETE' : 'DRY RUN (add --confirm=' + dbName + ' to delete)'}`);
  console.log(`[CleanupQA] Matched: station user ${userIds.length} (${user ? (user as any).email : '-'}), centres ${providerIds.length} (${providers.map((p) => p.businessName).join(', ') || '-'}), vehicles ${vehicleIds.length} (${vehicles.map((v) => v.regNumber).join(', ') || '-'}), uploaded files ${fileNames.length}`);
  let total = 0;
  for (const [name, filter] of plan) {
    const n = await col(name).countDocuments(filter);
    total += n;
    if (doDelete && n) await col(name).deleteMany(filter);
    console.log(`  ${name.padEnd(20)} ${doDelete ? 'deleted' : 'would delete'} ${n}`);
  }
  // Uploaded files live in the GridFS bucket "uploads" on the hosted pilot (nothing to do when stored on disk).
  const files = fileNames.length ? await col('uploads.files').find({ filename: { $in: fileNames } }).toArray() : [];
  if (doDelete && files.length) {
    await col('uploads.chunks').deleteMany({ files_id: { $in: files.map((f) => f._id) } });
    await col('uploads.files').deleteMany({ _id: { $in: files.map((f) => f._id) } });
  }
  console.log(`  ${'uploads (GridFS)'.padEnd(20)} ${doDelete ? 'deleted' : 'would delete'} ${files.length} file(s)`);
  console.log(`[CleanupQA] ${doDelete ? 'Removed' : 'Would remove'} ${total + files.length} record(s). Audit logs were left untouched.`);
  await mongoose.disconnect();
};

main().catch(async (err) => { console.error('[CleanupQA] Failed:', err); await mongoose.disconnect().catch(() => {}); process.exit(1); });

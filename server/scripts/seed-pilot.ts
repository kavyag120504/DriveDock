/**
 * PILOT SEED GUARD: runs the NCR walkthrough dataset (scripts/seed-demo.ts) only against an
 * isolated pilot database. All of it is synthetic; nothing here is real customer data.
 *
 *   MONGO_URI=mongodb://127.0.0.1:27019/drivedock_pilot_20261116 \
 *   SEED_PASSWORD=<private> npx ts-node scripts/seed-pilot.ts --confirm=drivedock_pilot_20261116
 *
 * It refuses to run unless ALL of these hold:
 *   - NODE_ENV is not "production";
 *   - MONGO_URI points at 127.0.0.1 / localhost and the database is named drivedock_pilot_YYYYMMDD;
 *   - --confirm=<that exact database name> is passed;
 *   - SEED_PASSWORD is set (12+ characters), so the reachable pilot has no guessable logins;
 *   - the database is empty, or was created by this script earlier (marker in `pilot_meta`).
 *     Any other database with data in it is refused, so it can never wipe a real one.
 *
 * What it changes, in that database only: seed-demo.ts deletes every document in users, vehicles,
 * documents, providers, slots, bookings, payments, reminders, violations, challans,
 * ownershiptransfers and twinshares, then inserts the walkthrough dataset. Before that this
 * script also clears the session, audit and paperwork collections and writes the `pilot_meta` marker.
 * Running it again gives the same dataset (fixed random seed).
 */
import mongoose from 'mongoose';

const PILOT_DB = /^drivedock_pilot_\d{8}$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
// Collections seed-demo.ts does not clear but which hold data tied to the old users.
const EXTRA_CLEARED = ['refreshtokens', 'auditlogs', 'paperworkaudits', 'transferpaperworks'];

const fail = (msg: string): never => {
  console.error(`[SeedPilot] REFUSED: ${msg}`);
  process.exit(1);
};

const main = async () => {
  if (process.env.NODE_ENV === 'production') fail('NODE_ENV is "production".');

  const uri = process.env.MONGO_URI;
  if (!uri) fail('MONGO_URI is not set. Set it explicitly; the .env default is never used here.');
  let parsed: URL;
  try { parsed = new URL(uri!); } catch { return fail('MONGO_URI is not a valid URL.'); }
  if (parsed.protocol !== 'mongodb:') fail('only a plain local mongodb:// URI is allowed (no Atlas / SRV).');
  if (!LOCAL_HOSTS.has(parsed.hostname)) fail(`host "${parsed.hostname}" is not local.`);
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!PILOT_DB.test(dbName)) fail(`database "${dbName}" is not named drivedock_pilot_YYYYMMDD.`);

  const confirm = process.argv.find((a) => a.startsWith('--confirm='))?.split('=')[1];
  if (confirm !== dbName) fail(`pass --confirm=${dbName} to confirm the target database.`);

  const password = process.env.SEED_PASSWORD || '';
  if (password.length < 12) fail('SEED_PASSWORD must be set to a private value of 12+ characters.');

  await mongoose.connect(uri!);
  const db = mongoose.connection.db!;
  const marker = await db.collection('pilot_meta').findOne({ _id: 'pilot' as any });
  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  let nonEmpty = 0;
  for (const name of collections) nonEmpty += (await db.collection(name).estimatedDocumentCount()) > 0 ? 1 : 0;

  if (nonEmpty > 0 && !marker) {
    await mongoose.disconnect();
    fail(`"${dbName}" already holds data that this script did not create. Use a new, empty database.`);
  }

  console.log(`[SeedPilot] Target: ${parsed.host}/${dbName} (${marker ? 're-seed of an earlier pilot seed' : 'new empty database'})`);
  for (const name of EXTRA_CLEARED) {
    if (collections.includes(name)) await db.collection(name).deleteMany({});
  }
  await db.collection('pilot_meta').updateOne(
    { _id: 'pilot' as any },
    { $set: { db: dbName, label: 'DriveDock student pilot (synthetic data)', lastSeededAt: new Date() } },
    { upsert: true }
  );
  await mongoose.disconnect();

  // seed-demo.ts runs on import and reads MONGO_URI / SEED_PASSWORD from the environment.
  require('./seed-demo');
};

main().catch(async (err) => {
  console.error('[SeedPilot] Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});

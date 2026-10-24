/**
 * Fetches petrol-pump nodes from OpenStreetMap via Overpass API,
 * caches the raw response, and creates approved Provider records.
 *
 * Data source: OpenStreetMap contributors, ODbL licence.
 * No personal data is stored; only business name + public coordinates.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../../../src/models/User';
import { Provider } from '../../../src/models/Provider';
import { SEED_CONFIG } from '../config';
import { SeededRng } from '../lib/rng';
import { registerMany } from '../lib/registry';

const CACHE_FILE = path.join(__dirname, '../data/osm_fuel.json');
const OVERPASS   = 'https://overpass-api.de/api/interpreter';
const UA         = 'DriveDock-Demo-Seed/1.0 (academic project; not for production; contact: demo@drivedock.test)';

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function overpassPost(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(OVERPASS);
    const data = Buffer.from(body, 'utf8');
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': data.length,
          'User-Agent': UA,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetchOsmFuel(areaName: string, cap: number): Promise<OsmElement[]> {
  if (fs.existsSync(CACHE_FILE)) {
    console.log('[OSM] Using cache:', CACHE_FILE);
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    return (JSON.parse(raw) as { elements: OsmElement[] }).elements;
  }

  console.log(`[OSM] Querying Overpass for "${areaName}" fuel nodes…`);
  const query = `[out:json][timeout:30];
area[name="${areaName}"]->.a;
(
  node["amenity"="fuel"]["name"](area.a);
  way["amenity"="fuel"]["name"](area.a);
);
out center ${cap * 3};`;

  const raw = await overpassPost(`data=${encodeURIComponent(query)}`);

  // Guard: if the response is not JSON (e.g. HTML error page), fail clearly
  if (!raw.trim().startsWith('{')) {
    throw new Error(`[OSM] Unexpected Overpass response (not JSON). First 200 chars:\n${raw.slice(0, 200)}`);
  }

  const dataDir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, raw, 'utf8');
  console.log('[OSM] Cached raw response →', CACHE_FILE);

  return (JSON.parse(raw) as { elements: OsmElement[] }).elements;
}

export interface ProviderSeedResult {
  providerIds:     mongoose.Types.ObjectId[];
  providerUserIds: mongoose.Types.ObjectId[];
  providerCount:   number;
}

export async function seedOsmProviders(
  runId: string,
  rng:   SeededRng,
  dryRun: boolean
): Promise<ProviderSeedResult> {
  const { SEED_AREA_NAME, SEED_PROVIDER_COUNT, SEED_STATE } = SEED_CONFIG;

  let elements: OsmElement[] = [];
  try {
    elements = await fetchOsmFuel(SEED_AREA_NAME, SEED_PROVIDER_COUNT);
  } catch (err) {
    console.warn('[OSM] Fetch failed; using zero OSM providers. Error:', (err as Error).message);
  }

  // Keep only named elements; extract lat/lng
  const places = elements
    .filter((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      return lat !== undefined && lon !== undefined && el.tags?.name;
    })
    .slice(0, SEED_PROVIDER_COUNT)
    .map((el, i) => ({
      name: el.tags!.name!,
      lat:  (el.lat ?? el.center!.lat)!,
      lng:  (el.lon ?? el.center!.lon)!,
      addr: [
        el.tags?.['addr:housename'],
        el.tags?.['addr:street'],
        el.tags?.['addr:city'] || SEED_AREA_NAME,
        el.tags?.['addr:state'] || SEED_STATE,
      ]
        .filter(Boolean)
        .join(', '),
      idx: i,
    }));

  console.log(`[OSM] Using ${places.length} named fuel nodes from OSM`);

  if (dryRun) {
    console.log(`[DRY-RUN] Would create ${places.length} provider users + providers`);
    return { providerIds: [], providerUserIds: [], providerCount: places.length };
  }

  const passwordHash = await bcrypt.hash(SEED_CONFIG.SEED_DEMO_PASSWORD, 10);
  const providerIds: mongoose.Types.ObjectId[]     = [];
  const providerUserIds: mongoose.Types.ObjectId[] = [];

  const serviceOptions: string[][] = [
    ['puc'],
    ['puc'],
    ['puc'],
    ['puc', 'insurance'],
  ];

  for (const place of places) {
    const phone   = `900000${String(place.idx + 1).padStart(4, '0')}`;
    const email   = `provider${String(place.idx + 1).padStart(2, '0')}@demo.drivedock.test`;
    const serviceTypes = rng.pick(serviceOptions);

    const user = await User.create({
      name:         `${place.name} Staff`,
      email,
      phone,
      passwordHash,
      role:         'provider',
      address:      { city: SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
    });

    const provider = await Provider.create({
      userId:       user._id,
      businessName: place.name,
      serviceTypes,
      location: {
        type:        'Point',
        coordinates: [place.lng, place.lat],
      },
      address:      place.addr || `${place.name}, ${SEED_AREA_NAME}`,
      workingHours: '09:00 AM - 06:00 PM',
      rating:       Number((rng.nextInt(40, 50) / 10).toFixed(1)),
      status:       'approved',
    });

    providerUserIds.push(user._id as mongoose.Types.ObjectId);
    providerIds.push(provider._id as mongoose.Types.ObjectId);
  }

  await registerMany(runId, 'users', providerUserIds);
  await registerMany(runId, 'providers', providerIds);

  console.log(`[OSM] Created ${providerIds.length} approved providers`);
  return { providerIds, providerUserIds, providerCount: providerIds.length };
}

/** Load optional manual CSV of PUC centres (name,lat,lng,address). */
export async function seedManualProviders(
  runId: string,
  rng:   SeededRng,
  existingCount: number,
  dryRun: boolean
): Promise<ProviderSeedResult> {
  const CSV = path.join(__dirname, '../data/puc_centres_manual.csv');
  if (!fs.existsSync(CSV)) return { providerIds: [], providerUserIds: [], providerCount: 0 };

  const { SEED_STATE, SEED_AREA_NAME } = SEED_CONFIG;
  const lines = fs.readFileSync(CSV, 'utf8').split('\n').slice(1); // skip header

  const rows = lines
    .map((l) => l.trim().split(','))
    .filter((cols) => cols.length >= 3 && cols[0]);

  console.log(`[Manual] Found ${rows.length} rows in puc_centres_manual.csv`);

  if (dryRun) {
    console.log(`[DRY-RUN] Would create ${rows.length} manual provider users + providers`);
    return { providerIds: [], providerUserIds: [], providerCount: rows.length };
  }

  const passwordHash = await bcrypt.hash(SEED_CONFIG.SEED_DEMO_PASSWORD, 10);
  const providerIds: mongoose.Types.ObjectId[]     = [];
  const providerUserIds: mongoose.Types.ObjectId[] = [];

  for (let i = 0; i < rows.length; i++) {
    const [name, latStr, lngStr, addr] = rows[i];
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) continue;

    const idx   = existingCount + i + 1;
    const phone = `900000${String(idx).padStart(4, '0')}`;
    const email = `provider${String(idx).padStart(2, '0')}@demo.drivedock.test`;

    const user = await User.create({
      name:        `${name.trim()} Staff`,
      email,
      phone,
      passwordHash,
      role:        'provider',
      address:     { city: SEED_AREA_NAME, state: SEED_STATE, pincode: '000000' },
    });

    const provider = await Provider.create({
      userId:       user._id,
      businessName: name.trim(),
      serviceTypes: ['puc'],
      location:     { type: 'Point', coordinates: [lng, lat] },
      address:      addr?.trim() || `${name.trim()}, ${SEED_AREA_NAME}`,
      workingHours: '09:00 AM - 06:00 PM',
      rating:       Number((rng.nextInt(40, 50) / 10).toFixed(1)),
      status:       'approved',
    });

    providerUserIds.push(user._id as mongoose.Types.ObjectId);
    providerIds.push(provider._id as mongoose.Types.ObjectId);
  }

  await registerMany(runId, 'users', providerUserIds);
  await registerMany(runId, 'providers', providerIds);

  console.log(`[Manual] Created ${providerIds.length} manual providers`);
  return { providerIds, providerUserIds, providerCount: providerIds.length };
}

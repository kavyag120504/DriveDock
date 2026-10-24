/**
 * Imports VAHAN aggregate registration counts from a manually downloaded CSV.
 * Inserts into the regionBaselines collection (new, never touches existing schemas).
 *
 * Data source: VAHAN open data — India Data Portal (data.gov.in).
 * Only aggregate counts are stored; no individual vehicle or owner data.
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import { RegionBaseline } from '../models/RegionBaseline';
import { SEED_CONFIG, getRtosForState } from '../config';
import { registerMany } from '../lib/registry';

const CSV_FILE = path.join(__dirname, '../data/vahan_registrations.csv');

type Row = Record<string, string>;

// Keywords used to detect column purposes (case-insensitive partial match)
const COL_HINTS = {
  state:         ['state', 'statename', 'state_name', 'st'],
  rto:           ['rto', 'district', 'office', 'district_name', 'rto_name'],
  vehicleClass:  ['class', 'category', 'veh_class', 'vehicle_class', 'type'],
  fuel:          ['fuel', 'fueltype', 'fuel_type', 'energy'],
  registrations: ['registrations', 'count', 'no_of', 'noof', 'total', 'vehicles', 'num'],
  year:          ['year', 'yr'],
  month:         ['month', 'mon', 'mm'],
  date:          ['date', 'reg_date', 'month_year', 'period'],
};

function detectColumn(headers: string[], hints: string[]): string | null {
  for (const h of headers) {
    const lc = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const hint of hints) {
      if (lc.includes(hint.replace(/[^a-z0-9]/g, ''))) return h;
    }
  }
  return null;
}

function parseDate(row: Row, yearCol: string | null, monthCol: string | null, dateCol: string | null): Date | null {
  if (dateCol && row[dateCol]) {
    const v = row[dateCol].trim();
    // Try ISO
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    // Try MM/YYYY
    const mmyyyy = v.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (mmyyyy) return new Date(parseInt(mmyyyy[2]), parseInt(mmyyyy[1]) - 1, 1);
    // Try YYYY-MM
    const yyyymm = v.match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (yyyymm) return new Date(parseInt(yyyymm[1]), parseInt(yyyymm[2]) - 1, 1);
  }
  if (yearCol && monthCol && row[yearCol] && row[monthCol]) {
    const y = parseInt(row[yearCol]);
    const m = parseInt(row[monthCol]);
    if (!isNaN(y) && !isNaN(m)) return new Date(y, m - 1, 1);
  }
  if (yearCol && row[yearCol]) {
    const y = parseInt(row[yearCol]);
    if (!isNaN(y)) return new Date(y, 0, 1);
  }
  return null;
}

export interface VahanResult {
  insertedCount: number;
  vehicleCountPerRTO: Map<string, { district: string; count: number }>;
}

export async function seedVahanBaselines(runId: string, dryRun: boolean): Promise<VahanResult> {
  const { SEED_STATE, SEED_VEHICLE_COUNT } = SEED_CONFIG;
  const fallbackRTOs = getRtosForState(SEED_STATE);

  if (!fs.existsSync(CSV_FILE)) {
    console.log('[VAHAN] No CSV found at', CSV_FILE);
    console.log('[VAHAN] Skipping baseline import; vehicles will be distributed uniformly across known RTOs.');
    const uniform = Math.max(1, Math.floor(SEED_VEHICLE_COUNT / fallbackRTOs.length));
    const map = new Map<string, { district: string; count: number }>();
    for (const rto of fallbackRTOs) map.set(rto.code, { district: rto.district, count: uniform });
    return { insertedCount: 0, vehicleCountPerRTO: map };
  }

  const content = fs.readFileSync(CSV_FILE, 'utf8');
  const rows: Row[] = parse(content, { columns: true, skip_empty_lines: true, trim: true });

  if (rows.length === 0) {
    console.warn('[VAHAN] CSV is empty. Falling back to uniform distribution.');
    const uniform = Math.max(1, Math.floor(SEED_VEHICLE_COUNT / fallbackRTOs.length));
    const map = new Map<string, { district: string; count: number }>();
    for (const rto of fallbackRTOs) map.set(rto.code, { district: rto.district, count: uniform });
    return { insertedCount: 0, vehicleCountPerRTO: map };
  }

  const headers = Object.keys(rows[0]);
  const stateCol  = detectColumn(headers, COL_HINTS.state);
  const rtoCol    = detectColumn(headers, COL_HINTS.rto);
  const classCol  = detectColumn(headers, COL_HINTS.vehicleClass);
  const fuelCol   = detectColumn(headers, COL_HINTS.fuel);
  const regCol    = detectColumn(headers, COL_HINTS.registrations);
  const yearCol   = detectColumn(headers, COL_HINTS.year);
  const monthCol  = detectColumn(headers, COL_HINTS.month);
  const dateCol   = detectColumn(headers, COL_HINTS.date);

  console.log('[VAHAN] Detected column mapping:');
  console.log(`  state         → ${stateCol ?? '(not found)'}`);
  console.log(`  rto/district  → ${rtoCol   ?? '(not found)'}`);
  console.log(`  vehicle class → ${classCol ?? '(not found)'}`);
  console.log(`  fuel          → ${fuelCol  ?? '(not found)'}`);
  console.log(`  registrations → ${regCol   ?? '(not found)'}`);
  console.log(`  date/year     → ${dateCol ?? yearCol ?? '(not found)'}`);

  const missing: string[] = [];
  if (!stateCol) missing.push('state');
  if (!rtoCol)   missing.push('rto/district');
  if (!regCol)   missing.push('registrations/count');
  if (missing.length > 0) {
    console.error('[VAHAN] Required columns not found:', missing.join(', '));
    console.error('[VAHAN] CSV headers found:', headers.join(', '));
    process.exit(1);
  }

  // Filter to SEED_STATE (case-insensitive)
  const stateRows = rows.filter((r) =>
    (r[stateCol!] || '').toLowerCase().includes(SEED_STATE.toLowerCase())
  );
  console.log(`[VAHAN] Rows matching state "${SEED_STATE}": ${stateRows.length}`);

  if (stateRows.length === 0) {
    console.warn('[VAHAN] No rows match the state filter. Unique state values seen:',
      [...new Set(rows.map((r) => r[stateCol!]))].slice(0, 10).join(', '));
    const uniform = Math.max(1, Math.floor(SEED_VEHICLE_COUNT / fallbackRTOs.length));
    const map = new Map<string, { district: string; count: number }>();
    for (const rto of fallbackRTOs) map.set(rto.code, { district: rto.district, count: uniform });
    return { insertedCount: 0, vehicleCountPerRTO: map };
  }

  // Find the latest date in the data, keep 12 months back
  const dates = stateRows
    .map((r) => parseDate(r, yearCol, monthCol, dateCol))
    .filter((d): d is Date => d !== null);

  const latestDate = dates.length > 0
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : new Date();
  const cutoff = new Date(latestDate.getTime() - 12 * 31 * 24 * 3600 * 1000);

  const recentRows = dates.length > 0
    ? stateRows.filter((_, i) => dates[i] && dates[i]! >= cutoff)
    : stateRows;
  console.log(`[VAHAN] Rows in latest 12 months: ${recentRows.length}`);

  // Aggregate by RTO + fuelType
  type AggKey = string; // rto|fuel|class
  const agg = new Map<AggKey, { rto: string; fuel: string; cls: string; total: number }>();

  for (const r of recentRows) {
    const rto  = (r[rtoCol!]  || 'Unknown').trim();
    const fuel = (fuelCol ? (r[fuelCol] || 'Unknown') : 'Unknown').trim();
    const cls  = (classCol ? (r[classCol] || 'Unknown') : 'Unknown').trim();
    const cnt  = parseInt(r[regCol!] || '0') || 0;
    const key  = `${rto}|${fuel}|${cls}`;
    const existing = agg.get(key);
    if (existing) existing.total += cnt;
    else agg.set(key, { rto, fuel, cls, total: cnt });
  }

  // Build regionBaseline docs
  const periodFrom = cutoff;
  const periodTo   = latestDate;
  const docs = [...agg.values()].map(({ rto, fuel, cls, total }) => ({
    state:         SEED_STATE,
    rto,
    fuelType:      fuel,
    vehicleClass:  cls,
    registrations: total,
    periodFrom,
    periodTo,
    source: 'VAHAN open data (India Data Portal)',
  }));

  if (dryRun) {
    console.log(`[DRY-RUN] Would insert ${docs.length} regionBaseline records`);
  } else {
    const inserted = await RegionBaseline.insertMany(docs);
    await registerMany(runId, 'regionbaselines', inserted.map((d) => d._id as mongoose.Types.ObjectId));
    console.log(`[VAHAN] Inserted ${inserted.length} regionBaseline records`);
  }

  // Build vehicle-count-per-RTO (proportional, scaled to SEED_VEHICLE_COUNT, min 1)
  const rtoTotals = new Map<string, number>();
  for (const { rto, total } of agg.values()) {
    rtoTotals.set(rto, (rtoTotals.get(rto) || 0) + total);
  }

  const grandTotal = [...rtoTotals.values()].reduce((a, b) => a + b, 0);
  const vehicleCountPerRTO = new Map<string, { district: string; count: number }>();

  let assigned = 0;
  for (const [rto, total] of rtoTotals.entries()) {
    const raw   = Math.max(1, Math.round((total / grandTotal) * SEED_VEHICLE_COUNT));
    const count = Math.min(raw, SEED_VEHICLE_COUNT - assigned - (rtoTotals.size - vehicleCountPerRTO.size - 1));
    vehicleCountPerRTO.set(rto, { district: rto, count: Math.max(1, count) });
    assigned += count;
  }

  return { insertedCount: docs.length, vehicleCountPerRTO };
}

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const SEED_CONFIG = {
  MONGO_URI:           process.env.MONGO_URI           || 'mongodb://127.0.0.1:27017/drivedock',
  NODE_ENV:            process.env.NODE_ENV             || 'development',
  SEED_STATE:          process.env.SEED_STATE           || 'Maharashtra',
  SEED_AREA_NAME:      process.env.SEED_AREA_NAME       || 'Mumbai',
  SEED_PROVIDER_COUNT: parseInt(process.env.SEED_PROVIDER_COUNT || '30', 10),
  SEED_VEHICLE_COUNT:  parseInt(process.env.SEED_VEHICLE_COUNT  || '80', 10),
  SEED_DEMO_PASSWORD:  process.env.SEED_DEMO_PASSWORD   || 'Demo@12345',
  SEED_RANDOM:         parseInt(process.env.SEED_RANDOM || '42', 10),
};

// RTOs per state — used when VAHAN CSV is absent
export const STATE_RTO_MAP: Record<string, Array<{ code: string; district: string }>> = {
  Maharashtra: [
    { code: 'MH01', district: 'Mumbai' },
    { code: 'MH02', district: 'Mumbai Suburban' },
    { code: 'MH03', district: 'Mumbai Eastern' },
    { code: 'MH04', district: 'Thane' },
    { code: 'MH05', district: 'Raigad' },
    { code: 'MH12', district: 'Pune' },
    { code: 'MH14', district: 'Aurangabad' },
    { code: 'MH20', district: 'Nashik' },
    { code: 'MH43', district: 'Pimpri-Chinchwad' },
  ],
  Delhi: [
    { code: 'DL01', district: 'Central Delhi' },
    { code: 'DL02', district: 'North Delhi' },
    { code: 'DL03', district: 'South Delhi' },
    { code: 'DL04', district: 'West Delhi' },
    { code: 'DL05', district: 'East Delhi' },
    { code: 'DL09', district: 'South West Delhi' },
    { code: 'DL10', district: 'North East Delhi' },
    { code: 'DL12', district: 'New Delhi' },
  ],
  Karnataka: [
    { code: 'KA01', district: 'Bengaluru Central' },
    { code: 'KA02', district: 'Bengaluru Urban' },
    { code: 'KA03', district: 'Bengaluru Rural' },
    { code: 'KA04', district: 'Mysuru' },
    { code: 'KA05', district: 'Tumkur' },
    { code: 'KA10', district: 'Hubli-Dharwad' },
    { code: 'KA14', district: 'Belagavi' },
    { code: 'KA19', district: 'Mangaluru' },
    { code: 'KA41', district: 'Bengaluru South' },
  ],
  'Tamil Nadu': [
    { code: 'TN01', district: 'Chennai Central' },
    { code: 'TN02', district: 'Chennai North' },
    { code: 'TN03', district: 'Chennai West' },
    { code: 'TN04', district: 'Chennai South' },
    { code: 'TN09', district: 'Coimbatore' },
    { code: 'TN18', district: 'Madurai' },
    { code: 'TN37', district: 'Salem' },
    { code: 'TN38', district: 'Tiruchirappalli' },
  ],
  Haryana: [
    { code: 'HR10', district: 'Faridabad' },
    { code: 'HR26', district: 'Gurugram' },
    { code: 'HR17', district: 'Sonipat' },
    { code: 'HR13', district: 'Rohtak' },
    { code: 'HR01', district: 'Ambala' },
    { code: 'HR20', district: 'Hisar' },
    { code: 'HR34', district: 'Panchkula' },
  ],
  'Uttar Pradesh': [
    { code: 'UP14', district: 'Noida' },
    { code: 'UP15', district: 'Ghaziabad' },
    { code: 'UP78', district: 'Lucknow' },
    { code: 'UP70', district: 'Agra' },
    { code: 'UP65', district: 'Varanasi' },
    { code: 'UP32', district: 'Kanpur' },
    { code: 'UP17', district: 'Meerut' },
  ],
};

export function getRtosForState(state: string): Array<{ code: string; district: string }> {
  const key = Object.keys(STATE_RTO_MAP).find(
    (k) => k.toLowerCase() === state.toLowerCase()
  );
  return key ? STATE_RTO_MAP[key] : STATE_RTO_MAP['Maharashtra'];
}

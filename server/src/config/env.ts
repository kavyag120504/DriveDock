import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || '5000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/drivedock',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'drivedock_jwt_access_secret_super_secure_key_2026',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'drivedock_jwt_refresh_secret_super_secure_key_2026',
  QR_SECRET: process.env.QR_SECRET || 'drivedock_rotating_qr_compliance_secret_key_2026',
  INTERNAL_JOB_SECRET: process.env.INTERNAL_JOB_SECRET || 'drivedock_internal_cron_job_secure_secret_2026',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'drivedock-documents',
  AWS_REGION: process.env.AWS_REGION || 'ap-south-1',
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_DriveDockDev2026',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_DriveDockDev2026',
  EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || ''
};

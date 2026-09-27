import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { ENV } from './config/env';
import { connectDB } from './config/db';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initCronJobs } from './cron/reminderCron';

const app = express();

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve local uploads statically
app.use('/uploads', express.static(uploadsDir));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    app: 'DriveDock API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount API v1
app.use('/api/v1', apiRoutes);

// Error Handler
app.use(errorHandler);

// Start server
const start = async () => {
  try {
    await connectDB();
    initCronJobs();

    const PORT = parseInt(ENV.PORT, 10) || 5000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🚀 DriveDock Server running on http://localhost:${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`🛡️  Base API: http://localhost:${PORT}/api/v1`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();

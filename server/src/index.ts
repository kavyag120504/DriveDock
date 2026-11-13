import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import type { Server } from 'http';
import type { ScheduledTask } from 'node-cron';
import { ENV, validateProductionSecrets } from './config/env';
import { connectDB } from './config/db';
import { logger, httpLogger } from './config/logger';
import { assertProductionReady } from './providers';
import { securityHeaders, corsMiddleware, sanitizeRequest } from './middleware/security';
import apiRoutes from './routes';
import { razorpayWebhook } from './controllers/paymentController';
import { errorHandler } from './middleware/errorHandler';
import { initCronJobs } from './cron/reminderCron';
import { assertPaperworkKeyring } from './services/fieldCrypto';

const app = express();

// Only trust X-Forwarded-For from the configured number of proxy hops; req.ip is then the real client IP
app.set('trust proxy', ENV.TRUST_PROXY);

// Ensure uploads folder exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Security headers (helmet) before anything else so every response carries them.
app.use(securityHeaders);

// Structured request logging + correlation id (before routes so every request is traced)
app.use(httpLogger);

// Middleware
app.use(corsMiddleware);

// Razorpay webhook: mounted BEFORE the JSON body parser so the handler receives the
// RAW bytes it must hash to verify the signature. Server-to-server, so no auth and no
// JSON/sanitiser middleware runs for it (those are added after this route).
app.post(
  '/api/v1/payments/webhook',
  express.raw({ type: '*/*', limit: ENV.REQUEST_BODY_LIMIT }),
  razorpayWebhook
);

// Explicit body size limits (a body over the limit returns 413). The default matches
// Express's built-in 100kb, so behaviour is unchanged unless REQUEST_BODY_LIMIT is set.
app.use(express.json({ limit: ENV.REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: ENV.REQUEST_BODY_LIMIT }));

// Strip MongoDB-operator / prototype-pollution keys from every parsed request.
app.use(sanitizeRequest);

// Serve local uploads statically
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

// Liveness: the process is up. Must never touch the database.
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: the process can serve traffic (DB connected). Used by orchestrators/LBs.
app.get('/readyz', (_req: Request, res: Response) => {
  const ready = mongoose.connection.readyState === 1; // 1 = connected
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', db: mongoose.connection.readyState });
});

// Backwards-compatible health check (kept for existing clients/docs)
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

export { app };

let server: Server | undefined;
let cronTasks: ScheduledTask[] = [];
let shuttingDown = false;

/** Stop accepting connections, stop cron, close the DB, then exit. Idempotent. */
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[DriveDock] ${signal} received — shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error('[DriveDock] Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    cronTasks.forEach((t) => t.stop());
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    await mongoose.connection.close(false);
    clearTimeout(forceExit);
    console.log('[DriveDock] Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('[DriveDock] Error during shutdown:', err);
    process.exit(1);
  }
};

// Start server
const start = async () => {
  try {
    // Refuse to start in production with missing or default security secrets,
    // with a missing/invalid paperwork encryption keyring, or with any external
    // adapter still running on a sandbox/mock implementation.
    validateProductionSecrets();
    assertPaperworkKeyring();
    assertProductionReady();

    await connectDB();
    cronTasks = initCronJobs();

    const PORT = parseInt(ENV.PORT, 10) || 5000;
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`DriveDock Server running on http://localhost:${PORT}`);
      console.log(`Health Check: http://localhost:${PORT}/api/health`);
      console.log(`Liveness: /healthz   Readiness: /readyz`);
      console.log(`Base API: http://localhost:${PORT}/api/v1`);
      console.log(`====================================================`);
    });

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Only auto-start when run directly (not when imported by tests/tools).
if (require.main === module) {
  start();
}

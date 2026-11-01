import { randomUUID } from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { ENV } from './env';

/**
 * Structured JSON logging (pino) with per-request correlation IDs and personal-data
 * redaction. In test the logger is silent so suites stay clean; in production it
 * emits JSON at info level for log aggregation.
 */
const level = ENV.NODE_ENV === 'test' ? 'silent' : ENV.NODE_ENV === 'production' ? 'info' : 'debug';

export const logger = pino({
  level,
  base: { service: 'drivedock-api' },
  // Never write these to logs even if an object carrying them is logged.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      'req.body.razorpaySignature',
      'req.body.chassisLast5',
      'phone',
      'email',
      '*.phone',
      '*.email',
      '*.passwordHash'
    ],
    censor: '[redacted]'
  }
});

/**
 * Express middleware: logs every request/response with a request id. The id comes
 * from an inbound X-Request-Id header (set by a proxy) or is generated, and is
 * echoed back on the response so clients and logs can be correlated.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const inbound = req.headers['x-request-id'];
    const id = (Array.isArray(inbound) ? inbound[0] : inbound) || randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health probes fire constantly; don't drown the logs with them.
  autoLogging: {
    ignore: (req) => req.url === '/healthz' || req.url === '/readyz'
  }
});

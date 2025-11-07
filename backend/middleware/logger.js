/**
 * Request logging middleware
 */
import logger from '../utils/logger.js'

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // Log request
  const redactedBody = req.method !== 'GET' ? (() => {
    try {
      const clone = { ...(req.body || {}) };
      // Redact sensitive fields if present
      ['password', 'password_encrypted', 'token', 'access_token', 'authorization']
        .forEach((k) => { if (k in clone) clone[k] = '[REDACTED]'; });
      return clone;
    } catch {
      return undefined;
    }
  })() : undefined;

  const headers = { ...(req.headers || {}) };
  if (headers.authorization) headers.authorization = '[REDACTED]';

  logger.info(`${req.method} ${req.path}`, { ip: req.ip, userAgent: req.get('user-agent'), body: redactedBody, headers })

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('response', { method: req.method, path: req.path, status: res.statusCode, durationMs: duration })
  });

  next();
};


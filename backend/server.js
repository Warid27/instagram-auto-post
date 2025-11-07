import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { requestLogger } from './middleware/logger.js';
import logger from './utils/logger.js';
import accountsRouter from './routes/accounts.js';
import postsRouter from './routes/posts.js';
import queueRouter from './routes/queue.js';
import uploadRouter from './routes/upload.js';
import botRouter from './routes/bot.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));
app.use(helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "img-src": ["'self'", 'data:', 'blob:', 'https:', 'http:'],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "connect-src": ["'self'", process.env.SUPABASE_URL || 'https://*.supabase.co'],
    "frame-ancestors": ["'none'"],
  }
}));
app.use(helmet.frameguard({ action: 'deny' }));
app.use(helmet.noSniff());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Request logging middleware
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing + cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'change-me'));

// CSRF protection for state-changing operations
const csrfProtection = csrf({ cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' } });
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  // Send token in JSON so SPA can attach it as header 'x-csrf-token'
  res.json({ csrfToken: req.csrfToken ? req.csrfToken() : '' });
});

// Apply CSRF to state-changing requests
app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  return csrfProtection(req, res, next);
});

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Instagram Automation API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      accounts: '/api/accounts',
      posts: '/api/posts',
      queue: '/api/queue',
      upload: '/api/upload',
      bot: {
        status: '/api/bot/status',
        logs: '/api/bot/logs',
      },
    },
  });
});

// API routes
app.use('/api/accounts', accountsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/queue', queueRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/bot', botRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: true,
    code: 'NOT_FOUND',
    message: `The requested route ${req.method} ${req.path} does not exist`,
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  logger.error('Request error', { error: err.message, stack: err.stack, path: req.path, method: req.method });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: true, code: 'BAD_REQUEST', message: err.message });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: true, code: 'UNAUTHORIZED', message: err.message || 'Invalid authentication' });
  }

  // Default error response
  const status = err.status || 500
  const code = status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 500 ? 'SERVER_ERROR' : 'ERROR'
  res.status(status).json({ error: true, code, message: err.message || 'Internal server error' });
});

if (process.env.JEST_WORKER_ID === undefined) {
  app.listen(PORT, () => {
    logger.info(`Backend server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;


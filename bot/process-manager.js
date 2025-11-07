import dotenv from 'dotenv';
import cron from 'node-cron';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { runBot } from './instagram-bot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuration
const CONFIG = {
  cronSchedule: process.env.CRON_SCHEDULE || '*/5 * * * *', // Every 5 minutes
  maxConcurrentAccounts: parseInt(process.env.MAX_CONCURRENT_ACCOUNTS || '1', 10),
  retryFailedAfterHours: parseInt(process.env.RETRY_FAILED_AFTER_HOURS || '2', 10),
  healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT || '3002', 10),
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '7', 10),
};

// Status tracking (in-memory, can be persisted to DB)
const status = {
  isRunning: false,
  lastRun: null,
  nextRun: null,
  currentTask: null,
  todayStats: {
    postsProcessed: 0,
    postsSuccessful: 0,
    postsFailed: 0,
    successRate: 0,
  },
  consecutiveFailures: 0,
  lastError: null,
  lastHealthCheck: null,
};

// Activity logs (in-memory, also persisted to file)
const activityLogs = [];
const MAX_IN_MEMORY_LOGS = 1000;

// Logs directory
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Logging function
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...meta,
  };

  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}`;

  // Console output
  if (level === 'error') {
    console.error(logLine);
  } else if (level === 'warn') {
    console.warn(logLine);
  } else {
    console.log(logLine);
  }

  // In-memory logs
  activityLogs.push(logEntry);
  if (activityLogs.length > MAX_IN_MEMORY_LOGS) {
    activityLogs.shift();
  }

  // File logging
  try {
    const logFile = path.join(LOGS_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logLine + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

// Lock mechanism to prevent overlapping runs
let isLocked = false;
let lockAcquiredAt = null;
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes max lock time

function acquireLock() {
  if (isLocked) {
    // Check if lock is stale (older than timeout)
    if (lockAcquiredAt && Date.now() - lockAcquiredAt > LOCK_TIMEOUT_MS) {
      log('warn', 'Stale lock detected, releasing', { lockAge: Date.now() - lockAcquiredAt });
      isLocked = false;
      lockAcquiredAt = null;
    } else {
      return false;
    }
  }
  isLocked = true;
  lockAcquiredAt = Date.now();
  return true;
}

function releaseLock() {
  isLocked = false;
  lockAcquiredAt = null;
}

// Update status
function updateStatus(updates) {
  Object.assign(status, updates);
  status.lastHealthCheck = new Date().toISOString();
}

// Calculate next run time from cron schedule
function calculateNextRun(cronSchedule) {
  try {
    // Parse cron expression to get next run
    // This is a simplified version - in production, use a library like node-cron's schedule
    const parts = cronSchedule.split(' ');
    if (parts.length >= 5) {
      // For '*/5 * * * *' format, calculate next 5-minute interval
      if (parts[0].startsWith('*/')) {
        const interval = parseInt(parts[0].substring(2));
        const now = new Date();
        const minutes = now.getMinutes();
        const nextMinutes = Math.ceil(minutes / interval) * interval;
        const nextRun = new Date(now);
        nextRun.setMinutes(nextMinutes);
        nextRun.setSeconds(0);
        nextRun.setMilliseconds(0);
        if (nextMinutes >= 60) {
          nextRun.setHours(nextRun.getHours() + 1);
          nextRun.setMinutes(0);
        }
        return nextRun.toISOString();
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Main bot execution with lock
async function executeBot() {
  if (!acquireLock()) {
    log('warn', 'Bot is already running, skipping this cycle');
    return;
  }

  const runStartTime = Date.now();
  updateStatus({
    isRunning: true,
    lastRun: new Date().toISOString(),
    currentTask: 'Starting bot cycle',
  });

  log('info', '🤖 Bot cycle started', { runId: runStartTime });

  try {
    status.currentTask = 'Executing bot run';
    updateStatus(status);

    // Execute the actual bot run
    await runBot();

    // Update stats on success
    status.todayStats.postsProcessed += 1;
    status.todayStats.postsSuccessful += 1;
    status.consecutiveFailures = 0;
    status.lastError = null;

    const runDuration = Date.now() - runStartTime;
    log('info', '✅ Bot cycle completed successfully', { duration: runDuration });

  } catch (error) {
    // Update stats on failure
    status.todayStats.postsProcessed += 1;
    status.todayStats.postsFailed += 1;
    status.consecutiveFailures += 1;
    status.lastError = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };

    const runDuration = Date.now() - runStartTime;
    log('error', '❌ Bot cycle failed', {
      error: error.message,
      duration: runDuration,
      consecutiveFailures: status.consecutiveFailures,
    });

    // Alert on repeated failures
    if (status.consecutiveFailures >= 3) {
      log('error', '🚨 ALERT: Multiple consecutive failures detected', {
        consecutiveFailures: status.consecutiveFailures,
        lastError: status.lastError,
      });
    }
  } finally {
    // Calculate success rate
    const { postsProcessed, postsSuccessful } = status.todayStats;
    if (postsProcessed > 0) {
      status.todayStats.successRate = (postsSuccessful / postsProcessed) * 100;
    }

    // Update next run time
    status.nextRun = calculateNextRun(CONFIG.cronSchedule);

    updateStatus({
      isRunning: false,
      currentTask: null,
    });

    releaseLock();
  }
}

// Health check endpoint
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  const now = Date.now();
  const lastRunMs = status.lastRun ? now - new Date(status.lastRun).getTime() : null;
  const lastRunMinutesAgo = lastRunMs ? Math.floor(lastRunMs / 60000) : null;

  // Check if bot hasn't run in 15 minutes
  const isStale = lastRunMinutesAgo !== null && lastRunMinutesAgo > 15;

  res.json({
    status: isStale ? 'stale' : status.isRunning ? 'running' : 'idle',
    isRunning: status.isRunning,
    lastRun: status.lastRun,
    nextRun: status.nextRun,
    currentTask: status.currentTask,
    todayStats: {
      ...status.todayStats,
      successRate: Number(status.todayStats.successRate.toFixed(2)),
    },
    consecutiveFailures: status.consecutiveFailures,
    lastError: status.lastError,
    lastHealthCheck: status.lastHealthCheck,
    uptime: process.uptime(),
    config: {
      cronSchedule: CONFIG.cronSchedule,
      maxConcurrentAccounts: CONFIG.maxConcurrentAccounts,
      retryFailedAfterHours: CONFIG.retryFailedAfterHours,
    },
    alerts: {
      stale: isStale,
      multipleFailures: status.consecutiveFailures >= 3,
    },
  });
});

app.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const level = req.query.level; // Optional filter by level

  let logs = [...activityLogs].reverse(); // Most recent first

  if (level) {
    logs = logs.filter(log => log.level === level.toUpperCase());
  }

  logs = logs.slice(0, limit);

  res.json({
    logs,
    total: activityLogs.length,
    returned: logs.length,
  });
});

app.get('/status', (req, res) => {
  res.json(status);
});

// Start HTTP server
app.listen(CONFIG.healthCheckPort, () => {
  log('info', `🏥 Health check server running on port ${CONFIG.healthCheckPort}`, {
    endpoints: ['/health', '/logs', '/status'],
  });
});

// Setup cron job
let cronJob = null;

function setupCron() {
  if (cronJob) {
    cronJob.stop();
  }

  log('info', `⏰ Scheduling bot with cron: ${CONFIG.cronSchedule}`);

  cronJob = cron.schedule(CONFIG.cronSchedule, () => {
    executeBot();
  }, {
    scheduled: true,
    timezone: 'UTC',
  });

  // Calculate initial next run time
  status.nextRun = calculateNextRun(CONFIG.cronSchedule);
}

// Graceful restart handling
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  log('info', `🛑 Received ${signal}, shutting down gracefully...`);

  // Stop cron
  if (cronJob) {
    cronJob.stop();
    log('info', 'Cron job stopped');
  }

  // Wait for current run to finish (with timeout)
  if (status.isRunning) {
    log('info', 'Waiting for current bot run to complete...');
    const maxWait = 60000; // 60 seconds
    const startWait = Date.now();

    while (status.isRunning && Date.now() - startWait < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (status.isRunning) {
      log('warn', 'Bot run did not complete within timeout, forcing shutdown');
    }
  }

  // Save current status (could persist to DB)
  log('info', 'Shutdown complete');

  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Resume from checkpoint on startup
async function resumeFromCheckpoint() {
  try {
    // Check for posts stuck in 'processing' status (likely from previous crash)
    const { data: stuckPosts, error } = await supabase
      .from('posts')
      .select('id, updated_at')
      .eq('status', 'processing');

    if (error) {
      log('warn', 'Failed to check for stuck posts', { error: error.message });
      return;
    }

    if (stuckPosts && stuckPosts.length > 0) {
      log('info', `Found ${stuckPosts.length} posts stuck in processing status`);

      // Reset posts that have been processing for more than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const toReset = stuckPosts.filter(post => 
        new Date(post.updated_at) < new Date(oneHourAgo)
      );

      if (toReset.length > 0) {
        const ids = toReset.map(p => p.id);
        await supabase
          .from('posts')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .in('id', ids);

        log('info', `Reset ${toReset.length} stuck posts back to pending`);
      }
    }

    // Check for failed posts that should be retried
    const retryAfter = new Date(Date.now() - CONFIG.retryFailedAfterHours * 60 * 60 * 1000).toISOString();
    const { data: failedPosts } = await supabase
      .from('posts')
      .select('id')
      .eq('status', 'failed')
      .lt('updated_at', retryAfter)
      .limit(10);

    if (failedPosts && failedPosts.length > 0) {
      await supabase
        .from('posts')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .in('id', failedPosts.map(p => p.id));

      log('info', `Reset ${failedPosts.length} failed posts back to pending for retry`);
    }
  } catch (error) {
    log('error', 'Error during checkpoint resume', { error: error.message });
  }
}

// Monitoring: Check for stale runs
setInterval(() => {
  if (status.lastRun) {
    const minutesSinceLastRun = (Date.now() - new Date(status.lastRun).getTime()) / 60000;
    if (minutesSinceLastRun > 15 && !status.isRunning) {
      log('warn', '🚨 ALERT: Bot has not run in over 15 minutes', {
        minutesSinceLastRun: Math.floor(minutesSinceLastRun),
      });
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Initialize
log('info', '🚀 Instagram automation bot process manager started', {
  config: CONFIG,
  pid: process.pid,
});

// Resume from checkpoint
resumeFromCheckpoint().then(() => {
  // Setup cron
  setupCron();

  // Run initial cycle (optional)
  if (process.env.RUN_ON_STARTUP !== 'false') {
    log('info', 'Running initial bot cycle...');
    setTimeout(() => executeBot(), 5000); // Wait 5 seconds for startup
  }
});

// Export for testing
export { executeBot, status, CONFIG };

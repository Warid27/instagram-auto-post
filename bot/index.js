import dotenv from 'dotenv';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import processManager from './process-manager.js';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Bot configuration
const config = {
  cronSchedule: process.env.CRON_SCHEDULE || '*/5 * * * *', // Every 5 minutes by default
  headless: process.env.HEADLESS === 'true',
  maxPostsPerHour: parseInt(process.env.MAX_POSTS_PER_HOUR) || 5,
  maxPostsPerDay: parseInt(process.env.MAX_POSTS_PER_DAY) || 25,
  minDelayBetweenPosts: parseInt(process.env.MIN_DELAY_BETWEEN_POSTS_MS) || 120000, // 2 minutes
  maxDelayBetweenPosts: parseInt(process.env.MAX_DELAY_BETWEEN_POSTS_MS) || 300000, // 5 minutes
  pageLoadTimeout: parseInt(process.env.PAGE_LOAD_TIMEOUT) || 30000,
  logLevel: process.env.LOG_LEVEL || 'info',
  takeScreenshotsOnError: process.env.TAKE_SCREENSHOTS_ON_ERROR === 'true',
};

// Initialize process manager
const manager = new processManager(config);

// Logging utility
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data);
  } else if (level === 'warn') {
    console.warn(logMessage, data);
  } else {
    console.log(logMessage, data);
  }
}

// Main bot execution function
async function runBot() {
  log('info', '🤖 Starting Instagram automation bot cycle');
  
  try {
    // Check if bot should run based on rate limits
    const canRun = await manager.checkRateLimits();
    if (!canRun) {
      log('warn', '⏸️ Rate limit reached, skipping this cycle');
      return;
    }

    // Get pending posts from database
    log('info', '📥 Fetching pending posts from database');
    const { data: pendingPosts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!pendingPosts || pendingPosts.length === 0) {
      log('info', '✅ No pending posts to process');
      return;
    }

    const post = pendingPosts[0];
    log('info', `📤 Processing post: ${post.id}`, { postId: post.id });

    // Process the post
    await manager.processPost(post);

    log('info', '✅ Bot cycle completed successfully');
  } catch (error) {
    log('error', '❌ Error in bot cycle', { error: error.message, stack: error.stack });
    
    if (config.takeScreenshotsOnError) {
      await manager.takeErrorScreenshot(error);
    }
  }
}

// Health check server (optional)
if (process.env.HEALTH_CHECK_PORT) {
  import('express').then(({ default: express }) => {
    const healthApp = express();
    const healthPort = parseInt(process.env.HEALTH_CHECK_PORT);

    healthApp.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    healthApp.listen(healthPort, () => {
      log('info', `🏥 Health check server running on port ${healthPort}`);
    });
  });
}

// Start cron job
log('info', `⏰ Scheduling bot with cron: ${config.cronSchedule}`);
cron.schedule(config.cronSchedule, () => {
  runBot();
});

// Run immediately on startup (optional)
log('info', '🚀 Instagram automation bot started');
log('info', 'Running initial cycle...');
runBot();

// Graceful shutdown
process.on('SIGINT', async () => {
  log('info', '🛑 Shutting down bot gracefully...');
  await manager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('info', '🛑 Shutting down bot gracefully...');
  await manager.cleanup();
  process.exit(0);
});

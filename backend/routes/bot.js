import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { authenticateUser } from '../middleware/auth.js';

dotenv.config();

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/bot/status - Get bot status and statistics
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get today's posts for statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', today.toISOString());

    if (postsError) {
      console.error('Supabase error:', postsError);
      return res.status(500).json({
        error: 'Failed to fetch bot status',
        message: postsError.message
      });
    }

    // Calculate statistics
    const completed = posts.filter(p => p.status === 'completed').length;
    const failed = posts.filter(p => p.status === 'failed').length;
    const processing = posts.filter(p => p.status === 'processing').length;
    const total = posts.length;
    const successRate = total > 0 ? (completed / total) * 100 : 0;

    // Get processing post for current task
    const { data: processingPost } = await supabase
      .from('posts')
      .select('id, caption')
      .eq('user_id', userId)
      .eq('status', 'processing')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    // Determine bot status
    let botStatus = 'stopped';
    let currentTask = null;
    let progress = null;

    if (processingPost) {
      botStatus = 'processing';
      currentTask = `Processing post: ${processingPost.id.substring(0, 8)}...`;
      progress = 50; // Placeholder - would come from actual bot
    } else if (processing > 0) {
      botStatus = 'running';
    }

    // Get last activity
    const { data: lastPost } = await supabase
      .from('posts')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get next scheduled check
    const { data: nextPost } = await supabase
      .from('posts')
      .select('scheduled_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .single();

    res.json({
      status: botStatus,
      lastActivity: lastPost?.created_at || null,
      currentTask,
      progress,
      statistics: {
        postsProcessedToday: completed,
        successRate,
        processing,
        failed,
        total,
        nextCheckTime: nextPost?.scheduled_at || null,
      },
    });
  } catch (error) {
    console.error('Error fetching bot status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/bot/logs - Get bot activity logs from bot_logs table
router.get('/logs', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 100, status, startDate, endDate } = req.query;

    // Build query - check if user_id column exists first
    let query = supabase
      .from('bot_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(parseInt(limit));

    // Try to filter by user_id if column exists
    // If column doesn't exist, we'll get all logs (fallback for migration)
    try {
      query = query.eq('user_id', userId);
    } catch (e) {
      // Column doesn't exist yet - will fetch all logs as fallback
      console.warn('user_id column not found in bot_logs, fetching all logs (migration needed)');
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('timestamp', startDate);
    }
    if (endDate) {
      query = query.lte('timestamp', endDate);
    }

    const { data: logs, error } = await query;

    if (error) {
      // Check if error is due to missing user_id column
      if (error.code === '42703' && error.message.includes('user_id')) {
        console.warn('Migration needed: user_id column missing in bot_logs table');
        // Return empty logs with a helpful message
        return res.json({
          logs: [],
          count: 0,
          migrationNeeded: true,
          message: 'Database migration required. Please run migration 002_add_user_id_to_bot_logs.sql'
        });
      }
      
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch logs',
        message: error.message
      });
    }

    // Filter by user_id in memory if column doesn't exist (fallback)
    let filteredLogs = logs || [];
    if (logs && logs.length > 0 && logs[0].user_id === undefined) {
      // Column doesn't exist, return all logs for now
      console.warn('user_id column not found, returning all logs (migration needed)');
    } else if (logs) {
      // Filter by user_id in memory as additional safety
      filteredLogs = logs.filter(log => !log.user_id || log.user_id === userId);
    }

    // Transform logs to match frontend format
    const transformedLogs = (filteredLogs || []).map(log => ({
      id: log.id,
      type: log.status, // 'success', 'error', 'info', 'warning'
      message: log.action,
      timestamp: log.timestamp,
      details: log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : null,
      error: log.error || null,
      rawDetails: log.details, // Keep original for detailed view
    }));

    res.json({
      logs: transformedLogs,
      count: transformedLogs.length,
    });
  } catch (error) {
    console.error('Error fetching bot logs:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;


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

// GET /api/bot/logs - Get bot activity logs
router.get('/logs', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50 } = req.query;

    // Get recent post activities
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch logs',
        message: error.message
      });
    }

    // Transform posts into activity log entries
    const logs = posts.map(post => {
      let type = 'info';
      let message = 'Post created';

      if (post.status === 'completed') {
        type = 'success';
        message = 'Post completed successfully';
      } else if (post.status === 'failed') {
        type = 'error';
        message = 'Post failed';
      } else if (post.status === 'processing') {
        type = 'info';
        message = 'Post processing';
      }

      return {
        type,
        message,
        timestamp: post.updated_at || post.created_at,
        details: `Post ID: ${post.id.substring(0, 8)}...`,
      };
    });

    // Add queue check entries
    logs.push({
      type: 'info',
      message: 'Queue check completed',
      timestamp: new Date().toISOString(),
    });

    res.json({
      logs: logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
      count: logs.length,
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


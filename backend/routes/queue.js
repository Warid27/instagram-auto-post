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

// GET /api/queue - Get pending posts ready for bot processing
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    // Get pending posts scheduled for now or in the past
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          id,
          account_id,
          status,
          account:accounts (
            id,
            instagram_username,
            password_encrypted,
            cookies,
            is_active
          )
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(parseInt(limit));

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch queue',
        message: error.message
      });
    }

    // Filter out posts with inactive accounts
    const filteredPosts = data?.map(post => {
      const activePostAccounts = post.post_accounts?.filter(
        pa => pa.account?.is_active === true
      ) || [];
      
      return {
        ...post,
        post_accounts: activePostAccounts
      };
    }).filter(post => post.post_accounts.length > 0) || [];

    res.json({
      queue: filteredPosts,
      count: filteredPosts.length
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;


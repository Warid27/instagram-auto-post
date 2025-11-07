import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
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

// GET /api/posts - Get all posts for authenticated user
router.get(
  '/',
  authenticateUser,
  [
    query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const userId = req.user.id;
    const { status, limit = 50, offset = 0 } = req.query;

    // Build query
    let query = supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          id,
          account_id,
          status,
          instagram_post_url,
          error_message,
          posted_at,
          account:accounts (
            id,
            instagram_username,
            is_active
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Filter by status if provided
    if (status) {
      const validStatuses = ['pending', 'processing', 'completed', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Validation error',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch posts',
        message: error.message
      });
    }

    res.json({ 
      posts: data || [],
      count: data?.length || 0,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: data?.length === parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/posts/:id - Get a specific post
router.get(
  '/:id',
  authenticateUser,
  [param('id').isUUID().withMessage('Invalid ID')],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          *,
          account:accounts (
            id,
            instagram_username,
            is_active
          )
        )
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Post not found'
        });
      }
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch post',
        message: error.message
      });
    }

    res.json({ post: data });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/posts - Create a new post
router.post(
  '/',
  authenticateUser,
  [
    body('image_url').isString().trim().isLength({ min: 1 }).isURL().withMessage('Valid image URL required'),
    body('caption').isString().trim().isLength({ min: 1 }).escape(),
    body('account_ids').isArray({ min: 1 }),
    body('account_ids.*').isUUID(),
    body('scheduled_at').optional().isISO8601().toDate(),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const userId = req.user.id;
    const { image_url, caption, account_ids, scheduled_at } = req.body;

    // Validate input
    if (!image_url || !image_url.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Image URL is required'
      });
    }

    if (!caption || !caption.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Caption is required'
      });
    }

    if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'At least one account ID is required'
      });
    }

    // Validate all account_ids belong to user and are active
    const { data: userAccounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, is_active')
      .eq('user_id', userId)
      .in('id', account_ids);

    if (accountsError) {
      console.error('Supabase error:', accountsError);
      return res.status(500).json({
        error: 'Failed to validate accounts',
        message: accountsError.message
      });
    }

    if (!userAccounts || userAccounts.length !== account_ids.length) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'One or more account IDs are invalid or do not belong to you'
      });
    }

    // Check if all accounts are active
    const inactiveAccounts = userAccounts.filter(acc => !acc.is_active);
    if (inactiveAccounts.length > 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'One or more accounts are inactive'
      });
    }

    // Set scheduled_at (default to now if not provided)
    const scheduledAt = scheduled_at || new Date().toISOString();

    // Validate scheduled_at is a valid date
    if (isNaN(new Date(scheduledAt).getTime())) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Invalid scheduled_at date format'
      });
    }

    // Create post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        image_url: image_url.trim(),
        caption: caption.trim(),
        status: 'pending',
        scheduled_at: scheduledAt,
      })
      .select()
      .single();

    if (postError) {
      console.error('Supabase error:', postError);
      return res.status(500).json({
        error: 'Failed to create post',
        message: postError.message
      });
    }

    // Create post_accounts entries
    const postAccounts = account_ids.map(accountId => ({
      post_id: post.id,
      account_id: accountId,
      status: 'pending',
    }));

    const { error: postAccountsError } = await supabase
      .from('post_accounts')
      .insert(postAccounts);

    if (postAccountsError) {
      console.error('Supabase error:', postAccountsError);
      
      // Rollback: Delete the post if post_accounts creation fails
      await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      return res.status(500).json({
        error: 'Failed to create post account associations',
        message: postAccountsError.message
      });
    }

    // Fetch complete post with accounts
    const { data: completePost, error: fetchError } = await supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          id,
          account_id,
          status,
          account:accounts (
            id,
            instagram_username
          )
        )
      `)
      .eq('id', post.id)
      .single();

    if (fetchError) {
      console.error('Supabase error:', fetchError);
    }

    res.status(201).json({
      message: 'Post created successfully',
      post: completePost || post
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// PUT /api/posts/:id - Update a post (only if status is 'pending')
router.put(
  '/:id',
  authenticateUser,
  [
    param('id').isUUID(),
    body('caption').optional().isString().trim().isLength({ min: 1 }).escape(),
    body('scheduled_at').optional().isISO8601(),
    body('account_ids').optional().isArray({ min: 1 }),
    body('account_ids.*').optional().isUUID(),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const { id } = req.params;
    const userId = req.user.id;
    const { caption, scheduled_at, account_ids } = req.body;

    // Verify post belongs to user and is pending
    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Post not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch post',
        message: fetchError.message
      });
    }

    if (existingPost.status !== 'pending') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Only posts with status "pending" can be updated'
      });
    }

    // Build update object
    const updates = {};

    if (caption !== undefined) {
      if (!caption.trim()) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Caption cannot be empty'
        });
      }
      updates.caption = caption.trim();
    }

    if (scheduled_at !== undefined) {
      if (isNaN(new Date(scheduled_at).getTime())) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Invalid scheduled_at date format'
        });
      }
      updates.scheduled_at = scheduled_at;
    }

    // Update account selection if provided
    if (account_ids !== undefined) {
      if (!Array.isArray(account_ids) || account_ids.length === 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'At least one account ID is required'
        });
      }

      // Validate all account_ids belong to user
      const { data: userAccounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, is_active')
        .eq('user_id', userId)
        .in('id', account_ids);

      if (accountsError) {
        console.error('Supabase error:', accountsError);
        return res.status(500).json({
          error: 'Failed to validate accounts',
          message: accountsError.message
        });
      }

      if (!userAccounts || userAccounts.length !== account_ids.length) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'One or more account IDs are invalid or do not belong to you'
        });
      }

      // Check if all accounts are active
      const inactiveAccounts = userAccounts.filter(acc => !acc.is_active);
      if (inactiveAccounts.length > 0) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'One or more accounts are inactive'
        });
      }

      // Delete existing post_accounts entries
      const { error: deleteError } = await supabase
        .from('post_accounts')
        .delete()
        .eq('post_id', id);

      if (deleteError) {
        console.error('Supabase error:', deleteError);
        return res.status(500).json({
          error: 'Failed to update account associations',
          message: deleteError.message
        });
      }

      // Create new post_accounts entries
      const postAccounts = account_ids.map(accountId => ({
        post_id: id,
        account_id: accountId,
        status: 'pending',
      }));

      const { error: insertError } = await supabase
        .from('post_accounts')
        .insert(postAccounts);

      if (insertError) {
        console.error('Supabase error:', insertError);
        return res.status(500).json({
          error: 'Failed to create account associations',
          message: insertError.message
        });
      }
    }

    // Update post if there are updates
    if (Object.keys(updates).length > 0) {
      const { data, error: updateError } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('Supabase error:', updateError);
        return res.status(500).json({
          error: 'Failed to update post',
          message: updateError.message
        });
      }
    }

    // Fetch complete updated post
    const { data: completePost, error: fetchError2 } = await supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          id,
          account_id,
          status,
          account:accounts (
            id,
            instagram_username
          )
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError2) {
      console.error('Supabase error:', fetchError2);
    }

    res.json({
      message: 'Post updated successfully',
      post: completePost
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// DELETE /api/posts/:id - Delete a post (only if status is 'pending')
router.delete(
  '/:id',
  authenticateUser,
  [param('id').isUUID()],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const { id } = req.params;
    const userId = req.user.id;

    // Verify post belongs to user and is pending
    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Post not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch post',
        message: fetchError.message
      });
    }

    if (existingPost.status !== 'pending') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Only posts with status "pending" can be deleted'
      });
    }

    // Delete post_accounts first (cascade should handle this, but being explicit)
    const { error: deletePostAccountsError } = await supabase
      .from('post_accounts')
      .delete()
      .eq('post_id', id);

    if (deletePostAccountsError) {
      console.error('Supabase error:', deletePostAccountsError);
      // Continue with post deletion even if this fails
    }

    // Delete post
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return res.status(500).json({
        error: 'Failed to delete post',
        message: deleteError.message
      });
    }

    res.json({ 
      message: 'Post deleted successfully',
      deleted: true
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/posts/:id/retry - Reset failed post to pending
router.post(
  '/:id/retry',
  authenticateUser,
  [param('id').isUUID()],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const { id } = req.params;
    const userId = req.user.id;

    // Verify post belongs to user and is failed
    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Post not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch post',
        message: fetchError.message
      });
    }

    if (existingPost.status !== 'failed') {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Only posts with status "failed" can be retried'
      });
    }

    // Update post status to pending
    const { data: updatedPost, error: updateError } = await supabase
      .from('posts')
      .update({ status: 'pending' })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Supabase error:', updateError);
      return res.status(500).json({
        error: 'Failed to retry post',
        message: updateError.message
      });
    }

    // Clear error messages in post_accounts
    const { error: clearErrorsError } = await supabase
      .from('post_accounts')
      .update({ 
        status: 'pending',
        error_message: null,
        instagram_post_url: null,
        posted_at: null,
      })
      .eq('post_id', id)
      .eq('status', 'failed');

    if (clearErrorsError) {
      console.error('Supabase error:', clearErrorsError);
      // Continue even if this fails
    }

    // Fetch complete post with accounts
    const { data: completePost, error: fetchError2 } = await supabase
      .from('posts')
      .select(`
        *,
        post_accounts (
          id,
          account_id,
          status,
          account:accounts (
            id,
            instagram_username
          )
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError2) {
      console.error('Supabase error:', fetchError2);
    }

    res.json({
      message: 'Post reset to pending successfully',
      post: completePost || updatedPost
    });
  } catch (error) {
    console.error('Error retrying post:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;

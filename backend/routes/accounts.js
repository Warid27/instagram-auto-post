import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { authenticateUser } from '../middleware/auth.js';
import { encryptPassword, decryptPassword } from '../utils/encryption.js';
import { logActivity } from '../utils/activityLogger.js';

dotenv.config();

const router = express.Router();

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/accounts - Get all accounts for authenticated user
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch accounts with stats
    const { data, error } = await supabase
      .from('accounts')
      .select('id, instagram_username, is_active, posts_today, last_post_at, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch accounts',
        message: error.message
      });
    }

    res.json({ 
      accounts: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/accounts/:id - Get a specific account
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('accounts')
      .select('id, instagram_username, is_active, posts_today, last_post_at, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Account not found'
        });
      }
      console.error('Supabase error:', error);
      return res.status(500).json({
        error: 'Failed to fetch account',
        message: error.message
      });
    }

    res.json({ account: data });
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/accounts - Create a new account
router.post(
  '/',
  authenticateUser,
  [
    body('instagram_username').isString().trim().isLength({ min: 1, max: 255 }).escape(),
    body('password').isString().isLength({ min: 6, max: 256 }),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const { instagram_username, password } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!instagram_username || !password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Instagram username and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password must be at least 6 characters'
      });
    }

    // Normalize username (lowercase, trim)
    const normalizedUsername = instagram_username.toLowerCase().trim();

    if (!normalizedUsername) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Instagram username cannot be empty'
      });
    }

    // Check for duplicate username for this user
    const { data: existingAccount, error: checkError } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('instagram_username', normalizedUsername)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Supabase error:', checkError);
      return res.status(500).json({
        error: 'Failed to check for duplicate account',
        message: checkError.message
      });
    }

    if (existingAccount) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this username already exists'
      });
    }

    // Encrypt password using AES
    let password_encrypted;
    try {
      password_encrypted = encryptPassword(password);
    } catch (encryptError) {
      console.error('Password encryption error:', encryptError);
      return res.status(500).json({
        error: 'Failed to encrypt password',
        message: 'Password encryption failed'
      });
    }

    // Insert new account
    const { data, error: insertError } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        instagram_username: normalizedUsername,
        password_encrypted,
        is_active: true,
        posts_today: 0,
      })
      .select('id, instagram_username, is_active, posts_today, last_post_at, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('Supabase error:', insertError);
      return res.status(500).json({
        error: 'Failed to create account',
        message: insertError.message
      });
    }

    // Automatically log in the account to get cookies
    try {
      const { loginAccount } = await import('../services/instagram-login.js');
      await loginAccount(data.id, normalizedUsername, password);
      await logActivity(userId, `Account created and logged in: @${normalizedUsername}`, 'success', {
        accountId: data.id,
        username: normalizedUsername,
      });
    } catch (loginError) {
      console.error('Auto-login error (non-fatal):', loginError);
      await logActivity(userId, `Account created but auto-login failed: @${normalizedUsername}`, 'warning', {
        accountId: data.id,
        username: normalizedUsername,
        error: loginError.message,
      });
      // Don't fail account creation if login fails - user can retry later
    }

    res.status(201).json({
      message: 'Account created successfully. Login in progress...',
      account: data
    });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// PUT /api/accounts/:id - Update account details
router.put(
  '/:id',
  authenticateUser,
  [
    param('id').isUUID().withMessage('Invalid ID'),
    body('instagram_username').optional().isString().trim().isLength({ min: 1, max: 255 }).escape(),
    body('password').optional().isString().isLength({ min: 6, max: 256 }),
    body('is_active').optional().isBoolean(),
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation error', details: errors.array() });
    }
    const { id } = req.params;
    const userId = req.user.id;
    const { instagram_username, password, is_active } = req.body;

    // Verify account belongs to user
    const { data: existingAccount, error: fetchError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Account not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch account',
        message: fetchError.message
      });
    }

    // Build update object
    const updates = {};

    // Update username if provided
    if (instagram_username !== undefined) {
      const normalizedUsername = instagram_username.toLowerCase().trim();
      
      if (!normalizedUsername) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Instagram username cannot be empty'
        });
      }

      // Check for duplicate username (excluding current account)
      if (normalizedUsername !== existingAccount.instagram_username) {
        const { data: duplicateAccount } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('instagram_username', normalizedUsername)
          .neq('id', id)
          .single();

        if (duplicateAccount) {
          return res.status(409).json({
            error: 'Conflict',
            message: 'An account with this username already exists'
          });
        }
      }

      updates.instagram_username = normalizedUsername;
    }

    // Update password if provided
    if (password !== undefined) {
      if (password.length < 6) {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Password must be at least 6 characters'
        });
      }

      try {
        updates.password_encrypted = encryptPassword(password);
      } catch (encryptError) {
        console.error('Password encryption error:', encryptError);
        return res.status(500).json({
          error: 'Failed to encrypt password',
          message: 'Password encryption failed'
        });
      }
      
      // Re-login account with new password to update cookies
      try {
        const { loginAccount } = await import('../services/instagram-login.js');
        await loginAccount(id, updates.instagram_username || existingAccount.instagram_username, password);
      } catch (loginError) {
        console.error('Auto-login error (non-fatal):', loginError);
        // Don't fail update if login fails
      }
    }

    // Update is_active if provided
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({
          error: 'Validation error',
          message: 'is_active must be a boolean'
        });
      }
      updates.is_active = is_active;
    }

    // Check if there are any updates
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'No valid fields to update'
      });
    }

    // Update account
    const { data, error: updateError } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, instagram_username, is_active, posts_today, last_post_at, created_at, updated_at')
      .single();

    if (updateError) {
      console.error('Supabase error:', updateError);
      return res.status(500).json({
        error: 'Failed to update account',
        message: updateError.message
      });
    }

    res.json({
      message: 'Account updated successfully',
      account: data
    });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// DELETE /api/accounts/:id - Delete an account
router.delete(
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
    const { hardDelete = false } = req.query; // Query param to choose soft vs hard delete

    // Verify account belongs to user
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Account not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch account',
        message: fetchError.message
      });
    }

    if (hardDelete === 'true' || hardDelete === true) {
      // Hard delete: Delete related post_accounts first (cascade should handle this, but being explicit)
      const { error: deletePostAccountsError } = await supabase
        .from('post_accounts')
        .delete()
        .eq('account_id', id);

      if (deletePostAccountsError) {
        console.error('Error deleting post_accounts:', deletePostAccountsError);
        // Don't fail the request, just log the error
      }

      // Delete account
      const { error: deleteError } = await supabase
        .from('accounts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Supabase error:', deleteError);
        return res.status(500).json({
          error: 'Failed to delete account',
          message: deleteError.message
        });
      }

      res.json({ 
        message: 'Account deleted permanently',
        deleted: true
      });
    } else {
      // Soft delete: Set is_active = false
      const { data, error: updateError } = await supabase
        .from('accounts')
        .update({ is_active: false })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, instagram_username, is_active')
        .single();

      if (updateError) {
        console.error('Supabase error:', updateError);
        return res.status(500).json({
          error: 'Failed to deactivate account',
          message: updateError.message
        });
      }

      res.json({ 
        message: 'Account deactivated successfully',
        account: data,
        deleted: false
      });
    }
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/accounts/:id/reset-cookies - Clear stored cookies for account
router.get(
  '/:id/reset-cookies',
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

    // Verify account belongs to user
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id, instagram_username')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Account not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch account',
        message: fetchError.message
      });
    }

    // Clear cookies (set to null)
    const { data: updatedAccount, error: updateError } = await supabase
      .from('accounts')
      .update({ cookies: null })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, instagram_username, is_active')
      .single();

    if (updateError) {
      console.error('Supabase error:', updateError);
      return res.status(500).json({
        error: 'Failed to reset cookies',
        message: updateError.message
      });
    }

    res.json({
      message: 'Cookies cleared successfully. Account will need to login again next time.',
      account: updatedAccount
    });
  } catch (error) {
    console.error('Error resetting cookies:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// GET /api/accounts/:id/check-login - Check if account has valid cookies
router.get(
  '/:id/check-login',
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

    // Disable caching for this endpoint
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Fetch account with cookies - force fresh data
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id, instagram_username, cookies')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Account not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch account',
        message: fetchError.message
      });
    }

    // Check if cookies exist and are valid
    const hasCookies = account.cookies && Array.isArray(account.cookies) && account.cookies.length > 0;
    
    // If cookies exist, check if any have expired
    let isExpired = false;
    if (hasCookies) {
      const now = Date.now() / 1000; // Convert to seconds for comparison
      for (const cookie of account.cookies) {
        if (cookie.expires && typeof cookie.expires === 'number' && cookie.expires > 0) {
          if (cookie.expires < now) {
            isExpired = true;
            break;
          }
        }
      }
    }

    const isLoggedIn = hasCookies && !isExpired;

    console.log(`[check-login] Account ${account.instagram_username}: hasCookies=${hasCookies}, isExpired=${isExpired}, isLoggedIn=${isLoggedIn}, cookieCount=${hasCookies ? account.cookies.length : 0}`);

    res.json({
      isLoggedIn,
      hasCookies,
      isExpired,
      account: {
        id: account.id,
        instagram_username: account.instagram_username
      }
    });
  } catch (error) {
    console.error('Error checking login status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/accounts/:id/re-login - Manually trigger re-login for an account
router.post(
  '/:id/re-login',
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

    // Verify account belongs to user and get credentials
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('id, instagram_username, password_encrypted')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Account not found'
        });
      }
      console.error('Supabase error:', fetchError);
      return res.status(500).json({
        error: 'Failed to fetch account',
        message: fetchError.message
      });
    }

    // Decrypt password
    let password;
    try {
      password = decryptPassword(account.password_encrypted);
    } catch (decryptError) {
      return res.status(500).json({
        error: 'Failed to decrypt password',
        message: 'Cannot re-login: password decryption failed'
      });
    }

    // Trigger login
    const { loginAccount } = await import('../services/instagram-login.js');
    const result = await loginAccount(account.id, account.instagram_username, password);

    if (result.success) {
      await logActivity(userId, `Account re-logged in: @${account.instagram_username}`, 'success', {
        accountId: account.id,
        username: account.instagram_username,
      });
      res.json({
        message: 'Account re-logged in successfully',
        account: {
          id: account.id,
          instagram_username: account.instagram_username
        }
      });
    } else {
      await logActivity(userId, `Account re-login failed: @${account.instagram_username}`, 'error', {
        accountId: account.id,
        username: account.instagram_username,
      }, result.error || 'Unknown error during login');
      res.status(500).json({
        error: 'Re-login failed',
        message: result.error || 'Unknown error during login'
      });
    }
  } catch (error) {
    console.error('Error re-logging in account:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;

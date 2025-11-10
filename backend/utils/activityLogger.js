import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client with service role for logging
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Log an activity to the bot_logs table
 * @param {string} userId - User ID who performed the action
 * @param {string} action - Action description (e.g., "Account created", "Post uploaded")
 * @param {string} status - Status: 'success', 'error', 'info', 'warning'
 * @param {object} details - Additional details object
 * @param {string} error - Error message if status is 'error'
 */
export async function logActivity(userId, action, status = 'info', details = {}, error = null) {
  try {
    const logEntry = {
      user_id: userId,
      action,
      status,
      details,
      ...(error && { error }),
    };

    const { error: insertError } = await supabase
      .from('bot_logs')
      .insert(logEntry);

    if (insertError) {
      console.error('Failed to log activity:', insertError);
    }
  } catch (err) {
    console.error('Error in logActivity:', err);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

export default { logActivity };


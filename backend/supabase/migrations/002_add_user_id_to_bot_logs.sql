-- Add user_id column to bot_logs table for multi-user support
ALTER TABLE bot_logs 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_id ON bot_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_logs_user_timestamp ON bot_logs(user_id, timestamp DESC);

-- Enable RLS on bot_logs
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own logs
CREATE POLICY "Users can view their own bot logs"
    ON bot_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Service role can insert logs (for bot and backend)
-- Note: This allows the backend service to insert logs on behalf of users
CREATE POLICY "Service can insert bot logs"
    ON bot_logs FOR INSERT
    WITH CHECK (true);


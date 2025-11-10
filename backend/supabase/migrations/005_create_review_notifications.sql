-- ============================================
-- REVIEW NOTIFICATIONS TABLE
-- Stores notification flags when reviews complete
-- Make idempotent by dropping existing objects first (dev-friendly)
-- ============================================
DROP TABLE IF EXISTS review_notifications CASCADE;
CREATE TABLE IF NOT EXISTS review_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES account_reviews(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    message TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_review_notifications_user_id ON review_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_review_notifications_account_id ON review_notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_review_notifications_status ON review_notifications(status);
CREATE INDEX IF NOT EXISTS idx_review_notifications_read_at ON review_notifications(read_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
ALTER TABLE review_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own review notifications" ON review_notifications;
DROP POLICY IF EXISTS "Service role can insert review notifications" ON review_notifications;
DROP POLICY IF EXISTS "Users can update their own review notifications" ON review_notifications;

CREATE POLICY "Users can view their own review notifications"
    ON review_notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert review notifications"
    ON review_notifications FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update their own review notifications"
    ON review_notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Add post URL to post_accounts table
-- ============================================
-- Note: instagram_post_url already exists, but we'll ensure it's properly indexed

-- ============================================
-- COMMENTS TABLE
-- Stores comments from reviews (including replies)
-- Make idempotent by dropping existing objects first (dev-friendly)
-- ============================================
DROP TABLE IF EXISTS review_comments CASCADE;
CREATE TABLE IF NOT EXISTS review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_post_id UUID NOT NULL REFERENCES account_review_posts(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    comment_text TEXT NOT NULL,
    is_reply BOOLEAN DEFAULT false,
    parent_comment_id UUID REFERENCES review_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_review_comments_review_post_id ON review_comments(review_post_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_parent_comment_id ON review_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_review_comments_username ON review_comments(username);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own review comments" ON review_comments;
DROP POLICY IF EXISTS "Users can insert their own review comments" ON review_comments;
DROP POLICY IF EXISTS "Users can delete their own review comments" ON review_comments;

-- Policy: Users can only see comments for their own reviews
CREATE POLICY "Users can view their own review comments"
    ON review_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM account_review_posts arp
            JOIN account_reviews ar ON ar.id = arp.review_id
            WHERE arp.id = review_comments.review_post_id
            AND ar.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own review comments"
    ON review_comments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM account_review_posts arp
            JOIN account_reviews ar ON ar.id = arp.review_id
            WHERE arp.id = review_comments.review_post_id
            AND ar.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own review comments"
    ON review_comments FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM account_review_posts arp
            JOIN account_reviews ar ON ar.id = arp.review_id
            WHERE arp.id = review_comments.review_post_id
            AND ar.user_id = auth.uid()
        )
    );


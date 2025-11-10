-- ============================================
-- ACCOUNT REVIEWS TABLE
-- Stores account-level review data (posts count, followers, following)
-- ============================================
CREATE TABLE IF NOT EXISTS account_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    review_datetime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    posts_count INTEGER,
    followers_count INTEGER,
    following_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ACCOUNT REVIEW POSTS TABLE
-- Stores post-level review data (views, likes, comments) for each review
-- ============================================
CREATE TABLE IF NOT EXISTS account_review_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES account_reviews(id) ON DELETE CASCADE,
    post_url TEXT NOT NULL,
    views_count INTEGER,
    likes_count INTEGER,
    comments_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_account_reviews_account_id ON account_reviews(account_id);
CREATE INDEX IF NOT EXISTS idx_account_reviews_user_id ON account_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_account_reviews_review_datetime ON account_reviews(review_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_account_reviews_account_datetime ON account_reviews(account_id, review_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_account_review_posts_review_id ON account_review_posts(review_id);
CREATE INDEX IF NOT EXISTS idx_account_review_posts_post_url ON account_review_posts(post_url);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
DROP TRIGGER IF EXISTS update_account_reviews_updated_at ON account_reviews;
CREATE TRIGGER update_account_reviews_updated_at
    BEFORE UPDATE ON account_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
ALTER TABLE account_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_review_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own account reviews
CREATE POLICY "Users can view their own account reviews"
    ON account_reviews FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own account reviews"
    ON account_reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own account reviews"
    ON account_reviews FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own account reviews"
    ON account_reviews FOR DELETE
    USING (auth.uid() = user_id);

-- Policy: Users can only see review posts for their own reviews
CREATE POLICY "Users can view their own review posts"
    ON account_review_posts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM account_reviews
            WHERE account_reviews.id = account_review_posts.review_id
            AND account_reviews.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own review posts"
    ON account_review_posts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM account_reviews
            WHERE account_reviews.id = account_review_posts.review_id
            AND account_reviews.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own review posts"
    ON account_review_posts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM account_reviews
            WHERE account_reviews.id = account_review_posts.review_id
            AND account_reviews.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM account_reviews
            WHERE account_reviews.id = account_review_posts.review_id
            AND account_reviews.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own review posts"
    ON account_review_posts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM account_reviews
            WHERE account_reviews.id = account_review_posts.review_id
            AND account_reviews.user_id = auth.uid()
        )
    );


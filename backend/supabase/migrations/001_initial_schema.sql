-- Enable UUID extension
-- Supabase uses gen_random_uuid() which is built-in (PostgreSQL 13+)
-- If you need uuid-ossp, uncomment the line below, but gen_random_uuid() is preferred
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- ============================================
-- 1. ACCOUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    instagram_username VARCHAR(255) NOT NULL UNIQUE,
    password_encrypted TEXT NOT NULL,
    cookies JSONB,
    is_active BOOLEAN DEFAULT true,
    posts_today INTEGER DEFAULT 0,
    last_post_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. POST_ACCOUNTS TABLE (Junction Table)
-- ============================================
CREATE TABLE IF NOT EXISTS post_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    instagram_post_url TEXT,
    error_message TEXT,
    posted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ensure a post can only be associated with an account once
    UNIQUE(post_id, account_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Accounts table indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_instagram_username ON accounts(instagram_username);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active);

-- Posts table indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);

-- Post_accounts table indexes
CREATE INDEX IF NOT EXISTS idx_post_accounts_post_id ON post_accounts(post_id);
CREATE INDEX IF NOT EXISTS idx_post_accounts_account_id ON post_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_post_accounts_status ON post_accounts(status);
CREATE INDEX IF NOT EXISTS idx_post_accounts_post_id_account_id ON post_accounts(post_id, account_id);

-- ============================================
-- 4. BOT_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bot_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    details JSONB,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_bot_logs_timestamp ON bot_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_bot_logs_status ON bot_logs(status);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================

-- Trigger for accounts table
DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for posts table
DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for post_accounts table
DROP TRIGGER IF EXISTS update_post_accounts_updated_at ON post_accounts;
CREATE TRIGGER update_post_accounts_updated_at
    BEFORE UPDATE ON post_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own accounts
CREATE POLICY "Users can view their own accounts"
    ON accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own accounts"
    ON accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own accounts"
    ON accounts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own accounts"
    ON accounts FOR DELETE
    USING (auth.uid() = user_id);

-- Policy: Users can only see their own posts
CREATE POLICY "Users can view their own posts"
    ON posts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own posts"
    ON posts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
    ON posts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
    ON posts FOR DELETE
    USING (auth.uid() = user_id);

-- Policy: Users can only see post_accounts for their own posts
CREATE POLICY "Users can view their own post_accounts"
    ON post_accounts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_accounts.post_id
            AND posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own post_accounts"
    ON post_accounts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_accounts.post_id
            AND posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own post_accounts"
    ON post_accounts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_accounts.post_id
            AND posts.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_accounts.post_id
            AND posts.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own post_accounts"
    ON post_accounts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM posts
            WHERE posts.id = post_accounts.post_id
            AND posts.user_id = auth.uid()
        )
    );


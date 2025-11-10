-- ============================================
-- 000_fresh_start.sql
-- Development-only: drop all project tables/policies to start fresh.
-- Safe to re-run (idempotent). After running this, apply 001+ migrations.
-- ============================================

-- Drop review-related tables first to avoid FK issues
DROP TABLE IF EXISTS review_comments CASCADE;
DROP TABLE IF EXISTS review_notifications CASCADE;
DROP TABLE IF EXISTS account_review_posts CASCADE;
DROP TABLE IF EXISTS account_reviews CASCADE;

-- Drop posting-related tables
DROP TABLE IF EXISTS post_accounts CASCADE;
DROP TABLE IF EXISTS posts CASCADE;

-- Core tables
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS bot_logs CASCADE;

-- Utility functions/triggers
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Note:
-- After running this migration, run:
--   npm run migrate 001
--   npm run migrate 002
--   npm run migrate 003
--   npm run migrate 004
--   npm run migrate 005
-- Or with Supabase CLI:
--   supabase db push



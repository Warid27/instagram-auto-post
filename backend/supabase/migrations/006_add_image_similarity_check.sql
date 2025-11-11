-- ============================================
-- Add image similarity check fields to post_accounts table
-- ============================================

-- Add columns for image similarity checking
ALTER TABLE post_accounts
ADD COLUMN IF NOT EXISTS image_similarity_checked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS image_similarity_score DECIMAL(5, 4), -- 0.0000 to 1.0000
ADD COLUMN IF NOT EXISTS image_similarity_checked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS image_similarity_error TEXT;

-- Add index for faster queries on unchecked posts
CREATE INDEX IF NOT EXISTS idx_post_accounts_similarity_checked 
ON post_accounts(status, image_similarity_checked) 
WHERE status = 'completed' AND image_similarity_checked = false;

-- Add comment for documentation
COMMENT ON COLUMN post_accounts.image_similarity_checked IS 'Whether the image similarity check has been performed';
COMMENT ON COLUMN post_accounts.image_similarity_score IS 'Similarity score between original and posted image (0.0 to 1.0, where 1.0 is identical)';
COMMENT ON COLUMN post_accounts.image_similarity_checked_at IS 'Timestamp when similarity check was performed';
COMMENT ON COLUMN post_accounts.image_similarity_error IS 'Error message if similarity check failed';


# Supabase Storage Setup

To enable image uploads, you need to set up a Supabase Storage bucket:

1. Go to your Supabase project dashboard
2. Navigate to Storage
3. Create a new bucket named `instagram-posts`
4. Set the bucket to **Public** (or configure RLS policies)
5. Enable file size limits (max 8MB recommended)

## RLS Policies (if using private bucket)

If you want to keep the bucket private, add these RLS policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Users can upload their own files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'instagram-posts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'instagram-posts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```


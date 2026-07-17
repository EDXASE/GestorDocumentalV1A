/*
# Storage bucket: document-pdfs

Creates the private storage bucket for PDF files and RLS policies
allowing authenticated users to upload and read.
*/

-- Create bucket (private, PDF only, 10 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-pdfs',
  'document-pdfs',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload PDFs
DROP POLICY IF EXISTS "auth_upload_pdfs" ON storage.objects;
CREATE POLICY "auth_upload_pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'document-pdfs');

-- Allow authenticated users to read PDFs (document-level RLS in DB provides scope)
DROP POLICY IF EXISTS "auth_read_pdfs" ON storage.objects;
CREATE POLICY "auth_read_pdfs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'document-pdfs');

-- Allow authenticated users to update metadata
DROP POLICY IF EXISTS "auth_update_pdfs" ON storage.objects;
CREATE POLICY "auth_update_pdfs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'document-pdfs');

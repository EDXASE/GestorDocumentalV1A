
-- ============================================================
-- FIX: Infinite recursion in RLS policies
-- 
-- Root cause: policies on branches/documents/etc. do
-- `SELECT FROM profiles` to check admin role, but profiles
-- SELECT policy also does `SELECT FROM profiles` → recursion.
--
-- Fix: SECURITY DEFINER helper function that bypasses RLS
-- when checking the caller's role.
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND r.name = 'ADMINISTRADOR'
      AND p.is_active = true
  );
$$;

-- ============================================================
-- PROFILES policies — replace self-referential EXISTS with is_admin()
-- ============================================================

DROP POLICY IF EXISTS "read_own_or_all_profile" ON profiles;
CREATE POLICY "read_own_or_all_profile" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id OR is_admin()
  );

DROP POLICY IF EXISTS "update_own_or_all_profile" ON profiles;
CREATE POLICY "update_own_or_all_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "admin_insert_profile" ON profiles;
CREATE POLICY "admin_insert_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_profile" ON profiles;
CREATE POLICY "admin_delete_profile" ON profiles FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- BRANCHES policies
-- ============================================================

DROP POLICY IF EXISTS "admin_insert_branches" ON branches;
CREATE POLICY "admin_insert_branches" ON branches FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_branches" ON branches;
CREATE POLICY "admin_update_branches" ON branches FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_branches" ON branches;
CREATE POLICY "admin_delete_branches" ON branches FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- BRANCH PROCESSOR ASSIGNMENTS policies
-- ============================================================

DROP POLICY IF EXISTS "admin_insert_assignments" ON branch_processor_assignments;
CREATE POLICY "admin_insert_assignments" ON branch_processor_assignments FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_assignments" ON branch_processor_assignments;
CREATE POLICY "admin_update_assignments" ON branch_processor_assignments FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_assignments" ON branch_processor_assignments;
CREATE POLICY "admin_delete_assignments" ON branch_processor_assignments FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- DOCUMENTS policies
-- ============================================================

DROP POLICY IF EXISTS "insert_documents" ON documents;
CREATE POLICY "insert_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (
    uploaded_by = auth.uid() OR is_admin()
  );

DROP POLICY IF EXISTS "update_documents" ON documents;
CREATE POLICY "update_documents" ON documents FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM branch_processor_assignments bpa
      WHERE bpa.processor_id = auth.uid()
        AND bpa.branch_id = documents.branch_id
        AND bpa.is_active = true
    )
  )
  WITH CHECK (
    uploaded_by = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM branch_processor_assignments bpa
      WHERE bpa.processor_id = auth.uid()
        AND bpa.branch_id = documents.branch_id
        AND bpa.is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_delete_documents" ON documents;
CREATE POLICY "admin_delete_documents" ON documents FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- DOCUMENT PDFs policies
-- ============================================================

DROP POLICY IF EXISTS "insert_pdfs" ON document_pdfs;
CREATE POLICY "insert_pdfs" ON document_pdfs FOR INSERT
  TO authenticated WITH CHECK (
    uploaded_by = auth.uid() OR is_admin()
  );

DROP POLICY IF EXISTS "admin_delete_pdfs" ON document_pdfs;
CREATE POLICY "admin_delete_pdfs" ON document_pdfs FOR DELETE
  TO authenticated USING (is_admin());

-- ============================================================
-- DOCUMENT COMMENTS policies
-- ============================================================

DROP POLICY IF EXISTS "delete_own_comments" ON document_comments;
CREATE POLICY "delete_own_comments" ON document_comments FOR DELETE
  TO authenticated USING (
    user_id = auth.uid() OR is_admin()
  );

-- ============================================================
-- AUDIT LOG policies
-- ============================================================

DROP POLICY IF EXISTS "read_own_or_all_audit" ON audit_log;
CREATE POLICY "read_own_or_all_audit" ON audit_log FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR is_admin()
  );

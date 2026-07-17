-- Allow any authenticated user to INSERT their own login event.
-- This is intentionally narrow: only action='LOGIN', user_id must match the caller.
-- All other audit writes still go through service-role edge functions.
DROP POLICY IF EXISTS "insert_own_login_audit" ON audit_log;
CREATE POLICY "insert_own_login_audit" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND action = 'LOGIN');

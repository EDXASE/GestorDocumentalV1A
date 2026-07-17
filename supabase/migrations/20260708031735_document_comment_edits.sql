-- ============================================================
-- DOCUMENT COMMENT EDITS
-- Preserves full audit trail when admins correct comment text.
-- The original text is never destroyed; every edit is logged.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_comment_edits (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid        NOT NULL REFERENCES document_comments(id) ON DELETE CASCADE,
  -- text BEFORE this edit was applied
  previous_text text     NOT NULL,
  -- text AFTER this edit was applied (equals document_comments.comment at that moment)
  new_text      text     NOT NULL,
  -- mandatory justification supplied by the administrator
  reason        text     NOT NULL,
  edited_by     uuid     NOT NULL REFERENCES profiles(id),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE document_comment_edits ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the correction history (transparency + audit)
CREATE POLICY "authenticated_read_comment_edits" ON document_comment_edits
  FOR SELECT TO authenticated USING (true);

-- No direct INSERT / UPDATE / DELETE for any role —
-- all writes go through the correct-comment edge function (service role).

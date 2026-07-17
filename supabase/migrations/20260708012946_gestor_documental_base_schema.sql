/*
# GESTOR DOCUMENTAL - Base Schema

## Purpose
Enterprise document management system with four roles (ADMINISTRADOR, CARGADOR, PROCESADOR, CONSULTOR).
This migration creates the foundational schema: roles, users, branches, processor-branch assignments,
document types (Caja General / Caja Chica), PDF files, document states, comments, movement history, and audit log.

## 1. New Tables

### `roles`
- Lookup table for the four system roles.
- `id` (uuid PK), `name` (text, unique) — one of: ADMINISTRADOR, CARGADOR, PROCESADOR, CONSULTOR.
- `description` (text).

### `branches` (sucursales)
- `id` (uuid PK), `code` (text unique), `name` (text), `description` (text).
- `is_active` (boolean default true).
- `created_at`, `updated_at`.

### `profiles`
- Extends Supabase `auth.users` with business data (role, branch, display name).
- `id` (uuid PK, FK to auth.users ON DELETE CASCADE, DEFAULT auth.uid()).
- `role_id` (uuid FK to roles).
- `branch_id` (uuid FK to branches, nullable — admin/consultor may not belong to a branch).
- `full_name` (text), `is_active` (boolean default true).
- `created_at`, `updated_at` (timestamptz).

### `branch_processor_assignments`
- Links PROCESADOR users to branches (many-to-many).
- `id` (uuid PK), `processor_id` (uuid FK to profiles), `branch_id` (uuid FK to branches).
- `is_active` (boolean default true), `assigned_at` (timestamptz default now()).
- Unique constraint on (processor_id, branch_id).

### `document_types`
- Lookup: CAJA_GENERAL, CAJA_CHICA.
- `id` (uuid PK), `code` (text unique), `name` (text), `description` (text).

### `document_states`
- Lookup: PENDIENTE, APROBADO, RECHAZADO, ANULADO.
- `id` (uuid PK), `code` (text unique), `name` (text), `description` (text).
- `is_terminal` (boolean) — true for APROBADO/ANULADO (no further transitions).

### `documents`
- Core table. Each document is a Caja General or Caja Chica record.
- `id` (uuid PK), `document_number` (text, unique per branch — composite unique with branch_id).
- `document_type_id` (uuid FK to document_types).
- `branch_id` (uuid FK to branches).
- `state_id` (uuid FK to document_states).
- `uploaded_by` (uuid FK to profiles — the CARGADOR who created it).
- `processed_by` (uuid FK to profiles, nullable — the PROCESADOR who last acted on it).
- `document_date` (date), `amount` (numeric(14,2)), `description` (text).
- `created_at`, `updated_at`.

### `document_pdfs`
- PDF files attached to documents. A document can have multiple PDFs.
- `id` (uuid PK), `document_id` (uuid FK to documents ON DELETE CASCADE).
- `file_name` (text), `file_path` (text — Supabase Storage path), `file_size` (bigint), `content_type` (text).
- `uploaded_by` (uuid FK to profiles).
- `created_at`.

### `document_comments`
- Comments left by users on documents (e.g. during processing/review).
- `id` (uuid PK), `document_id` (uuid FK to documents ON DELETE CASCADE).
- `user_id` (uuid FK to profiles), `comment` (text).
- `created_at`.

### `document_history`
- Movement history: every state transition or action on a document.
- `id` (uuid PK), `document_id` (uuid FK to documents ON DELETE CASCADE).
- `user_id` (uuid FK to profiles — who performed the action).
- `from_state_id` (uuid FK to document_states, nullable — null for creation).
- `to_state_id` (uuid FK to document_states, nullable).
- `action` (text — e.g. CREATE, APPROVE, REJECT, ANNUL, ASSIGN).
- `notes` (text).
- `created_at`.

### `audit_log`
- System-wide audit trail (logins, config changes, etc.).
- `id` (uuid PK), `user_id` (uuid FK to profiles, nullable — nullable for system events).
- `action` (text), `entity_type` (text), `entity_id` (uuid, nullable).
- `details` (jsonb), `ip_address` (text, nullable), `user_agent` (text, nullable).
- `created_at`.

## 2. Relationships
- profiles.id → auth.users.id (1:1)
- profiles.role_id → roles.id (N:1)
- profiles.branch_id → branches.id (N:1, nullable)
- branch_processor_assignments.processor_id → profiles.id (N:1)
- branch_processor_assignments.branch_id → branches.id (N:1)
- documents.document_type_id → document_types.id (N:1)
- documents.branch_id → branches.id (N:1)
- documents.state_id → document_states.id (N:1)
- documents.uploaded_by → profiles.id (N:1)
- documents.processed_by → profiles.id (N:1, nullable)
- document_pdfs.document_id → documents.id (N:1, CASCADE)
- document_comments.document_id → documents.id (N:1, CASCADE)
- document_history.document_id → documents.id (N:1, CASCADE)
- document_history.from_state_id → document_states.id (N:1, nullable)
- document_history.to_state_id → document_states.id (N:1, nullable)
- audit_log.user_id → profiles.id (N:1, nullable)

## 3. Security (RLS)
- RLS enabled on ALL tables.
- profiles: each authenticated user can read/update their own profile; admins can read all.
- branches: authenticated users can read; only admins can write.
- branch_processor_assignments: authenticated users can read; only admins can write.
- documents: authenticated users can read (scoped by role in app logic); owner/admin/assigned-processor can write.
- document_pdfs, document_comments, document_history: authenticated users can read; owner/admin can write.
- audit_log: authenticated users can read their own entries; only admins can read all.
- Lookup tables (roles, document_types, document_states): readable by all authenticated users.

## 4. Important Notes
1. This migration is idempotent — safe to re-run.
2. Policies are dropped before creation to avoid duplicate-policy errors on re-run.
3. The `profiles` table uses `DEFAULT auth.uid()` so inserts from the client work without passing the id.
4. Role-based access control (what each role can see/do) is enforced at the application layer; RLS provides row-level ownership protection.
5. Seed data for roles, document_types, and document_states is included.
6. Tables are created first, then policies, to resolve the circular dependency between branches and profiles.
*/

-- ============================================================
-- LOOKUP TABLES (no dependencies)
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- BRANCHES (no FK dependencies)
-- ============================================================

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- PROFILES (depends on roles + branches)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  branch_id uuid REFERENCES branches(id),
  full_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- BRANCH PROCESSOR ASSIGNMENTS (depends on profiles + branches)
-- ============================================================

CREATE TABLE IF NOT EXISTS branch_processor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (processor_id, branch_id)
);

-- ============================================================
-- DOCUMENTS (depends on document_types, branches, profiles, document_states)
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL,
  document_type_id uuid NOT NULL REFERENCES document_types(id),
  branch_id uuid NOT NULL REFERENCES branches(id),
  state_id uuid NOT NULL REFERENCES document_states(id),
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  processed_by uuid REFERENCES profiles(id),
  document_date date NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, document_number)
);

-- ============================================================
-- DOCUMENT PDFs (depends on documents + profiles)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  content_type text DEFAULT 'application/pdf',
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- DOCUMENT COMMENTS (depends on documents + profiles)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  comment text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- DOCUMENT HISTORY (depends on documents, profiles, document_states)
-- ============================================================

CREATE TABLE IF NOT EXISTS document_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  from_state_id uuid REFERENCES document_states(id),
  to_state_id uuid REFERENCES document_states(id),
  action text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- AUDIT LOG (depends on profiles)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_processor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: Lookup tables (read-only for authenticated)
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_roles" ON roles;
CREATE POLICY "authenticated_read_roles" ON roles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_document_types" ON document_types;
CREATE POLICY "authenticated_read_document_types" ON document_types FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_document_states" ON document_states;
CREATE POLICY "authenticated_read_document_states" ON document_states FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- POLICIES: Branches (read all, admin write)
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_branches" ON branches;
CREATE POLICY "authenticated_read_branches" ON branches FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_branches" ON branches;
CREATE POLICY "admin_insert_branches" ON branches FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_update_branches" ON branches;
CREATE POLICY "admin_update_branches" ON branches FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_delete_branches" ON branches;
CREATE POLICY "admin_delete_branches" ON branches FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

-- ============================================================
-- POLICIES: Profiles (own read/update, admin all)
-- ============================================================

DROP POLICY IF EXISTS "read_own_or_all_profile" ON profiles;
CREATE POLICY "read_own_or_all_profile" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "update_own_or_all_profile" ON profiles;
CREATE POLICY "update_own_or_all_profile" ON profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  ) WITH CHECK (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_insert_profile" ON profiles;
CREATE POLICY "admin_insert_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_delete_profile" ON profiles;
CREATE POLICY "admin_delete_profile" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

-- ============================================================
-- POLICIES: Branch Processor Assignments (read all, admin write)
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_assignments" ON branch_processor_assignments;
CREATE POLICY "authenticated_read_assignments" ON branch_processor_assignments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_assignments" ON branch_processor_assignments;
CREATE POLICY "admin_insert_assignments" ON branch_processor_assignments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_update_assignments" ON branch_processor_assignments;
CREATE POLICY "admin_update_assignments" ON branch_processor_assignments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_delete_assignments" ON branch_processor_assignments;
CREATE POLICY "admin_delete_assignments" ON branch_processor_assignments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

-- ============================================================
-- POLICIES: Documents
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_documents" ON documents;
CREATE POLICY "authenticated_read_documents" ON documents FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_documents" ON documents;
CREATE POLICY "insert_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "update_documents" ON documents;
CREATE POLICY "update_documents" ON documents FOR UPDATE
  TO authenticated USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
    OR EXISTS (
      SELECT 1 FROM branch_processor_assignments bpa
      WHERE bpa.processor_id = auth.uid()
        AND bpa.branch_id = documents.branch_id
        AND bpa.is_active = true
    )
  ) WITH CHECK (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
    OR EXISTS (
      SELECT 1 FROM branch_processor_assignments bpa
      WHERE bpa.processor_id = auth.uid()
        AND bpa.branch_id = documents.branch_id
        AND bpa.is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_delete_documents" ON documents;
CREATE POLICY "admin_delete_documents" ON documents FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

-- ============================================================
-- POLICIES: Document PDFs
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_pdfs" ON document_pdfs;
CREATE POLICY "authenticated_read_pdfs" ON document_pdfs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_pdfs" ON document_pdfs;
CREATE POLICY "insert_pdfs" ON document_pdfs FOR INSERT
  TO authenticated WITH CHECK (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "admin_delete_pdfs" ON document_pdfs;
CREATE POLICY "admin_delete_pdfs" ON document_pdfs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

-- ============================================================
-- POLICIES: Document Comments
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_comments" ON document_comments;
CREATE POLICY "authenticated_read_comments" ON document_comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_comments" ON document_comments;
CREATE POLICY "insert_comments" ON document_comments FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_comments" ON document_comments;
CREATE POLICY "delete_own_comments" ON document_comments FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

-- ============================================================
-- POLICIES: Document History
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_history" ON document_history;
CREATE POLICY "authenticated_read_history" ON document_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_history" ON document_history;
CREATE POLICY "insert_history" ON document_history FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- POLICIES: Audit Log
-- ============================================================

DROP POLICY IF EXISTS "read_own_or_all_audit" ON audit_log;
CREATE POLICY "read_own_or_all_audit" ON audit_log FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p JOIN roles r ON p.role_id = r.id
               WHERE p.id = auth.uid() AND r.name = 'ADMINISTRADOR')
  );

DROP POLICY IF EXISTS "insert_audit" ON audit_log;
CREATE POLICY "insert_audit" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() OR user_id IS NULL
  );

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_assignments_processor ON branch_processor_assignments(processor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_branch ON branch_processor_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_documents_branch_type ON documents(branch_id, document_type_id);
CREATE INDEX IF NOT EXISTS idx_documents_state ON documents(state_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_processed_by ON documents(processed_by);
CREATE INDEX IF NOT EXISTS idx_pdfs_document ON document_pdfs(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_document ON document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_history_document ON document_history(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO roles (name, description) VALUES
  ('ADMINISTRADOR', 'Acceso total: usuarios, sucursales, asignaciones, configuracion y auditoria'),
  ('CARGADOR', 'Carga documentos de Caja General y Caja Chica, sube PDFs'),
  ('PROCESADOR', 'Procesa y revisa documentos asignados a sus sucursales, cambia estados'),
  ('CONSULTOR', 'Consulta documentos y reportes, sin permisos de modificacion')
ON CONFLICT (name) DO NOTHING;

INSERT INTO document_types (code, name, description) VALUES
  ('CAJA_GENERAL', 'Caja General', 'Documentos de Caja General'),
  ('CAJA_CHICA', 'Caja Chica', 'Documentos de Caja Chica')
ON CONFLICT (code) DO NOTHING;

INSERT INTO document_states (code, name, description, is_terminal) VALUES
  ('PENDIENTE', 'Pendiente', 'Documento cargado, pendiente de procesamiento', false),
  ('APROBADO', 'Aprobado', 'Documento aprobado por el procesador', true),
  ('RECHAZADO', 'Rechazado', 'Documento rechazado, requiere correccion', false),
  ('ANULADO', 'Anulado', 'Documento anulado, no procede', true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_branches_updated_at ON branches;
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

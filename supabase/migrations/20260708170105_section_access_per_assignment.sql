-- Add per-branch section access to processor assignments
ALTER TABLE branch_processor_assignments
  ADD COLUMN IF NOT EXISTS can_caja_general boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_caja_chica boolean NOT NULL DEFAULT true;

-- Remove unused section columns from profiles (added in previous migration)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS can_caja_general,
  DROP COLUMN IF EXISTS can_caja_chica;

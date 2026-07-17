ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_caja_general boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_caja_chica boolean NOT NULL DEFAULT true;

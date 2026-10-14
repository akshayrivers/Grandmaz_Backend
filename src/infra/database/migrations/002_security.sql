-- 002_security.sql — Phase 0 security & pairing foundation.
-- Idempotent: safe to run more than once. Requires 001_initial_schema.sql.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Devices: key algorithm, display name, push token
ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_algorithm VARCHAR(20) NOT NULL DEFAULT 'RSA';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devices_key_algorithm_check') THEN
    ALTER TABLE devices ADD CONSTRAINT devices_key_algorithm_check CHECK (key_algorithm IN ('RSA', 'EC_P256'));
  END IF;
END $$;

-- Server-side challenges (only the SHA-256 hash is stored; single use, short TTL)
CREATE TABLE IF NOT EXISTS device_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  challenge_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_challenges_device ON device_challenges(device_id);

-- Device bearer tokens (only the SHA-256 hash is stored)
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_device ON device_tokens(device_id);

-- Invitations: hashed token, pairing code, role, provenance
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS token_hash CHAR(64);
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS pairing_code_hash CHAR(64);
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS code_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'primary';
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS created_by_device UUID REFERENCES devices(id) ON DELETE SET NULL;
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE caretaker_invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'caretaker_invitations' AND column_name = 'token'
  ) THEN
    UPDATE caretaker_invitations
      SET token_hash = encode(digest(token, 'sha256'), 'hex')
      WHERE token_hash IS NULL;
    -- Legacy invitations have no pairing code and can no longer be accepted.
    UPDATE caretaker_invitations
      SET revoked_at = NOW()
      WHERE accepted_at IS NULL AND revoked_at IS NULL AND pairing_code_hash IS NULL;
    DROP INDEX IF EXISTS idx_invitations_token;
    ALTER TABLE caretaker_invitations DROP COLUMN token;
  END IF;
END $$;

ALTER TABLE caretaker_invitations ALTER COLUMN token_hash SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash ON caretaker_invitations(token_hash);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caretaker_invitations_role_check') THEN
    UPDATE caretaker_invitations SET role = 'caretaker' WHERE role NOT IN ('primary', 'caretaker', 'viewer');
    ALTER TABLE caretaker_invitations ADD CONSTRAINT caretaker_invitations_role_check
      CHECK (role IN ('primary', 'caretaker', 'viewer'));
  END IF;
END $$;

-- Device caretakers: fixed role set + exactly one active primary per device
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_caretakers_role_check') THEN
    UPDATE device_caretakers SET role = 'caretaker' WHERE role NOT IN ('primary', 'caretaker', 'viewer');
    -- Keep the earliest active primary per device; demote the rest.
    UPDATE device_caretakers dc
      SET role = 'caretaker', updated_at = NOW()
      WHERE dc.role = 'primary' AND dc.status = 'active'
        AND dc.id <> (
          SELECT first.id FROM device_caretakers first
          WHERE first.device_id = dc.device_id AND first.role = 'primary' AND first.status = 'active'
          ORDER BY first.created_at ASC, first.id ASC
          LIMIT 1
        );
    ALTER TABLE device_caretakers ADD CONSTRAINT device_caretakers_role_check
      CHECK (role IN ('primary', 'caretaker', 'viewer'));
  END IF;
END $$;

ALTER TABLE device_caretakers ALTER COLUMN role SET DEFAULT 'caretaker';
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_caretakers_one_primary
  ON device_caretakers(device_id) WHERE role = 'primary' AND status = 'active';

-- Users: phone number for SOS calls
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(16);

-- Tasks: expiry and delivery tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
UPDATE tasks SET expires_at = created_at + INTERVAL '1 hour' WHERE expires_at IS NULL;
ALTER TABLE tasks ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '1 hour';
ALTER TABLE tasks ALTER COLUMN expires_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_device_status ON tasks(device_id, status);
